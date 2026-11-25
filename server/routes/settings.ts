import { Router } from 'express';
import { db, writeAuditLog } from '../db.ts';
import { authenticate, requireRoles, type AuthenticatedRequest } from '../middleware/auth.ts';
import { isGeminiConfigured } from '../services/geminiService.ts';

const router = Router();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface SystemSettingsPayload {
  allowPublicRegistration: boolean;
  defaultTrialDays: number;
  defaultWidgetRateLimitPerMin: number;
  conversationRetentionDays: number;
  maintenanceMode: boolean;
  supportContactEmail: string;
}

function loadSystemSettingsObject(): SystemSettingsPayload {
  const rows = db
    .prepare(`SELECT SettingKey, SettingValue FROM SystemSettings`)
    .all() as Array<{ SettingKey: string; SettingValue: string }>;

  const map = new Map(rows.map((r) => [r.SettingKey, r.SettingValue]));
  return {
    allowPublicRegistration: (map.get('AllowPublicRegistration') ?? 'true') !== 'false',
    defaultTrialDays: Math.max(0, Number(map.get('DefaultTrialDays') ?? 14) || 14),
    defaultWidgetRateLimitPerMin: Math.max(5, Number(map.get('DefaultWidgetRateLimitPerMin') ?? 60) || 60),
    conversationRetentionDays: Math.max(7, Number(map.get('ConversationRetentionDays') ?? 365) || 365),
    maintenanceMode: map.get('MaintenanceMode') === 'true',
    supportContactEmail: map.get('SupportContactEmail') ?? 'support@chatpilot.local',
  };
}

// Super Admin: Get Platform System Settings
router.get('/settings', authenticate, requireRoles('SuperAdmin'), (_req, res) => {
  res.json({
    success: true,
    data: loadSystemSettingsObject(),
  });
});

// Super Admin: Update Platform System Settings
router.put('/settings', authenticate, requireRoles('SuperAdmin'), (req: AuthenticatedRequest, res) => {
  const allowPublicRegistration = Boolean(req.body?.allowPublicRegistration);
  const maintenanceMode = Boolean(req.body?.maintenanceMode);
  const defaultTrialDays = Number(req.body?.defaultTrialDays);
  const defaultWidgetRateLimitPerMin = Number(req.body?.defaultWidgetRateLimitPerMin);
  const conversationRetentionDays = Number(req.body?.conversationRetentionDays);
  const supportContactEmail =
    typeof req.body?.supportContactEmail === 'string' ? req.body.supportContactEmail.trim() : '';

  if (!Number.isInteger(defaultTrialDays) || defaultTrialDays < 0 || defaultTrialDays > 90) {
    res.status(400).json({ success: false, message: 'Default trial days must be between 0 and 90.' });
    return;
  }
  if (
    !Number.isInteger(defaultWidgetRateLimitPerMin) ||
    defaultWidgetRateLimitPerMin < 5 ||
    defaultWidgetRateLimitPerMin > 1000
  ) {
    res.status(400).json({ success: false, message: 'Widget rate limit must be between 5 and 1000 req/min.' });
    return;
  }
  if (
    !Number.isInteger(conversationRetentionDays) ||
    conversationRetentionDays < 7 ||
    conversationRetentionDays > 3650
  ) {
    res.status(400).json({ success: false, message: 'Conversation retention must be between 7 and 3650 days.' });
    return;
  }
  if (!EMAIL_RE.test(supportContactEmail) || supportContactEmail.length > 256) {
    res.status(400).json({ success: false, message: 'Please provide a valid support contact email.' });
    return;
  }

  const upsert = db.prepare(
    `INSERT INTO SystemSettings (SettingKey, SettingValue, UpdatedOn)
     VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
     ON CONFLICT(SettingKey) DO UPDATE SET
       SettingValue = excluded.SettingValue,
       UpdatedOn = strftime('%Y-%m-%dT%H:%M:%fZ','now')`
  );

  db.exec('BEGIN');
  try {
    upsert.run('AllowPublicRegistration', allowPublicRegistration ? 'true' : 'false');
    upsert.run('DefaultTrialDays', String(defaultTrialDays));
    upsert.run('DefaultWidgetRateLimitPerMin', String(defaultWidgetRateLimitPerMin));
    upsert.run('ConversationRetentionDays', String(conversationRetentionDays));
    upsert.run('MaintenanceMode', maintenanceMode ? 'true' : 'false');
    upsert.run('SupportContactEmail', supportContactEmail);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  writeAuditLog({
    userId: req.user?.userId,
    action: 'SystemSettingsUpdated',
    entityType: 'SystemSettings',
    details: `PublicRegistration=${allowPublicRegistration}, MaintenanceMode=${maintenanceMode}, RateLimit=${defaultWidgetRateLimitPerMin}/min`,
    ipAddress: req.ip,
  });

  res.json({
    success: true,
    message: 'System settings saved.',
    data: loadSystemSettingsObject(),
  });
});

// Super Admin: List AI Providers & Model Catalog
router.get('/ai-providers', authenticate, requireRoles('SuperAdmin'), (_req, res) => {
  const rows = db
    .prepare(
      `SELECT
        ProviderId AS providerId,
        Code AS code,
        Name AS name,
        SupportedModelsJson AS supportedModelsJson,
        IsActive AS isActive,
        CreatedOn AS createdOn,
        UpdatedOn AS updatedOn
       FROM AIProviders
       ORDER BY ProviderId ASC`
    )
    .all() as Array<{
      providerId: number;
      code: string;
      name: string;
      supportedModelsJson: string;
      isActive: number;
      createdOn: string;
      updatedOn: string;
    }>;

  res.json({
    success: true,
    data: {
      geminiConfigured: isGeminiConfigured(),
      providers: rows.map((r) => ({
        providerId: r.providerId,
        code: r.code,
        name: r.name,
        isActive: Boolean(r.isActive),
        models: JSON.parse(r.supportedModelsJson || '[]'),
        createdOn: r.createdOn,
        updatedOn: r.updatedOn,
      })),
    },
  });
});

// Super Admin: Update AI Provider Name, Active State & Supported Models
router.put('/ai-providers/:id', authenticate, requireRoles('SuperAdmin'), (req: AuthenticatedRequest, res) => {
  const providerId = Number(req.params.id);
  if (!Number.isInteger(providerId) || providerId <= 0) {
    res.status(400).json({ success: false, message: 'Invalid AI provider ID.' });
    return;
  }

  const existing = db
    .prepare(`SELECT ProviderId, Code FROM AIProviders WHERE ProviderId = ?`)
    .get(providerId) as { ProviderId: number; Code: string } | undefined;

  if (!existing) {
    res.status(404).json({ success: false, message: 'AI provider not found.' });
    return;
  }

  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  const isActive = Boolean(req.body?.isActive);
  const rawModels = Array.isArray(req.body?.models) ? req.body.models : [];

  if (name.length < 2 || name.length > 100) {
    res.status(400).json({ success: false, message: 'Provider name must be between 2 and 100 characters.' });
    return;
  }

  const cleanModels: Array<{ id: string; label: string; tier: 'standard' | 'paid' }> = [];
  const seenIds = new Set<string>();
  for (const item of rawModels) {
    const id = typeof item?.id === 'string' ? item.id.trim() : '';
    const label = typeof item?.label === 'string' ? item.label.trim() : '';
    const tier = item?.tier === 'paid' ? 'paid' : 'standard';
    if (!id || !label || seenIds.has(id)) continue;
    if (!/^[a-zA-Z0-9._-]{3,80}$/.test(id)) {
      res.status(400).json({ success: false, message: `Invalid model identifier "${id}".` });
      return;
    }
    seenIds.add(id);
    cleanModels.push({ id, label: label.slice(0, 120), tier });
  }

  if (cleanModels.length === 0) {
    res.status(400).json({ success: false, message: 'At least one supported AI model is required.' });
    return;
  }

  db.prepare(
    `UPDATE AIProviders
     SET Name = ?,
         SupportedModelsJson = ?,
         IsActive = ?,
         UpdatedOn = strftime('%Y-%m-%dT%H:%M:%fZ','now')
     WHERE ProviderId = ?`
  ).run(name, JSON.stringify(cleanModels), isActive ? 1 : 0, providerId);

  writeAuditLog({
    userId: req.user?.userId,
    action: 'AiProviderUpdated',
    entityType: 'AIProvider',
    entityId: providerId,
    details: `Updated ${existing.Code}: active=${isActive}, models=${cleanModels.map((m) => m.id).join(', ')}`,
    ipAddress: req.ip,
  });

  res.json({
    success: true,
    message: `${name} configuration saved.`,
    data: {
      providerId,
      code: existing.Code,
      name,
      isActive,
      models: cleanModels,
    },
  });
});

// Super Admin: Quick Toggle AI Provider Active State
router.patch('/ai-providers/:id/status', authenticate, requireRoles('SuperAdmin'), (req: AuthenticatedRequest, res) => {
  const providerId = Number(req.params.id);
  if (!Number.isInteger(providerId) || providerId <= 0 || typeof req.body?.isActive !== 'boolean') {
    res.status(400).json({ success: false, message: 'Valid provider ID and isActive boolean are required.' });
    return;
  }

  const existing = db.prepare(`SELECT ProviderId, Name FROM AIProviders WHERE ProviderId = ?`).get(providerId) as
    | { ProviderId: number; Name: string }
    | undefined;
  if (!existing) {
    res.status(404).json({ success: false, message: 'AI provider not found.' });
    return;
  }

  db.prepare(`UPDATE AIProviders SET IsActive = ?, UpdatedOn = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE ProviderId = ?`)
    .run(req.body.isActive ? 1 : 0, providerId);

  writeAuditLog({
    userId: req.user?.userId,
    action: req.body.isActive ? 'AiProviderEnabled' : 'AiProviderDisabled',
    entityType: 'AIProvider',
    entityId: providerId,
    details: `${existing.Name} set to ${req.body.isActive ? 'Active' : 'Inactive'}`,
    ipAddress: req.ip,
  });

  res.json({
    success: true,
    message: `${existing.Name} ${req.body.isActive ? 'activated' : 'disabled'}.`,
    data: { providerId, isActive: req.body.isActive },
  });
});

export default router;
