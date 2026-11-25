import { Router } from 'express';
import { db, writeAuditLog } from '../db.ts';
import { authenticate, requireRoles, type AuthenticatedRequest } from '../middleware/auth.ts';

const router = Router();

function buildDayWindow(days: number): { sinceIso: string; dayKeys: string[] } {
  const safeDays = Math.min(90, Math.max(7, days));
  const now = new Date();
  const keys: string[] = [];
  for (let i = safeDays - 1; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i));
    keys.push(d.toISOString().slice(0, 10));
  }
  return {
    sinceIso: `${keys[0]}T00:00:00.000Z`,
    dayKeys: keys,
  };
}

// Super Admin: Global Chatbots List across all tenants
router.get('/chatbots', authenticate, requireRoles('SuperAdmin'), (req, res) => {
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  const status = typeof req.query.status === 'string' ? req.query.status.trim().toLowerCase() : 'all';
  const businessIdRaw = req.query.businessId ? Number(req.query.businessId) : null;
  const businessId = businessIdRaw && Number.isInteger(businessIdRaw) && businessIdRaw > 0 ? businessIdRaw : null;
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize) || 15));
  const offset = (page - 1) * pageSize;

  const where: string[] = [];
  const params: Array<string | number> = [];

  if (businessId) {
    where.push('c.BusinessId = ?');
    params.push(businessId);
  }
  if (status === 'active' || status === 'enabled') {
    where.push('c.IsEnabled = 1');
  } else if (status === 'inactive' || status === 'disabled') {
    where.push('c.IsEnabled = 0');
  }
  if (search) {
    where.push('(c.Name LIKE ? OR b.Name LIKE ? OR c.PublicId LIKE ?)');
    const like = `%${search}%`;
    params.push(like, like, like);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const totalRow = db
    .prepare(
      `SELECT COUNT(*) AS total
       FROM Chatbots c
       JOIN Businesses b ON b.BusinessId = c.BusinessId
       ${whereSql}`
    )
    .get(...params) as { total: number };

  const items = db
    .prepare(
      `SELECT
        c.ChatbotId AS chatbotId,
        c.BusinessId AS businessId,
        b.Name AS businessName,
        b.Status AS businessStatus,
        c.PublicId AS publicId,
        c.Name AS name,
        c.IsEnabled AS isEnabled,
        cs.AiModel AS aiModel,
        c.CreatedOn AS createdOn,
        (SELECT COUNT(*) FROM Conversations conv WHERE conv.ChatbotId = c.ChatbotId) AS conversationCount,
        (SELECT COUNT(*) FROM KnowledgeSources ks WHERE ks.ChatbotId = c.ChatbotId AND ks.Status = 'Indexed') AS indexedSourcesCount,
        (SELECT COUNT(*) FROM AllowedDomains ad WHERE ad.ChatbotId = c.ChatbotId) AS allowedDomainsCount
       FROM Chatbots c
       JOIN Businesses b ON b.BusinessId = c.BusinessId
       JOIN ChatbotSettings cs ON cs.ChatbotId = c.ChatbotId
       ${whereSql}
       ORDER BY c.CreatedOn DESC
       LIMIT ? OFFSET ?`
    )
    .all(...params, pageSize, offset) as Array<Record<string, unknown>>;

  res.json({
    success: true,
    data: {
      items: items.map((r) => ({ ...r, isEnabled: Boolean(r.isEnabled) })),
      total: totalRow.total,
      page,
      pageSize,
    },
  });
});

// Super Admin: Emergency Activate / Disable Chatbot
router.patch('/chatbots/:id/status', authenticate, requireRoles('SuperAdmin'), (req: AuthenticatedRequest, res) => {
  const chatbotId = Number(req.params.id);
  if (!Number.isInteger(chatbotId) || chatbotId <= 0) {
    res.status(400).json({ success: false, message: 'Invalid chatbot ID.' });
    return;
  }
  if (typeof req.body?.isEnabled !== 'boolean') {
    res.status(400).json({ success: false, message: 'isEnabled boolean flag is required.' });
    return;
  }

  const bot = db
    .prepare(`SELECT ChatbotId, BusinessId, Name FROM Chatbots WHERE ChatbotId = ?`)
    .get(chatbotId) as { ChatbotId: number; BusinessId: number; Name: string } | undefined;

  if (!bot) {
    res.status(404).json({ success: false, message: 'Chatbot not found.' });
    return;
  }

  const isEnabled = req.body.isEnabled;
  db.prepare(`UPDATE Chatbots SET IsEnabled = ?, UpdatedOn = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE ChatbotId = ?`)
    .run(isEnabled ? 1 : 0, chatbotId);

  writeAuditLog({
    userId: req.user?.userId,
    businessId: bot.BusinessId,
    action: isEnabled ? 'AdminChatbotEnabled' : 'AdminChatbotDisabled',
    entityType: 'Chatbot',
    entityId: chatbotId,
    details: `Super Admin set "${bot.Name}" to ${isEnabled ? 'Active' : 'Inactive'}`,
    ipAddress: req.ip,
  });

  res.json({
    success: true,
    message: `Chatbot "${bot.Name}" ${isEnabled ? 'enabled' : 'disabled'}.`,
    data: { chatbotId, isEnabled },
  });
});

// Super Admin: Platform AI Usage Monitoring
router.get('/ai-usage', authenticate, requireRoles('SuperAdmin'), (req, res) => {
  const daysParam = Number(req.query.days) || 30;
  const days = [7, 14, 30, 90].includes(daysParam) ? daysParam : 30;
  const { sinceIso, dayKeys } = buildDayWindow(days);

  const summary = db
    .prepare(
      `SELECT
        (SELECT COALESCE(SUM(TokensUsed), 0) FROM UsageLogs WHERE CreatedOn >= ?) AS totalTokensUsed,
        (SELECT COALESCE(SUM(MessageCount), 0) FROM UsageLogs WHERE CreatedOn >= ?) AS totalWidgetMessages,
        (SELECT COUNT(*) FROM UsageLogs WHERE CreatedOn >= ?) AS totalApiCalls,
        (SELECT COUNT(DISTINCT BusinessId) FROM UsageLogs WHERE CreatedOn >= ?) AS activeConsumingTenants`
    )
    .get(sinceIso, sinceIso, sinceIso, sinceIso);

  const dailyRows = db
    .prepare(
      `SELECT substr(CreatedOn, 1, 10) AS dayKey,
              COALESCE(SUM(TokensUsed), 0) AS tokensUsed,
              COALESCE(SUM(MessageCount), 0) AS messagesCount,
              COUNT(*) AS apiCallsCount
       FROM UsageLogs
       WHERE CreatedOn >= ?
       GROUP BY substr(CreatedOn, 1, 10)`
    )
    .all(sinceIso) as Array<{
      dayKey: string;
      tokensUsed: number;
      messagesCount: number;
      apiCallsCount: number;
    }>;

  const dailyMap = new Map(dailyRows.map((r) => [r.dayKey, r]));
  const dailySeries = dayKeys.map((day) => ({
    date: day,
    label: day.slice(5),
    tokensUsed: dailyMap.get(day)?.tokensUsed ?? 0,
    messagesCount: dailyMap.get(day)?.messagesCount ?? 0,
    apiCallsCount: dailyMap.get(day)?.apiCallsCount ?? 0,
  }));

  const modelBreakdown = db
    .prepare(
      `SELECT
        COALESCE(ModelName, 'unknown') AS modelName,
        COUNT(*) AS apiCallsCount,
        COALESCE(SUM(TokensUsed), 0) AS tokensUsed
       FROM UsageLogs
       WHERE CreatedOn >= ?
       GROUP BY COALESCE(ModelName, 'unknown')
       ORDER BY tokensUsed DESC`
    )
    .all(sinceIso);

  const tenantLeaderboard = db
    .prepare(
      `SELECT
        b.BusinessId AS businessId,
        b.Name AS businessName,
        b.Status AS businessStatus,
        COALESCE(sp.Name, 'Free') AS planName,
        COALESCE(sp.MaxMonthlyMessages, 250) AS maxMonthlyMessages,
        COALESCE(SUM(u.TokensUsed), 0) AS tokensUsed,
        COALESCE(SUM(u.MessageCount), 0) AS widgetMessagesCount,
        COUNT(u.UsageLogId) AS apiCallsCount
       FROM Businesses b
       LEFT JOIN Subscriptions s ON s.BusinessId = b.BusinessId AND s.Status = 'Active'
       LEFT JOIN SubscriptionPlans sp ON sp.PlanId = s.PlanId
       LEFT JOIN UsageLogs u ON u.BusinessId = b.BusinessId AND u.CreatedOn >= ?
       GROUP BY b.BusinessId, b.Name, b.Status, sp.Name, sp.MaxMonthlyMessages
       ORDER BY tokensUsed DESC, b.BusinessId ASC
       LIMIT 20`
    )
    .all(sinceIso);

  res.json({
    success: true,
    data: {
      days,
      summary,
      dailySeries,
      modelBreakdown,
      tenantLeaderboard,
    },
  });
});

// Super Admin: Platform Conversation Monitoring
router.get('/conversations', authenticate, requireRoles('SuperAdmin'), (req, res) => {
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  const status = typeof req.query.status === 'string' ? req.query.status.trim().toLowerCase() : 'all';
  const businessIdRaw = req.query.businessId ? Number(req.query.businessId) : null;
  const businessId = businessIdRaw && Number.isInteger(businessIdRaw) && businessIdRaw > 0 ? businessIdRaw : null;
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize) || 15));
  const offset = (page - 1) * pageSize;

  const where: string[] = [];
  const params: Array<string | number> = [];

  if (businessId) {
    where.push('conv.BusinessId = ?');
    params.push(businessId);
  }
  if (status === 'resolved') {
    where.push('conv.IsResolved = 1');
  } else if (status === 'open') {
    where.push('conv.IsResolved = 0');
  } else if (status === 'unanswered') {
    where.push('EXISTS (SELECT 1 FROM Messages mu WHERE mu.ConversationId = conv.ConversationId AND mu.IsUnanswered = 1)');
  }
  if (search) {
    where.push(
      `(b.Name LIKE ? OR c.Name LIKE ? OR conv.VisitorSession LIKE ? OR COALESCE(conv.VisitorDomain, '') LIKE ?)`
    );
    const like = `%${search}%`;
    params.push(like, like, like, like);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const totalRow = db
    .prepare(
      `SELECT COUNT(*) AS total
       FROM Conversations conv
       JOIN Businesses b ON b.BusinessId = conv.BusinessId
       JOIN Chatbots c ON c.ChatbotId = conv.ChatbotId
       ${whereSql}`
    )
    .get(...params) as { total: number };

  const items = db
    .prepare(
      `SELECT
        conv.ConversationId AS conversationId,
        conv.BusinessId AS businessId,
        b.Name AS businessName,
        conv.ChatbotId AS chatbotId,
        c.Name AS chatbotName,
        conv.VisitorSession AS visitorSession,
        conv.VisitorDomain AS visitorDomain,
        conv.IsResolved AS isResolved,
        conv.CreatedOn AS createdOn,
        conv.UpdatedOn AS updatedOn,
        (SELECT COUNT(*) FROM Messages m WHERE m.ConversationId = conv.ConversationId) AS messageCount,
        (SELECT COUNT(*) FROM Messages m WHERE m.ConversationId = conv.ConversationId AND m.IsUnanswered = 1) AS unansweredCount
       FROM Conversations conv
       JOIN Businesses b ON b.BusinessId = conv.BusinessId
       JOIN Chatbots c ON c.ChatbotId = conv.ChatbotId
       ${whereSql}
       ORDER BY conv.UpdatedOn DESC
       LIMIT ? OFFSET ?`
    )
    .all(...params, pageSize, offset) as Array<Record<string, unknown>>;

  res.json({
    success: true,
    data: {
      items: items.map((r) => ({ ...r, isResolved: Boolean(r.isResolved) })),
      total: totalRow.total,
      page,
      pageSize,
    },
  });
});

// Super Admin: Inspect any Conversation Transcript
router.get('/conversations/:id', authenticate, requireRoles('SuperAdmin'), (req, res) => {
  const conversationId = Number(req.params.id);
  if (!Number.isInteger(conversationId) || conversationId <= 0) {
    res.status(400).json({ success: false, message: 'Invalid conversation ID.' });
    return;
  }

  const conversation = db
    .prepare(
      `SELECT
        conv.ConversationId AS conversationId,
        conv.BusinessId AS businessId,
        b.Name AS businessName,
        conv.ChatbotId AS chatbotId,
        c.Name AS chatbotName,
        conv.VisitorSession AS visitorSession,
        conv.VisitorDomain AS visitorDomain,
        conv.IsResolved AS isResolved,
        conv.CreatedOn AS createdOn,
        conv.UpdatedOn AS updatedOn
       FROM Conversations conv
       JOIN Businesses b ON b.BusinessId = conv.BusinessId
       JOIN Chatbots c ON c.ChatbotId = conv.ChatbotId
       WHERE conv.ConversationId = ?`
    )
    .get(conversationId) as Record<string, unknown> | undefined;

  if (!conversation) {
    res.status(404).json({ success: false, message: 'Conversation not found.' });
    return;
  }

  const messages = db
    .prepare(
      `SELECT
        MessageId AS messageId,
        ConversationId AS conversationId,
        SenderType AS senderType,
        Content AS content,
        TokensUsed AS tokensUsed,
        IsUnanswered AS isUnanswered,
        CreatedOn AS createdOn
       FROM Messages
       WHERE ConversationId = ?
       ORDER BY MessageId ASC`
    )
    .all(conversationId) as Array<Record<string, unknown>>;

  res.json({
    success: true,
    data: {
      conversation: { ...conversation, isResolved: Boolean(conversation.isResolved) },
      messages: messages.map((m) => ({ ...m, isUnanswered: Boolean(m.isUnanswered) })),
    },
  });
});

export default router;
