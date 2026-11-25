import { Router } from 'express';
import { db, writeAuditLog } from '../db.ts';
import { authenticate, requireRoles, type AuthenticatedRequest } from '../middleware/auth.ts';
import { normalizeDomainPattern } from '../services/domainAllowlistService.ts';

const router = Router({ mergeParams: true });

function verifyChatbotOwnership(chatbotId: number, businessId: number): { chatbotId: number; name: string } | null {
  const row = db
    .prepare(`SELECT ChatbotId AS chatbotId, Name AS name FROM Chatbots WHERE ChatbotId = ? AND BusinessId = ?`)
    .get(chatbotId, businessId) as { chatbotId: number; name: string } | undefined;
  return row ?? null;
}

// List allowlisted domains for a chatbot (Tenant-isolated)
router.get(
  '/',
  authenticate,
  requireRoles('BusinessOwner', 'BusinessAdmin', 'BusinessStaff'),
  (req: AuthenticatedRequest, res) => {
    const businessId = req.user?.businessId;
    const chatbotId = Number(req.params.chatbotId);

    if (!businessId) {
      res.status(403).json({ success: false, message: 'No business workspace assigned.' });
      return;
    }
    if (!Number.isInteger(chatbotId) || chatbotId <= 0) {
      res.status(400).json({ success: false, message: 'Invalid chatbot ID.' });
      return;
    }

    const bot = verifyChatbotOwnership(chatbotId, businessId);
    if (!bot) {
      res.status(404).json({ success: false, message: 'Chatbot not found in your business workspace.' });
      return;
    }

    const items = db
      .prepare(
        `SELECT
          AllowedDomainId AS allowedDomainId,
          ChatbotId AS chatbotId,
          BusinessId AS businessId,
          Domain AS domain,
          CreatedOn AS createdOn,
          UpdatedOn AS updatedOn
         FROM AllowedDomains
         WHERE ChatbotId = ? AND BusinessId = ?
         ORDER BY CreatedOn DESC`
      )
      .all(chatbotId, businessId);

    res.json({ success: true, data: { items } });
  }
);

// Add allowed domain for a chatbot (BusinessOwner / BusinessAdmin)
router.post(
  '/',
  authenticate,
  requireRoles('BusinessOwner', 'BusinessAdmin'),
  (req: AuthenticatedRequest, res) => {
    const businessId = req.user?.businessId;
    const chatbotId = Number(req.params.chatbotId);

    if (!businessId) {
      res.status(403).json({ success: false, message: 'No business workspace assigned.' });
      return;
    }
    if (!Number.isInteger(chatbotId) || chatbotId <= 0) {
      res.status(400).json({ success: false, message: 'Invalid chatbot ID.' });
      return;
    }

    const bot = verifyChatbotOwnership(chatbotId, businessId);
    if (!bot) {
      res.status(404).json({ success: false, message: 'Chatbot not found in your business workspace.' });
      return;
    }

    const rawDomain = typeof req.body?.domain === 'string' ? req.body.domain : '';
    const normalized = normalizeDomainPattern(rawDomain);
    if (!normalized) {
      res.status(400).json({
        success: false,
        message: 'Enter a valid domain hostname (e.g., example.com, shop.example.com, *.example.com, or localhost:5173).',
      });
      return;
    }

    const existing = db
      .prepare(`SELECT AllowedDomainId FROM AllowedDomains WHERE ChatbotId = ? AND Domain = ?`)
      .get(chatbotId, normalized) as { AllowedDomainId: number } | undefined;

    if (existing) {
      res.status(409).json({
        success: false,
        message: `Domain "${normalized}" is already allowlisted for this chatbot.`,
      });
      return;
    }

    const result = db
      .prepare(`INSERT INTO AllowedDomains (ChatbotId, BusinessId, Domain) VALUES (?, ?, ?)`)
      .run(chatbotId, businessId, normalized);

    const createdId = Number(result.lastInsertRowid);
    const created = db
      .prepare(
        `SELECT
          AllowedDomainId AS allowedDomainId,
          ChatbotId AS chatbotId,
          BusinessId AS businessId,
          Domain AS domain,
          CreatedOn AS createdOn,
          UpdatedOn AS updatedOn
         FROM AllowedDomains
         WHERE AllowedDomainId = ?`
      )
      .get(createdId);

    writeAuditLog({
      userId: req.user?.userId,
      businessId,
      action: 'AllowedDomainAdded',
      entityType: 'AllowedDomain',
      entityId: createdId,
      details: `Added "${normalized}" for chatbot "${bot.name}"`,
      ipAddress: req.ip,
    });

    res.status(201).json({
      success: true,
      message: `Domain "${normalized}" added to allowlist.`,
      data: created,
    });
  }
);

// Remove allowed domain (BusinessOwner / BusinessAdmin)
router.delete(
  '/:domainId',
  authenticate,
  requireRoles('BusinessOwner', 'BusinessAdmin'),
  (req: AuthenticatedRequest, res) => {
    const businessId = req.user?.businessId;
    const chatbotId = Number(req.params.chatbotId);
    const domainId = Number(req.params.domainId);

    if (!businessId) {
      res.status(403).json({ success: false, message: 'No business workspace assigned.' });
      return;
    }
    if (!Number.isInteger(chatbotId) || chatbotId <= 0 || !Number.isInteger(domainId) || domainId <= 0) {
      res.status(400).json({ success: false, message: 'Invalid chatbot or domain ID.' });
      return;
    }

    const row = db
      .prepare(
        `SELECT AllowedDomainId AS allowedDomainId, Domain AS domain
         FROM AllowedDomains
         WHERE AllowedDomainId = ? AND ChatbotId = ? AND BusinessId = ?`
      )
      .get(domainId, chatbotId, businessId) as { allowedDomainId: number; domain: string } | undefined;

    if (!row) {
      res.status(404).json({ success: false, message: 'Allowed domain not found for this chatbot.' });
      return;
    }

    db.prepare(`DELETE FROM AllowedDomains WHERE AllowedDomainId = ? AND ChatbotId = ? AND BusinessId = ?`).run(
      domainId,
      chatbotId,
      businessId
    );

    writeAuditLog({
      userId: req.user?.userId,
      businessId,
      action: 'AllowedDomainRemoved',
      entityType: 'AllowedDomain',
      entityId: domainId,
      details: `Removed "${row.domain}" from chatbot #${chatbotId}`,
      ipAddress: req.ip,
    });

    res.json({ success: true, message: `Domain "${row.domain}" removed.` });
  }
);

export default router;
