import { Router } from 'express';
import { db, writeAuditLog } from '../db.ts';
import { authenticate, requireRoles, type AuthenticatedRequest } from '../middleware/auth.ts';

const router = Router();

const VALID_STATUSES = new Set(['Open', 'InProgress', 'Resolved', 'Closed']);
const VALID_PRIORITIES = new Set(['Low', 'Normal', 'High', 'Urgent']);
const VALID_CATEGORIES = new Set(['General', 'Billing', 'Technical', 'AIQuality', 'Security']);

// Tenant: List Support Tickets belonging to authenticated BusinessId
router.get('/tickets', authenticate, requireRoles('BusinessOwner', 'BusinessAdmin'), (req: AuthenticatedRequest, res) => {
  const businessId = req.user?.businessId;
  if (!businessId) {
    res.status(403).json({ success: false, message: 'No business workspace assigned.' });
    return;
  }

  const status = typeof req.query.status === 'string' ? req.query.status.trim() : 'all';
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize) || 15));
  const offset = (page - 1) * pageSize;

  const where = ['t.BusinessId = ?'];
  const params: Array<string | number> = [businessId];

  if (status !== 'all' && VALID_STATUSES.has(status)) {
    where.push('t.Status = ?');
    params.push(status);
  }

  const whereSql = `WHERE ${where.join(' AND ')}`;

  const totalRow = db
    .prepare(`SELECT COUNT(*) AS total FROM SupportTickets t ${whereSql}`)
    .get(...params) as { total: number };

  const items = db
    .prepare(
      `SELECT
        t.TicketId AS ticketId,
        t.BusinessId AS businessId,
        t.UserId AS userId,
        u.FullName AS createdByName,
        t.Subject AS subject,
        t.Category AS category,
        t.Status AS status,
        t.Priority AS priority,
        t.LastRepliedOn AS lastRepliedOn,
        t.CreatedOn AS createdOn,
        t.UpdatedOn AS updatedOn,
        (SELECT COUNT(*) FROM SupportTicketMessages m WHERE m.TicketId = t.TicketId) AS messageCount
       FROM SupportTickets t
       JOIN Users u ON u.UserId = t.UserId
       ${whereSql}
       ORDER BY t.UpdatedOn DESC, t.TicketId DESC
       LIMIT ? OFFSET ?`
    )
    .all(...params, pageSize, offset);

  res.json({
    success: true,
    data: {
      items,
      total: totalRow.total,
      page,
      pageSize,
    },
  });
});

// Tenant: Create Support Ticket
router.post('/tickets', authenticate, requireRoles('BusinessOwner', 'BusinessAdmin'), (req: AuthenticatedRequest, res) => {
  const businessId = req.user?.businessId;
  const userId = req.user?.userId;
  if (!businessId || !userId) {
    res.status(403).json({ success: false, message: 'No business workspace assigned.' });
    return;
  }

  const subject = typeof req.body?.subject === 'string' ? req.body.subject.trim() : '';
  const category = typeof req.body?.category === 'string' && VALID_CATEGORIES.has(req.body.category) ? req.body.category : 'General';
  const priority = typeof req.body?.priority === 'string' && VALID_PRIORITIES.has(req.body.priority) ? req.body.priority : 'Normal';
  const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';

  if (subject.length < 4 || subject.length > 255) {
    res.status(400).json({ success: false, message: 'Subject must be between 4 and 255 characters.' });
    return;
  }
  if (message.length < 10 || message.length > 4000) {
    res.status(400).json({ success: false, message: 'Message description must be between 10 and 4000 characters.' });
    return;
  }

  let ticketId = 0;
  db.exec('BEGIN');
  try {
    const tRes = db
      .prepare(
        `INSERT INTO SupportTickets (BusinessId, UserId, Subject, Category, Status, Priority, LastRepliedOn)
         VALUES (?, ?, ?, ?, 'Open', ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))`
      )
      .run(businessId, userId, subject, category, priority);
    ticketId = Number(tRes.lastInsertRowid);

    db.prepare(
      `INSERT INTO SupportTicketMessages (TicketId, UserId, SenderRole, Body)
       VALUES (?, ?, 'Business', ?)`
    ).run(ticketId, userId, message);

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  writeAuditLog({
    userId,
    businessId,
    action: 'SupportTicketCreated',
    entityType: 'SupportTicket',
    entityId: ticketId,
    details: `Opened ticket "${subject}" [${priority}]`,
    ipAddress: req.ip,
  });

  res.status(201).json({
    success: true,
    message: 'Support ticket submitted.',
    data: { ticketId },
  });
});

// Tenant or Super Admin: Get Ticket Thread
router.get('/tickets/:id', authenticate, requireRoles('SuperAdmin', 'BusinessOwner', 'BusinessAdmin'), (req: AuthenticatedRequest, res) => {
  const ticketId = Number(req.params.id);
  if (!Number.isInteger(ticketId) || ticketId <= 0) {
    res.status(400).json({ success: false, message: 'Invalid ticket ID.' });
    return;
  }

  const ticket = db
    .prepare(
      `SELECT
        t.TicketId AS ticketId,
        t.BusinessId AS businessId,
        b.Name AS businessName,
        t.UserId AS userId,
        u.FullName AS createdByName,
        u.Email AS createdByEmail,
        t.Subject AS subject,
        t.Category AS category,
        t.Status AS status,
        t.Priority AS priority,
        t.LastRepliedOn AS lastRepliedOn,
        t.CreatedOn AS createdOn,
        t.UpdatedOn AS updatedOn
       FROM SupportTickets t
       JOIN Businesses b ON b.BusinessId = t.BusinessId
       JOIN Users u ON u.UserId = t.UserId
       WHERE t.TicketId = ?`
    )
    .get(ticketId) as Record<string, unknown> | undefined;

  if (!ticket) {
    res.status(404).json({ success: false, message: 'Support ticket not found.' });
    return;
  }

  if (req.user?.role !== 'SuperAdmin' && ticket.businessId !== req.user?.businessId) {
    res.status(404).json({ success: false, message: 'Support ticket not found.' });
    return;
  }

  const messages = db
    .prepare(
      `SELECT
        m.TicketMessageId AS ticketMessageId,
        m.TicketId AS ticketId,
        m.UserId AS userId,
        COALESCE(u.FullName, 'System') AS senderName,
        m.SenderRole AS senderRole,
        m.Body AS body,
        m.CreatedOn AS createdOn
       FROM SupportTicketMessages m
       LEFT JOIN Users u ON u.UserId = m.UserId
       WHERE m.TicketId = ?
       ORDER BY m.TicketMessageId ASC`
    )
    .all(ticketId);

  res.json({
    success: true,
    data: { ticket, messages },
  });
});

// Tenant or Super Admin: Reply to Ticket
router.post('/tickets/:id/messages', authenticate, requireRoles('SuperAdmin', 'BusinessOwner', 'BusinessAdmin'), (req: AuthenticatedRequest, res) => {
  const ticketId = Number(req.params.id);
  if (!Number.isInteger(ticketId) || ticketId <= 0) {
    res.status(400).json({ success: false, message: 'Invalid ticket ID.' });
    return;
  }

  const body = typeof req.body?.body === 'string' ? req.body.body.trim() : '';
  if (body.length < 2 || body.length > 4000) {
    res.status(400).json({ success: false, message: 'Reply message must be between 2 and 4000 characters.' });
    return;
  }

  const ticket = db
    .prepare(`SELECT TicketId, BusinessId, Status FROM SupportTickets WHERE TicketId = ?`)
    .get(ticketId) as { TicketId: number; BusinessId: number; Status: string } | undefined;

  if (!ticket) {
    res.status(404).json({ success: false, message: 'Support ticket not found.' });
    return;
  }

  const isSuperAdmin = req.user?.role === 'SuperAdmin';
  if (!isSuperAdmin && ticket.BusinessId !== req.user?.businessId) {
    res.status(404).json({ success: false, message: 'Support ticket not found.' });
    return;
  }

  if (ticket.Status === 'Closed' && !isSuperAdmin) {
    res.status(400).json({ success: false, message: 'This ticket is closed. Please open a new support ticket.' });
    return;
  }

  const senderRole = isSuperAdmin ? 'SuperAdmin' : 'Business';
  const nextStatus = isSuperAdmin && ticket.Status === 'Open' ? 'InProgress' : ticket.Status;

  db.exec('BEGIN');
  try {
    db.prepare(
      `INSERT INTO SupportTicketMessages (TicketId, UserId, SenderRole, Body)
       VALUES (?, ?, ?, ?)`
    ).run(ticketId, req.user?.userId ?? null, senderRole, body);

    db.prepare(
      `UPDATE SupportTickets
       SET Status = ?,
           LastRepliedOn = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
           UpdatedOn = strftime('%Y-%m-%dT%H:%M:%fZ','now')
       WHERE TicketId = ?`
    ).run(nextStatus, ticketId);

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  res.status(201).json({
    success: true,
    message: 'Reply added.',
    data: { ticketId, status: nextStatus },
  });
});

// Super Admin: List Platform Support Tickets
router.get('/admin/tickets', authenticate, requireRoles('SuperAdmin'), (req, res) => {
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  const status = typeof req.query.status === 'string' ? req.query.status.trim() : 'all';
  const priority = typeof req.query.priority === 'string' ? req.query.priority.trim() : 'all';
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize) || 15));
  const offset = (page - 1) * pageSize;

  const where: string[] = [];
  const params: Array<string | number> = [];

  if (status !== 'all' && VALID_STATUSES.has(status)) {
    where.push('t.Status = ?');
    params.push(status);
  }
  if (priority !== 'all' && VALID_PRIORITIES.has(priority)) {
    where.push('t.Priority = ?');
    params.push(priority);
  }
  if (search) {
    where.push('(t.Subject LIKE ? OR b.Name LIKE ? OR u.Email LIKE ?)');
    const like = `%${search}%`;
    params.push(like, like, like);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const totalRow = db
    .prepare(
      `SELECT COUNT(*) AS total
       FROM SupportTickets t
       JOIN Businesses b ON b.BusinessId = t.BusinessId
       JOIN Users u ON u.UserId = t.UserId
       ${whereSql}`
    )
    .get(...params) as { total: number };

  const items = db
    .prepare(
      `SELECT
        t.TicketId AS ticketId,
        t.BusinessId AS businessId,
        b.Name AS businessName,
        t.UserId AS userId,
        u.FullName AS createdByName,
        u.Email AS createdByEmail,
        t.Subject AS subject,
        t.Category AS category,
        t.Status AS status,
        t.Priority AS priority,
        t.LastRepliedOn AS lastRepliedOn,
        t.CreatedOn AS createdOn,
        t.UpdatedOn AS updatedOn,
        (SELECT COUNT(*) FROM SupportTicketMessages m WHERE m.TicketId = t.TicketId) AS messageCount
       FROM SupportTickets t
       JOIN Businesses b ON b.BusinessId = t.BusinessId
       JOIN Users u ON u.UserId = t.UserId
       ${whereSql}
       ORDER BY CASE t.Priority WHEN 'Urgent' THEN 0 WHEN 'High' THEN 1 WHEN 'Normal' THEN 2 ELSE 3 END,
                t.UpdatedOn DESC
       LIMIT ? OFFSET ?`
    )
    .all(...params, pageSize, offset);

  const summary = db
    .prepare(
      `SELECT
        COUNT(CASE WHEN Status = 'Open' THEN 1 END) AS openCount,
        COUNT(CASE WHEN Status = 'InProgress' THEN 1 END) AS inProgressCount,
        COUNT(CASE WHEN Status = 'Resolved' THEN 1 END) AS resolvedCount,
        COUNT(CASE WHEN Priority IN ('High', 'Urgent') AND Status IN ('Open', 'InProgress') THEN 1 END) AS urgentActiveCount
       FROM SupportTickets`
    )
    .get();

  res.json({
    success: true,
    data: {
      items,
      total: totalRow.total,
      page,
      pageSize,
      summary,
    },
  });
});

// Super Admin: Update Ticket Status / Priority
router.patch('/admin/tickets/:id', authenticate, requireRoles('SuperAdmin'), (req: AuthenticatedRequest, res) => {
  const ticketId = Number(req.params.id);
  if (!Number.isInteger(ticketId) || ticketId <= 0) {
    res.status(400).json({ success: false, message: 'Invalid ticket ID.' });
    return;
  }

  const existing = db
    .prepare(`SELECT TicketId, BusinessId, Status, Priority FROM SupportTickets WHERE TicketId = ?`)
    .get(ticketId) as { TicketId: number; BusinessId: number; Status: string; Priority: string } | undefined;

  if (!existing) {
    res.status(404).json({ success: false, message: 'Support ticket not found.' });
    return;
  }

  const nextStatus = typeof req.body?.status === 'string' ? req.body.status : existing.Status;
  const nextPriority = typeof req.body?.priority === 'string' ? req.body.priority : existing.Priority;

  if (!VALID_STATUSES.has(nextStatus) || !VALID_PRIORITIES.has(nextPriority)) {
    res.status(400).json({ success: false, message: 'Invalid ticket status or priority.' });
    return;
  }

  db.prepare(
    `UPDATE SupportTickets
     SET Status = ?, Priority = ?, UpdatedOn = strftime('%Y-%m-%dT%H:%M:%fZ','now')
     WHERE TicketId = ?`
  ).run(nextStatus, nextPriority, ticketId);

  writeAuditLog({
    userId: req.user?.userId,
    businessId: existing.BusinessId,
    action: 'SupportTicketUpdated',
    entityType: 'SupportTicket',
    entityId: ticketId,
    details: `Updated ticket #${ticketId} to ${nextStatus} [${nextPriority}]`,
    ipAddress: req.ip,
  });

  res.json({
    success: true,
    message: 'Support ticket updated.',
    data: { ticketId, status: nextStatus, priority: nextPriority },
  });
});

export default router;
