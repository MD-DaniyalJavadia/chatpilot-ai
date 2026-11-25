import crypto from 'node:crypto';
import { Router } from 'express';
import { db, writeAuditLog } from '../db.ts';
import { authenticate, requireRoles, type AuthenticatedRequest } from '../middleware/auth.ts';
import { createRateLimiter } from '../middleware/rateLimit.ts';
import {
  GeminiServiceError,
  generateGeminiReply,
  isGeminiConfigured,
  type PlaygroundTurn,
} from '../services/geminiService.ts';
import {
  getIndexedChunkCountForChatbot,
  retrieveRelevantChunks,
  type RetrievedChunk,
} from '../services/ragService.ts';
import { buildComposedInstruction } from '../services/promptBuilder.ts';

const router = Router();
const playgroundLimiter = createRateLimiter(30, 60 * 1000);

const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VALID_WIDGET_POSITIONS = new Set(['bottom-right', 'bottom-left']);

function validateActiveProviderAndModel(
  providerCode: string,
  modelId: string
): { ok: true } | { ok: false; status: number; message: string } {
  const row = db
    .prepare(`SELECT Code, Name, SupportedModelsJson, IsActive FROM AIProviders WHERE Code = ?`)
    .get(providerCode) as
    | { Code: string; Name: string; SupportedModelsJson: string; IsActive: number }
    | undefined;

  if (!row) {
    return { ok: false, status: 400, message: 'Selected AI provider is not supported.' };
  }
  if (row.IsActive !== 1) {
    return { ok: false, status: 403, message: `AI provider "${row.Name}" is currently disabled by platform administrators.` };
  }

  let models: Array<{ id?: string }> = [];
  try {
    models = JSON.parse(row.SupportedModelsJson || '[]');
  } catch {
    models = [];
  }

  const allowed = models.some((m) => m && typeof m.id === 'string' && m.id === modelId);
  if (!allowed) {
    return { ok: false, status: 400, message: `Model "${modelId}" is not enabled in the ${row.Name} catalog.` };
  }

  return { ok: true };
}

function isValidHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

interface ChatbotDetailRow {
  chatbotId: number;
  businessId: number;
  publicId: string;
  name: string;
  description: string | null;
  businessName: string;
  websiteUrl: string | null;
  isEnabled: number;
  createdOn: string;
  updatedOn: string;
  aiProvider: string;
  aiModel: string;
  systemInstructions: string | null;
  welcomeMessage: string | null;
  fallbackMessage: string | null;
  personality: string | null;
  responseLanguage: string;
  responseTone: string;
  temperature: number;
  maxOutputTokens: number;
  brandColor: string;
  logoUrl: string | null;
  humanHandoverEmail: string | null;
  widgetPosition: string;
  widgetTitle: string | null;
  widgetSubtitle: string | null;
  launcherLabel: string | null;
  showCitations: number;
  enableConversationHistory: number;
  enableHumanHandover: number;
  enableFollowUpQuestions: number;
}

function getChatbotDetailForTenant(chatbotId: number, businessId: number): ChatbotDetailRow | null {
  const row = db
    .prepare(
      `SELECT
        c.ChatbotId AS chatbotId,
        c.BusinessId AS businessId,
        c.PublicId AS publicId,
        c.Name AS name,
        c.Description AS description,
        c.BusinessName AS businessName,
        c.WebsiteUrl AS websiteUrl,
        c.IsEnabled AS isEnabled,
        c.CreatedOn AS createdOn,
        c.UpdatedOn AS updatedOn,
        cs.AiProvider AS aiProvider,
        cs.AiModel AS aiModel,
        cs.SystemInstructions AS systemInstructions,
        cs.WelcomeMessage AS welcomeMessage,
        cs.FallbackMessage AS fallbackMessage,
        cs.Personality AS personality,
        cs.ResponseLanguage AS responseLanguage,
        cs.ResponseTone AS responseTone,
        cs.Temperature AS temperature,
        cs.MaxOutputTokens AS maxOutputTokens,
        cs.BrandColor AS brandColor,
        cs.LogoUrl AS logoUrl,
        cs.HumanHandoverEmail AS humanHandoverEmail,
        cs.WidgetPosition AS widgetPosition,
        cs.WidgetTitle AS widgetTitle,
        cs.WidgetSubtitle AS widgetSubtitle,
        cs.LauncherLabel AS launcherLabel,
        cs.ShowCitations AS showCitations,
        cs.EnableConversationHistory AS enableConversationHistory,
        cs.EnableHumanHandover AS enableHumanHandover,
        cs.EnableFollowUpQuestions AS enableFollowUpQuestions
      FROM Chatbots c
      JOIN ChatbotSettings cs ON cs.ChatbotId = c.ChatbotId
      WHERE c.ChatbotId = ? AND c.BusinessId = ?`
    )
    .get(chatbotId, businessId) as ChatbotDetailRow | undefined;

  return row ?? null;
}

function normalizeChatbotDto(row: ChatbotDetailRow) {
  return {
    ...row,
    isEnabled: Boolean(row.isEnabled),
    showCitations: Boolean(row.showCitations),
    enableConversationHistory: Boolean(row.enableConversationHistory),
    enableHumanHandover: Boolean(row.enableHumanHandover),
    enableFollowUpQuestions: Boolean(row.enableFollowUpQuestions),
  };
}

// List active AI providers & server Gemini readiness
router.get(
  '/providers',
  authenticate,
  requireRoles('BusinessOwner', 'BusinessAdmin', 'BusinessStaff'),
  (_req, res) => {
    const rows = db
      .prepare(
        `SELECT ProviderId AS providerId, Code AS code, Name AS name, SupportedModelsJson AS supportedModelsJson
         FROM AIProviders WHERE IsActive = 1 ORDER BY ProviderId ASC`
      )
      .all() as Array<{ providerId: number; code: string; name: string; supportedModelsJson: string }>;

    const providers = rows.map((r) => ({
      providerId: r.providerId,
      code: r.code,
      name: r.name,
      models: JSON.parse(r.supportedModelsJson || '[]'),
    }));

    res.json({
      success: true,
      data: {
        providers,
        geminiConfigured: isGeminiConfigured(),
      },
    });
  }
);

// List chatbots for authenticated business (search, status filter, pagination)
router.get(
  '/',
  authenticate,
  requireRoles('BusinessOwner', 'BusinessAdmin', 'BusinessStaff'),
  (req: AuthenticatedRequest, res) => {
    const businessId = req.user?.businessId;
    if (!businessId) {
      res.status(403).json({ success: false, message: 'No business workspace assigned.' });
      return;
    }

    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const status = typeof req.query.status === 'string' ? req.query.status.trim().toLowerCase() : 'all';
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize) || 10));
    const offset = (page - 1) * pageSize;

    const where: string[] = ['c.BusinessId = ?'];
    const params: Array<string | number> = [businessId];

    if (status === 'active' || status === 'enabled') {
      where.push('c.IsEnabled = 1');
    } else if (status === 'inactive' || status === 'disabled') {
      where.push('c.IsEnabled = 0');
    }

    if (search) {
      where.push('(c.Name LIKE ? OR COALESCE(c.Description, \'\') LIKE ? OR c.BusinessName LIKE ?)');
      const like = `%${search}%`;
      params.push(like, like, like);
    }

    const whereSql = `WHERE ${where.join(' AND ')}`;

    const totalRow = db
      .prepare(`SELECT COUNT(*) AS total FROM Chatbots c ${whereSql}`)
      .get(...params) as { total: number };

    const planRow = db
      .prepare(
        `SELECT COALESCE((
                  SELECT sp.MaxChatbots
                  FROM Subscriptions s
                  JOIN SubscriptionPlans sp ON sp.PlanId = s.PlanId
                  WHERE s.BusinessId = b.BusinessId
                    AND s.Status = 'Active'
                    AND (s.ExpiresOn IS NULL OR s.ExpiresOn > strftime('%Y-%m-%dT%H:%M:%fZ','now'))
                  ORDER BY s.SubscriptionId DESC
                  LIMIT 1
                ), 1) AS maxChatbots,
                (SELECT COUNT(*) FROM Chatbots WHERE BusinessId = ?) AS totalCount
         FROM Businesses b
         WHERE b.BusinessId = ?`
      )
      .get(businessId, businessId) as { maxChatbots: number; totalCount: number } | undefined;

    const items = db
      .prepare(
        `SELECT
          c.ChatbotId AS chatbotId,
          c.BusinessId AS businessId,
          c.PublicId AS publicId,
          c.Name AS name,
          c.Description AS description,
          c.BusinessName AS businessName,
          c.WebsiteUrl AS websiteUrl,
          c.IsEnabled AS isEnabled,
          c.CreatedOn AS createdOn,
          c.UpdatedOn AS updatedOn,
          cs.AiProvider AS aiProvider,
          cs.AiModel AS aiModel,
          cs.ResponseLanguage AS responseLanguage,
          cs.ResponseTone AS responseTone
        FROM Chatbots c
        JOIN ChatbotSettings cs ON cs.ChatbotId = c.ChatbotId
        ${whereSql}
        ORDER BY c.CreatedOn DESC
        LIMIT ? OFFSET ?`
      )
      .all(...params, pageSize, offset) as Array<Record<string, unknown>>;

    res.json({
      success: true,
      data: {
        items: items.map((item) => ({ ...item, isEnabled: Boolean(item.isEnabled) })),
        total: totalRow.total,
        page,
        pageSize,
        quota: {
          used: planRow?.totalCount ?? 0,
          limit: planRow?.maxChatbots ?? 1,
        },
      },
    });
  }
);

// Get single chatbot configuration (Tenant-isolated)
router.get(
  '/:id',
  authenticate,
  requireRoles('BusinessOwner', 'BusinessAdmin', 'BusinessStaff'),
  (req: AuthenticatedRequest, res) => {
    const businessId = req.user?.businessId;
    const chatbotId = Number(req.params.id);

    if (!businessId) {
      res.status(403).json({ success: false, message: 'No business workspace assigned.' });
      return;
    }
    if (!Number.isInteger(chatbotId) || chatbotId <= 0) {
      res.status(400).json({ success: false, message: 'Invalid chatbot ID.' });
      return;
    }

    const row = getChatbotDetailForTenant(chatbotId, businessId);
    if (!row) {
      res.status(404).json({ success: false, message: 'Chatbot not found in your business workspace.' });
      return;
    }

    const indexedChunkCount = getIndexedChunkCountForChatbot(chatbotId, businessId);
    res.json({
      success: true,
      data: {
        ...normalizeChatbotDto(row),
        indexedChunkCount,
      },
    });
  }
);

// Create new chatbot (BusinessOwner / BusinessAdmin)
router.post(
  '/',
  authenticate,
  requireRoles('BusinessOwner', 'BusinessAdmin'),
  (req: AuthenticatedRequest, res) => {
    const businessId = req.user?.businessId;
    if (!businessId) {
      res.status(403).json({ success: false, message: 'No business workspace assigned.' });
      return;
    }

    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const description = typeof req.body?.description === 'string' ? req.body.description.trim().slice(0, 500) : null;
    const businessName = typeof req.body?.businessName === 'string' ? req.body.businessName.trim() : '';
    const websiteUrl = typeof req.body?.websiteUrl === 'string' ? req.body.websiteUrl.trim().slice(0, 500) : null;
    const aiProvider = typeof req.body?.aiProvider === 'string' ? req.body.aiProvider.trim() : '';
    const aiModel = typeof req.body?.aiModel === 'string' ? req.body.aiModel.trim() : 'gemini-4-hydrogen';
    const systemInstructions = typeof req.body?.systemInstructions === 'string' ? req.body.systemInstructions.trim().slice(0, 4000) : null;
    const welcomeMessage = typeof req.body?.welcomeMessage === 'string' ? req.body.welcomeMessage.trim().slice(0, 500) : null;
    const fallbackMessage = typeof req.body?.fallbackMessage === 'string' ? req.body.fallbackMessage.trim().slice(0, 500) : null;
    const personality = typeof req.body?.personality === 'string' ? req.body.personality.trim().slice(0, 100) : null;
    const responseLanguage = typeof req.body?.responseLanguage === 'string' && req.body.responseLanguage.trim()
      ? req.body.responseLanguage.trim().slice(0, 50)
      : 'English';
    const responseTone = typeof req.body?.responseTone === 'string' && req.body.responseTone.trim()
      ? req.body.responseTone.trim().slice(0, 50)
      : 'Professional';

    if (name.length < 2 || name.length > 150) {
      res.status(400).json({ success: false, message: 'Chatbot name must be between 2 and 150 characters.' });
      return;
    }
    if (businessName.length < 2 || businessName.length > 200) {
      res.status(400).json({ success: false, message: 'Business name must be between 2 and 200 characters.' });
      return;
    }
    if (websiteUrl && !isValidHttpUrl(websiteUrl)) {
      res.status(400).json({ success: false, message: 'Website URL must start with http:// or https://.' });
      return;
    }
    const providerCheck = validateActiveProviderAndModel(aiProvider, aiModel);
    if (!providerCheck.ok) {
      res.status(providerCheck.status).json({ success: false, message: providerCheck.message });
      return;
    }

    const quotaRow = db
      .prepare(
        `SELECT COALESCE((
                  SELECT sp.MaxChatbots
                  FROM Subscriptions s
                  JOIN SubscriptionPlans sp ON sp.PlanId = s.PlanId
                  WHERE s.BusinessId = b.BusinessId
                    AND s.Status = 'Active'
                    AND (s.ExpiresOn IS NULL OR s.ExpiresOn > strftime('%Y-%m-%dT%H:%M:%fZ','now'))
                  ORDER BY s.SubscriptionId DESC
                  LIMIT 1
                ), 1) AS maxChatbots,
                (SELECT COUNT(*) FROM Chatbots WHERE BusinessId = ?) AS usedCount
         FROM Businesses b
         WHERE b.BusinessId = ?`
      )
      .get(businessId, businessId) as { maxChatbots: number; usedCount: number } | undefined;

    if (quotaRow && quotaRow.usedCount >= quotaRow.maxChatbots) {
      res.status(403).json({
        success: false,
        message: `Chatbot limit reached (${quotaRow.usedCount}/${quotaRow.maxChatbots}) for your current subscription plan.`,
      });
      return;
    }

    const publicId = `cb_${crypto.randomBytes(8).toString('hex')}`;
    let createdChatbotId = 0;

    db.exec('BEGIN');
    try {
      const botRes = db
        .prepare(
          `INSERT INTO Chatbots (BusinessId, PublicId, Name, Description, BusinessName, WebsiteUrl, IsEnabled)
           VALUES (?, ?, ?, ?, ?, ?, 1)`
        )
        .run(businessId, publicId, name, description || null, businessName, websiteUrl || null);
      createdChatbotId = Number(botRes.lastInsertRowid);

      db.prepare(
        `INSERT INTO ChatbotSettings (
          ChatbotId, AiProvider, AiModel, SystemInstructions, WelcomeMessage, FallbackMessage,
          Personality, ResponseLanguage, ResponseTone, Temperature, MaxOutputTokens,
          EnableConversationHistory, EnableHumanHandover, EnableFollowUpQuestions
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0.7, 2048, 1, 0, 1)`
      ).run(
        createdChatbotId,
        aiProvider,
        aiModel,
        systemInstructions || null,
        welcomeMessage || `Hello! I am ${name}, the AI assistant for ${businessName}. How can I help you today?`,
        fallbackMessage || `I don't have enough information to answer that accurately. Please reach out to our team for further assistance.`,
        personality || 'Helpful and attentive',
        responseLanguage,
        responseTone
      );

      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }

    writeAuditLog({
      userId: req.user?.userId,
      businessId,
      action: 'ChatbotCreated',
      entityType: 'Chatbot',
      entityId: createdChatbotId,
      details: `Created chatbot "${name}" (${aiModel})`,
      ipAddress: req.ip,
    });

    const created = getChatbotDetailForTenant(createdChatbotId, businessId)!;
    res.status(201).json({
      success: true,
      message: 'Chatbot created successfully.',
      data: normalizeChatbotDto(created),
    });
  }
);

// Update full chatbot configuration (General, AI, Response, Behavior)
router.put(
  '/:id',
  authenticate,
  requireRoles('BusinessOwner', 'BusinessAdmin'),
  (req: AuthenticatedRequest, res) => {
    const businessId = req.user?.businessId;
    const chatbotId = Number(req.params.id);

    if (!businessId) {
      res.status(403).json({ success: false, message: 'No business workspace assigned.' });
      return;
    }
    if (!Number.isInteger(chatbotId) || chatbotId <= 0) {
      res.status(400).json({ success: false, message: 'Invalid chatbot ID.' });
      return;
    }

    const existing = getChatbotDetailForTenant(chatbotId, businessId);
    if (!existing) {
      res.status(404).json({ success: false, message: 'Chatbot not found in your business workspace.' });
      return;
    }

    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const description = typeof req.body?.description === 'string' ? req.body.description.trim().slice(0, 500) : null;
    const businessName = typeof req.body?.businessName === 'string' ? req.body.businessName.trim() : '';
    const websiteUrl = typeof req.body?.websiteUrl === 'string' ? req.body.websiteUrl.trim().slice(0, 500) : null;
    const isEnabled = req.body?.isEnabled !== undefined ? Boolean(req.body.isEnabled) : Boolean(existing.isEnabled);

    const aiProvider = typeof req.body?.aiProvider === 'string' ? req.body.aiProvider.trim() : existing.aiProvider;
    const aiModel = typeof req.body?.aiModel === 'string' ? req.body.aiModel.trim() : existing.aiModel;
    const systemInstructions =
      typeof req.body?.systemInstructions === 'string' ? req.body.systemInstructions.trim().slice(0, 4000) : null;
    const temperature = req.body?.temperature !== undefined ? Number(req.body.temperature) : existing.temperature;
    const maxOutputTokens =
      req.body?.maxOutputTokens !== undefined ? Math.round(Number(req.body.maxOutputTokens)) : existing.maxOutputTokens;

    const welcomeMessage =
      typeof req.body?.welcomeMessage === 'string' ? req.body.welcomeMessage.trim().slice(0, 500) : null;
    const fallbackMessage =
      typeof req.body?.fallbackMessage === 'string' ? req.body.fallbackMessage.trim().slice(0, 500) : null;
    const personality = typeof req.body?.personality === 'string' ? req.body.personality.trim().slice(0, 100) : null;
    const responseLanguage =
      typeof req.body?.responseLanguage === 'string' && req.body.responseLanguage.trim()
        ? req.body.responseLanguage.trim().slice(0, 50)
        : existing.responseLanguage;
    const responseTone =
      typeof req.body?.responseTone === 'string' && req.body.responseTone.trim()
        ? req.body.responseTone.trim().slice(0, 50)
        : existing.responseTone;

    const enableConversationHistory =
      req.body?.enableConversationHistory !== undefined
        ? Boolean(req.body.enableConversationHistory)
        : Boolean(existing.enableConversationHistory);
    const enableHumanHandover =
      req.body?.enableHumanHandover !== undefined
        ? Boolean(req.body.enableHumanHandover)
        : Boolean(existing.enableHumanHandover);
    const enableFollowUpQuestions =
      req.body?.enableFollowUpQuestions !== undefined
        ? Boolean(req.body.enableFollowUpQuestions)
        : Boolean(existing.enableFollowUpQuestions);

    if (name.length < 2 || name.length > 150) {
      res.status(400).json({ success: false, message: 'Chatbot name must be between 2 and 150 characters.' });
      return;
    }
    if (businessName.length < 2 || businessName.length > 200) {
      res.status(400).json({ success: false, message: 'Business name must be between 2 and 200 characters.' });
      return;
    }
    if (websiteUrl && !isValidHttpUrl(websiteUrl)) {
      res.status(400).json({ success: false, message: 'Website URL must start with http:// or https://.' });
      return;
    }
    const providerCheck = validateActiveProviderAndModel(aiProvider, aiModel);
    if (!providerCheck.ok) {
      res.status(providerCheck.status).json({ success: false, message: providerCheck.message });
      return;
    }
    if (!Number.isFinite(temperature) || temperature < 0 || temperature > 2) {
      res.status(400).json({ success: false, message: 'Temperature must be between 0.0 and 2.0.' });
      return;
    }
    if (!Number.isFinite(maxOutputTokens) || maxOutputTokens < 128 || maxOutputTokens > 8192) {
      res.status(400).json({ success: false, message: 'Maximum output tokens must be between 128 and 8192.' });
      return;
    }

    db.exec('BEGIN');
    try {
      db.prepare(
        `UPDATE Chatbots
         SET Name = ?, Description = ?, BusinessName = ?, WebsiteUrl = ?, IsEnabled = ?, UpdatedOn = strftime('%Y-%m-%dT%H:%M:%fZ','now')
         WHERE ChatbotId = ? AND BusinessId = ?`
      ).run(name, description || null, businessName, websiteUrl || null, isEnabled ? 1 : 0, chatbotId, businessId);

      db.prepare(
        `UPDATE ChatbotSettings
         SET AiProvider = ?, AiModel = ?, SystemInstructions = ?, WelcomeMessage = ?, FallbackMessage = ?,
             Personality = ?, ResponseLanguage = ?, ResponseTone = ?, Temperature = ?, MaxOutputTokens = ?,
             EnableConversationHistory = ?, EnableHumanHandover = ?, EnableFollowUpQuestions = ?,
             UpdatedOn = strftime('%Y-%m-%dT%H:%M:%fZ','now')
         WHERE ChatbotId = ?`
      ).run(
        aiProvider,
        aiModel,
        systemInstructions || null,
        welcomeMessage || null,
        fallbackMessage || null,
        personality || null,
        responseLanguage,
        responseTone,
        temperature,
        maxOutputTokens,
        enableConversationHistory ? 1 : 0,
        enableHumanHandover ? 1 : 0,
        enableFollowUpQuestions ? 1 : 0,
        chatbotId
      );

      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }

    writeAuditLog({
      userId: req.user?.userId,
      businessId,
      action: 'ChatbotConfigured',
      entityType: 'Chatbot',
      entityId: chatbotId,
      details: `Updated configuration for "${name}" (${aiModel})`,
      ipAddress: req.ip,
    });

    const updated = getChatbotDetailForTenant(chatbotId, businessId)!;
    res.json({
      success: true,
      message: 'Chatbot configuration saved.',
      data: normalizeChatbotDto(updated),
    });
  }
);

// Update widget appearance & handover branding (BusinessOwner / BusinessAdmin)
router.put(
  '/:id/widget-settings',
  authenticate,
  requireRoles('BusinessOwner', 'BusinessAdmin'),
  (req: AuthenticatedRequest, res) => {
    const businessId = req.user?.businessId;
    const chatbotId = Number(req.params.id);

    if (!businessId) {
      res.status(403).json({ success: false, message: 'No business workspace assigned.' });
      return;
    }
    if (!Number.isInteger(chatbotId) || chatbotId <= 0) {
      res.status(400).json({ success: false, message: 'Invalid chatbot ID.' });
      return;
    }

    const existing = getChatbotDetailForTenant(chatbotId, businessId);
    if (!existing) {
      res.status(404).json({ success: false, message: 'Chatbot not found in your business workspace.' });
      return;
    }

    const brandColor =
      typeof req.body?.brandColor === 'string' && req.body.brandColor.trim()
        ? req.body.brandColor.trim()
        : existing.brandColor || '#2563EB';
    const logoUrl =
      typeof req.body?.logoUrl === 'string' && req.body.logoUrl.trim()
        ? req.body.logoUrl.trim().slice(0, 500)
        : null;
    const humanHandoverEmail =
      typeof req.body?.humanHandoverEmail === 'string' && req.body.humanHandoverEmail.trim()
        ? req.body.humanHandoverEmail.trim().slice(0, 256)
        : null;
    const widgetPosition =
      typeof req.body?.widgetPosition === 'string' && req.body.widgetPosition.trim()
        ? req.body.widgetPosition.trim()
        : existing.widgetPosition || 'bottom-right';
    const widgetTitle =
      typeof req.body?.widgetTitle === 'string' && req.body.widgetTitle.trim()
        ? req.body.widgetTitle.trim().slice(0, 100)
        : null;
    const widgetSubtitle =
      typeof req.body?.widgetSubtitle === 'string' && req.body.widgetSubtitle.trim()
        ? req.body.widgetSubtitle.trim().slice(0, 180)
        : null;
    const launcherLabel =
      typeof req.body?.launcherLabel === 'string' && req.body.launcherLabel.trim()
        ? req.body.launcherLabel.trim().slice(0, 60)
        : null;
    const showCitations =
      req.body?.showCitations !== undefined ? Boolean(req.body.showCitations) : Boolean(existing.showCitations);

    if (!HEX_COLOR_REGEX.test(brandColor)) {
      res.status(400).json({ success: false, message: 'Brand color must be a valid 6-digit hex color (e.g. #2563EB).' });
      return;
    }
    if (logoUrl && !isValidHttpUrl(logoUrl)) {
      res.status(400).json({ success: false, message: 'Logo URL must start with http:// or https://.' });
      return;
    }
    if (humanHandoverEmail && !EMAIL_REGEX.test(humanHandoverEmail)) {
      res.status(400).json({ success: false, message: 'Human handover email must be a valid email address.' });
      return;
    }
    if (!VALID_WIDGET_POSITIONS.has(widgetPosition)) {
      res.status(400).json({ success: false, message: 'Widget position must be bottom-right or bottom-left.' });
      return;
    }

    db.prepare(
      `UPDATE ChatbotSettings
       SET BrandColor = ?,
           LogoUrl = ?,
           HumanHandoverEmail = ?,
           WidgetPosition = ?,
           WidgetTitle = ?,
           WidgetSubtitle = ?,
           LauncherLabel = ?,
           ShowCitations = ?,
           UpdatedOn = strftime('%Y-%m-%dT%H:%M:%fZ','now')
       WHERE ChatbotId = ?`
    ).run(
      brandColor,
      logoUrl,
      humanHandoverEmail,
      widgetPosition,
      widgetTitle,
      widgetSubtitle,
      launcherLabel,
      showCitations ? 1 : 0,
      chatbotId
    );

    writeAuditLog({
      userId: req.user?.userId,
      businessId,
      action: 'WidgetAppearanceUpdated',
      entityType: 'Chatbot',
      entityId: chatbotId,
      details: `Updated widget branding (${brandColor}, ${widgetPosition}) for "${existing.name}"`,
      ipAddress: req.ip,
    });

    const updated = getChatbotDetailForTenant(chatbotId, businessId)!;
    res.json({
      success: true,
      message: 'Widget appearance settings saved.',
      data: normalizeChatbotDto(updated),
    });
  }
);

// Activate or Deactivate chatbot
router.patch(
  '/:id/status',
  authenticate,
  requireRoles('BusinessOwner', 'BusinessAdmin'),
  (req: AuthenticatedRequest, res) => {
    const businessId = req.user?.businessId;
    const chatbotId = Number(req.params.id);
    if (!businessId) {
      res.status(403).json({ success: false, message: 'No business workspace assigned.' });
      return;
    }
    if (!Number.isInteger(chatbotId) || chatbotId <= 0) {
      res.status(400).json({ success: false, message: 'Invalid chatbot ID.' });
      return;
    }
    if (typeof req.body?.isEnabled !== 'boolean') {
      res.status(400).json({ success: false, message: 'isEnabled boolean flag is required.' });
      return;
    }

    const existing = getChatbotDetailForTenant(chatbotId, businessId);
    if (!existing) {
      res.status(404).json({ success: false, message: 'Chatbot not found in your business workspace.' });
      return;
    }

    const isEnabled = req.body.isEnabled;
    db.prepare(
      `UPDATE Chatbots SET IsEnabled = ?, UpdatedOn = strftime('%Y-%m-%dT%H:%M:%fZ','now')
       WHERE ChatbotId = ? AND BusinessId = ?`
    ).run(isEnabled ? 1 : 0, chatbotId, businessId);

    writeAuditLog({
      userId: req.user?.userId,
      businessId,
      action: isEnabled ? 'ChatbotActivated' : 'ChatbotDeactivated',
      entityType: 'Chatbot',
      entityId: chatbotId,
      details: `${existing.name} -> ${isEnabled ? 'Active' : 'Inactive'}`,
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      message: `Chatbot ${isEnabled ? 'activated' : 'deactivated'}.`,
      data: { chatbotId, isEnabled },
    });
  }
);

// Delete chatbot (Tenant-isolated)
router.delete(
  '/:id',
  authenticate,
  requireRoles('BusinessOwner', 'BusinessAdmin'),
  (req: AuthenticatedRequest, res) => {
    const businessId = req.user?.businessId;
    const chatbotId = Number(req.params.id);
    if (!businessId) {
      res.status(403).json({ success: false, message: 'No business workspace assigned.' });
      return;
    }
    if (!Number.isInteger(chatbotId) || chatbotId <= 0) {
      res.status(400).json({ success: false, message: 'Invalid chatbot ID.' });
      return;
    }

    const existing = getChatbotDetailForTenant(chatbotId, businessId);
    if (!existing) {
      res.status(404).json({ success: false, message: 'Chatbot not found in your business workspace.' });
      return;
    }

    db.prepare(`DELETE FROM Chatbots WHERE ChatbotId = ? AND BusinessId = ?`).run(chatbotId, businessId);

    writeAuditLog({
      userId: req.user?.userId,
      businessId,
      action: 'ChatbotDeleted',
      entityType: 'Chatbot',
      entityId: chatbotId,
      details: `Deleted chatbot "${existing.name}"`,
      ipAddress: req.ip,
    });

    res.json({ success: true, message: 'Chatbot deleted successfully.' });
  }
);

// Interactive Gemini Testing Playground (Isolated from customer Conversations/Messages)
router.post(
  '/:id/playground',
  authenticate,
  requireRoles('BusinessOwner', 'BusinessAdmin', 'BusinessStaff'),
  playgroundLimiter,
  async (req: AuthenticatedRequest, res) => {
    const businessId = req.user?.businessId;
    const chatbotId = Number(req.params.id);

    if (!businessId) {
      res.status(403).json({ success: false, message: 'No business workspace assigned.' });
      return;
    }
    if (!Number.isInteger(chatbotId) || chatbotId <= 0) {
      res.status(400).json({ success: false, message: 'Invalid chatbot ID.' });
      return;
    }

    const bot = getChatbotDetailForTenant(chatbotId, businessId);
    if (!bot) {
      res.status(404).json({ success: false, message: 'Chatbot not found in your business workspace.' });
      return;
    }

    const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
    if (!message || message.length > 4000) {
      res.status(400).json({ success: false, message: 'Message must be between 1 and 4000 characters.' });
      return;
    }

    const model =
      typeof req.body?.aiModel === 'string' && req.body.aiModel.trim()
        ? req.body.aiModel.trim()
        : bot.aiModel;
    const customInstructions =
      typeof req.body?.systemInstructions === 'string'
        ? req.body.systemInstructions.slice(0, 4000)
        : bot.systemInstructions || '';
    const temperature =
      req.body?.temperature !== undefined ? Number(req.body.temperature) : bot.temperature;
    const maxOutputTokens =
      req.body?.maxOutputTokens !== undefined
        ? Math.round(Number(req.body.maxOutputTokens))
        : bot.maxOutputTokens;

    if (!Number.isFinite(temperature) || temperature < 0 || temperature > 2) {
      res.status(400).json({ success: false, message: 'Temperature must be between 0.0 and 2.0.' });
      return;
    }
    if (!Number.isFinite(maxOutputTokens) || maxOutputTokens < 128 || maxOutputTokens > 8192) {
      res.status(400).json({ success: false, message: 'Max output tokens must be between 128 and 8192.' });
      return;
    }

    const providerCheck = validateActiveProviderAndModel(bot.aiProvider, model);
    if (!providerCheck.ok) {
      res.status(providerCheck.status).json({ success: false, message: providerCheck.message });
      return;
    }

    const rawHistory: unknown[] = Array.isArray(req.body?.history) ? req.body.history : [];
    const history: PlaygroundTurn[] = bot.enableConversationHistory
      ? rawHistory
          .filter(
            (item): item is { role: string; content: string } =>
              Boolean(item) &&
              typeof (item as { role?: unknown }).role === 'string' &&
              typeof (item as { content?: unknown }).content === 'string' &&
              (item as { content: string }).content.trim().length > 0
          )
          .slice(-16)
          .map((item): PlaygroundTurn => ({
            role: item.role === 'model' ? 'model' : 'user',
            content: item.content.slice(0, 4000),
          }))
      : [];

    const useRag = req.body?.useRag !== false;
    const indexedChunksAvailable = getIndexedChunkCountForChatbot(chatbotId, businessId);

    try {
      let retrievedChunks: RetrievedChunk[] = [];
      if (useRag && indexedChunksAvailable > 0) {
        retrievedChunks = await retrieveRelevantChunks({
          chatbotId,
          businessId,
          query: message,
          topK: 5,
          minScore: 0.28,
        });
      }

      const composedInstruction = buildComposedInstruction(
        bot,
        customInstructions,
        maxOutputTokens,
        retrievedChunks
      );

      const result = await generateGeminiReply({
        model,
        systemInstruction: composedInstruction,
        history,
        userMessage: message,
        temperature,
        maxOutputTokens,
      });

      // Record AI token consumption in UsageLogs (keeping customer Conversations/Messages separate)
      db.prepare(
        `INSERT INTO UsageLogs (BusinessId, ChatbotId, TokensUsed, MessageCount, ModelName)
         VALUES (?, ?, ?, 0, ?)`
      ).run(businessId, chatbotId, result.usage.totalTokens, result.model);

      res.json({
        success: true,
        data: {
          ...result,
          rag: {
            enabled: useRag,
            indexedChunksAvailable,
            retrievedCount: retrievedChunks.length,
            citations: retrievedChunks.map((c) => ({
              chunkId: c.chunkId,
              sourceId: c.sourceId,
              sourceTitle: c.sourceTitle,
              sourceType: c.sourceType,
              sourceUri: c.sourceUri,
              chunkIndex: c.chunkIndex,
              score: c.score,
              snippet: c.content.length > 220 ? `${c.content.slice(0, 220)}...` : c.content,
            })),
          },
        },
      });
    } catch (err: unknown) {
      if (err instanceof GeminiServiceError) {
        res.status(err.statusCode).json({ success: false, message: err.message });
        return;
      }
      console.error('[Playground Route Error]', err);
      res.status(500).json({ success: false, message: 'Unexpected error while generating AI response.' });
    }
  }
);

export default router;
