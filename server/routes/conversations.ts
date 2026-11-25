import { Router } from 'express';
import { db, writeAuditLog } from '../db.ts';
import { authenticate, requireRoles, type AuthenticatedRequest } from '../middleware/auth.ts';

const router = Router();
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function escapeCsvCell(value: unknown): string {
  const raw = value === null || value === undefined ? '' : String(value);
  // Prevent CSV spreadsheet formula injection
  const formulaSafe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return `"${formulaSafe.replace(/"/g, '""')}"`;
}

// List tenant-scoped conversations (Search, Chatbot filter, Status filter, Date range, Pagination)
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
    const chatbotIdRaw = req.query.chatbotId ? Number(req.query.chatbotId) : null;
    const chatbotId = chatbotIdRaw && Number.isInteger(chatbotIdRaw) && chatbotIdRaw > 0 ? chatbotIdRaw : null;
    const dateFrom = typeof req.query.dateFrom === 'string' && DATE_RE.test(req.query.dateFrom.trim()) ? req.query.dateFrom.trim() : '';
    const dateTo = typeof req.query.dateTo === 'string' && DATE_RE.test(req.query.dateTo.trim()) ? req.query.dateTo.trim() : '';
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize) || 15));
    const offset = (page - 1) * pageSize;

    const where: string[] = ['conv.BusinessId = ?'];
    const params: Array<string | number> = [businessId];

    if (chatbotId) {
      where.push('conv.ChatbotId = ?');
      params.push(chatbotId);
    }

    if (status === 'resolved') {
      where.push('conv.IsResolved = 1');
    } else if (status === 'open') {
      where.push('conv.IsResolved = 0');
    } else if (status === 'unanswered') {
      where.push('EXISTS (SELECT 1 FROM Messages m_u WHERE m_u.ConversationId = conv.ConversationId AND m_u.IsUnanswered = 1)');
    }

    if (dateFrom) {
      where.push('substr(conv.CreatedOn, 1, 10) >= ?');
      params.push(dateFrom);
    }
    if (dateTo) {
      where.push('substr(conv.CreatedOn, 1, 10) <= ?');
      params.push(dateTo);
    }

    if (search) {
      where.push(
        `(conv.VisitorSession LIKE ? OR COALESCE(conv.VisitorDomain, '') LIKE ? OR c.Name LIKE ? OR EXISTS (SELECT 1 FROM Messages ms WHERE ms.ConversationId = conv.ConversationId AND ms.Content LIKE ?))`
      );
      const like = `%${search}%`;
      params.push(like, like, like, like);
    }

    const whereSql = `WHERE ${where.join(' AND ')}`;

    const totalRow = db
      .prepare(
        `SELECT COUNT(*) AS total
         FROM Conversations conv
         JOIN Chatbots c ON c.ChatbotId = conv.ChatbotId
         ${whereSql}`
      )
      .get(...params) as { total: number };

    const items = db
      .prepare(
        `SELECT
          conv.ConversationId AS conversationId,
          conv.ChatbotId AS chatbotId,
          c.Name AS chatbotName,
          conv.VisitorSession AS visitorSession,
          conv.VisitorDomain AS visitorDomain,
          conv.IsResolved AS isResolved,
          conv.CreatedOn AS createdOn,
          conv.UpdatedOn AS updatedOn,
          (SELECT COUNT(*) FROM Messages m WHERE m.ConversationId = conv.ConversationId) AS messageCount,
          (SELECT COUNT(*) FROM Messages m WHERE m.ConversationId = conv.ConversationId AND m.IsUnanswered = 1) AS unansweredCount,
          (SELECT COALESCE(SUM(m.TokensUsed), 0) FROM Messages m WHERE m.ConversationId = conv.ConversationId) AS tokensUsed,
          (SELECT m.Content FROM Messages m WHERE m.ConversationId = conv.ConversationId AND m.SenderType = 'User' ORDER BY m.MessageId ASC LIMIT 1) AS firstUserQuestion
         FROM Conversations conv
         JOIN Chatbots c ON c.ChatbotId = conv.ChatbotId
         ${whereSql}
         ORDER BY conv.UpdatedOn DESC
         LIMIT ? OFFSET ?`
      )
      .all(...params, pageSize, offset) as Array<Record<string, unknown>>;

    res.json({
      success: true,
      data: {
        items: items.map((row) => ({ ...row, isResolved: Boolean(row.isResolved) })),
        total: totalRow.total,
        page,
        pageSize,
      },
    });
  }
);

// Export tenant-scoped conversations as CSV (must be defined BEFORE /:id)
router.get(
  '/export',
  authenticate,
  requireRoles('BusinessOwner', 'BusinessAdmin', 'BusinessStaff'),
  (req: AuthenticatedRequest, res) => {
    const businessId = req.user?.businessId;
    if (!businessId) {
      res.status(403).json({ success: false, message: 'No business workspace assigned.' });
      return;
    }

    const chatbotIdRaw = req.query.chatbotId ? Number(req.query.chatbotId) : null;
    const chatbotId = chatbotIdRaw && Number.isInteger(chatbotIdRaw) && chatbotIdRaw > 0 ? chatbotIdRaw : null;
    const status = typeof req.query.status === 'string' ? req.query.status.trim().toLowerCase() : 'all';

    const where: string[] = ['conv.BusinessId = ?'];
    const params: Array<string | number> = [businessId];

    if (chatbotId) {
      where.push('conv.ChatbotId = ?');
      params.push(chatbotId);
    }
    if (status === 'resolved') {
      where.push('conv.IsResolved = 1');
    } else if (status === 'open') {
      where.push('conv.IsResolved = 0');
    } else if (status === 'unanswered') {
      where.push('EXISTS (SELECT 1 FROM Messages m_u WHERE m_u.ConversationId = conv.ConversationId AND m_u.IsUnanswered = 1)');
    }

    const rows = db
      .prepare(
        `SELECT
          conv.ConversationId AS conversationId,
          c.Name AS chatbotName,
          conv.VisitorSession AS visitorSession,
          conv.VisitorDomain AS visitorDomain,
          conv.IsResolved AS isResolved,
          m.MessageId AS messageId,
          m.SenderType AS senderType,
          m.Content AS content,
          m.TokensUsed AS tokensUsed,
          m.IsUnanswered AS isUnanswered,
          m.CreatedOn AS messageTimestamp
         FROM Conversations conv
         JOIN Chatbots c ON c.ChatbotId = conv.ChatbotId
         JOIN Messages m ON m.ConversationId = conv.ConversationId
         WHERE ${where.join(' AND ')}
         ORDER BY conv.ConversationId DESC, m.MessageId ASC
         LIMIT 10000`
      )
      .all(...params) as Array<Record<string, unknown>>;

    const headers = [
      'ConversationId',
      'ChatbotName',
      'VisitorSession',
      'VisitorDomain',
      'Status',
      'MessageId',
      'SenderType',
      'Content',
      'TokensUsed',
      'IsUnanswered',
      'MessageTimestamp',
    ];

    const lines = [headers.join(',')];
    for (const r of rows) {
      lines.push(
        [
          escapeCsvCell(r.conversationId),
          escapeCsvCell(r.chatbotName),
          escapeCsvCell(r.visitorSession),
          escapeCsvCell(r.visitorDomain || ''),
          escapeCsvCell(r.isResolved ? 'Resolved' : 'Open'),
          escapeCsvCell(r.messageId),
          escapeCsvCell(r.senderType),
          escapeCsvCell(r.content),
          escapeCsvCell(r.tokensUsed),
          escapeCsvCell(r.isUnanswered ? 'Yes' : 'No'),
          escapeCsvCell(r.messageTimestamp),
        ].join(',')
      );
    }

    writeAuditLog({
      userId: req.user?.userId,
      businessId,
      action: 'ConversationsExported',
      entityType: 'Conversation',
      entityId: chatbotId ?? 'all',
      details: `Exported ${rows.length} message rows as CSV`,
      ipAddress: req.ip,
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="chatpilot-conversations-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(`\uFEFF${lines.join('\n')}`);
  }
);

// Get single conversation transcript (Tenant isolated)
router.get(
  '/:id',
  authenticate,
  requireRoles('BusinessOwner', 'BusinessAdmin', 'BusinessStaff'),
  (req: AuthenticatedRequest, res) => {
    const businessId = req.user?.businessId;
    const conversationId = Number(req.params.id);

    if (!businessId) {
      res.status(403).json({ success: false, message: 'No business workspace assigned.' });
      return;
    }
    if (!Number.isInteger(conversationId) || conversationId <= 0) {
      res.status(400).json({ success: false, message: 'Invalid conversation ID.' });
      return;
    }

    const conversation = db
      .prepare(
        `SELECT
          conv.ConversationId AS conversationId,
          conv.ChatbotId AS chatbotId,
          c.Name AS chatbotName,
          conv.BusinessId AS businessId,
          conv.VisitorSession AS visitorSession,
          conv.VisitorDomain AS visitorDomain,
          conv.IsResolved AS isResolved,
          conv.CreatedOn AS createdOn,
          conv.UpdatedOn AS updatedOn
         FROM Conversations conv
         JOIN Chatbots c ON c.ChatbotId = conv.ChatbotId
         WHERE conv.ConversationId = ? AND conv.BusinessId = ?`
      )
      .get(conversationId, businessId) as Record<string, unknown> | undefined;

    if (!conversation) {
      res.status(404).json({ success: false, message: 'Conversation not found in your workspace.' });
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
         WHERE ConversationId = ? AND BusinessId = ?
         ORDER BY MessageId ASC`
      )
      .all(conversationId, businessId) as Array<Record<string, unknown>>;

    res.json({
      success: true,
      data: {
        conversation: {
          ...conversation,
          isResolved: Boolean(conversation.isResolved),
        },
        messages: messages.map((m) => ({
          ...m,
          isUnanswered: Boolean(m.isUnanswered),
        })),
      },
    });
  }
);

// Mark conversation resolved / reopen (Tenant isolated)
router.patch(
  '/:id/resolve',
  authenticate,
  requireRoles('BusinessOwner', 'BusinessAdmin', 'BusinessStaff'),
  (req: AuthenticatedRequest, res) => {
    const businessId = req.user?.businessId;
    const conversationId = Number(req.params.id);

    if (!businessId) {
      res.status(403).json({ success: false, message: 'No business workspace assigned.' });
      return;
    }
    if (!Number.isInteger(conversationId) || conversationId <= 0) {
      res.status(400).json({ success: false, message: 'Invalid conversation ID.' });
      return;
    }
    if (typeof req.body?.isResolved !== 'boolean') {
      res.status(400).json({ success: false, message: 'isResolved boolean flag is required.' });
      return;
    }

    const existing = db
      .prepare(`SELECT ConversationId, VisitorSession FROM Conversations WHERE ConversationId = ? AND BusinessId = ?`)
      .get(conversationId, businessId) as { ConversationId: number; VisitorSession: string } | undefined;

    if (!existing) {
      res.status(404).json({ success: false, message: 'Conversation not found in your workspace.' });
      return;
    }

    const isResolved = req.body.isResolved;
    db.prepare(
      `UPDATE Conversations
       SET IsResolved = ?, UpdatedOn = strftime('%Y-%m-%dT%H:%M:%fZ','now')
       WHERE ConversationId = ? AND BusinessId = ?`
    ).run(isResolved ? 1 : 0, conversationId, businessId);

    writeAuditLog({
      userId: req.user?.userId,
      businessId,
      action: isResolved ? 'ConversationResolved' : 'ConversationReopened',
      entityType: 'Conversation',
      entityId: conversationId,
      details: `Session ${existing.VisitorSession} marked ${isResolved ? 'Resolved' : 'Open'}`,
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      message: isResolved ? 'Conversation marked as resolved.' : 'Conversation reopened.',
      data: { conversationId, isResolved },
    });
  }
);

export default router;
