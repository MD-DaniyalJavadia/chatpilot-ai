import { Router } from 'express';
import { db, writeAuditLog } from '../db.ts';
import { authenticate, requireRoles, type AuthenticatedRequest } from '../middleware/auth.ts';
import { hashPassword, verifyPassword } from '../utils/crypto.ts';

const router = Router();

// Super Admin: List all users across platform
router.get('/', authenticate, requireRoles('SuperAdmin'), (req, res) => {
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  const role = typeof req.query.role === 'string' ? req.query.role.trim() : '';
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize) || 10));
  const offset = (page - 1) * pageSize;

  const whereClauses: string[] = [];
  const params: (string | number)[] = [];

  if (search) {
    whereClauses.push('(u.FullName LIKE ? OR u.Email LIKE ?)');
    const like = `%${search}%`;
    params.push(like, like);
  }
  if (role) {
    whereClauses.push('COALESCE(gr.Name, br.Name) = ?');
    params.push(role);
  }

  const baseFrom = `
    FROM Users u
    LEFT JOIN UserRoles ur ON ur.UserId = u.UserId
    LEFT JOIN Roles gr ON gr.RoleId = ur.RoleId
    LEFT JOIN BusinessUsers bu ON bu.UserId = u.UserId
    LEFT JOIN Roles br ON br.RoleId = bu.RoleId
    LEFT JOIN Businesses b ON b.BusinessId = bu.BusinessId
  `;

  const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';

  const totalRow = db
    .prepare(`SELECT COUNT(DISTINCT u.UserId) AS total ${baseFrom} ${whereSql}`)
    .get(...params) as { total: number };

  const items = db
    .prepare(
      `SELECT
        u.UserId AS userId,
        u.FullName AS fullName,
        u.Email AS email,
        u.IsActive AS isActive,
        u.LastLoginOn AS lastLoginOn,
        u.CreatedOn AS createdOn,
        COALESCE(gr.Name, br.Name, 'Unassigned') AS role,
        b.BusinessId AS businessId,
        b.Name AS businessName
      ${baseFrom}
      ${whereSql}
      GROUP BY u.UserId
      ORDER BY u.CreatedOn DESC
      LIMIT ? OFFSET ?`
    )
    .all(...params, pageSize, offset);

  res.json({
    success: true,
    data: { items, total: totalRow.total, page, pageSize },
  });
});

// Super Admin: Toggle user active state
router.patch('/:id/status', authenticate, requireRoles('SuperAdmin'), (req: AuthenticatedRequest, res) => {
  const targetUserId = Number(req.params.id);
  const isActive = Boolean(req.body?.isActive);

  if (!Number.isInteger(targetUserId) || targetUserId <= 0) {
    res.status(400).json({ success: false, message: 'Invalid user ID.' });
    return;
  }
  if (targetUserId === req.user?.userId && !isActive) {
    res.status(400).json({ success: false, message: 'You cannot deactivate your own Super Admin account.' });
    return;
  }

  const target = db.prepare(`SELECT UserId, Email FROM Users WHERE UserId = ?`).get(targetUserId) as
    | { UserId: number; Email: string }
    | undefined;
  if (!target) {
    res.status(404).json({ success: false, message: 'User not found.' });
    return;
  }

  db.exec('BEGIN');
  try {
    db.prepare(`UPDATE Users SET IsActive = ?, UpdatedOn = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE UserId = ?`)
      .run(isActive ? 1 : 0, targetUserId);
    if (!isActive) {
      db.prepare(
        `UPDATE RefreshTokens
         SET RevokedOn = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
             UpdatedOn = strftime('%Y-%m-%dT%H:%M:%fZ','now')
         WHERE UserId = ? AND RevokedOn IS NULL`
      ).run(targetUserId);
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  writeAuditLog({
    userId: req.user?.userId,
    action: isActive ? 'UserActivated' : 'UserDeactivated',
    entityType: 'User',
    entityId: targetUserId,
    details: `${target.Email} -> ${isActive ? 'Active' : 'Inactive'}`,
    ipAddress: req.ip,
  });

  res.json({ success: true, message: `User ${isActive ? 'activated' : 'deactivated'}.` });
});

// Self Account Profile Update
router.put('/me/profile', authenticate, (req: AuthenticatedRequest, res) => {
  const fullName = typeof req.body?.fullName === 'string' ? req.body.fullName.trim() : '';
  if (fullName.length < 2 || fullName.length > 150) {
    res.status(400).json({ success: false, message: 'Full name must be between 2 and 150 characters.' });
    return;
  }

  db.prepare(`UPDATE Users SET FullName = ?, UpdatedOn = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE UserId = ?`)
    .run(fullName, req.user!.userId);

  writeAuditLog({
    userId: req.user!.userId,
    businessId: req.user!.businessId,
    action: 'AccountProfileUpdated',
    entityType: 'User',
    entityId: req.user!.userId,
    details: 'Updated display name',
    ipAddress: req.ip,
  });

  res.json({ success: true, message: 'Account profile updated.', data: { fullName } });
});

// Self Password Update
router.put('/me/password', authenticate, (req: AuthenticatedRequest, res) => {
  const currentPassword = typeof req.body?.currentPassword === 'string' ? req.body.currentPassword : '';
  const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';

  if (!currentPassword || newPassword.length < 8 || newPassword.length > 128) {
    res.status(400).json({ success: false, message: 'New password must be between 8 and 128 characters.' });
    return;
  }

  const row = db
    .prepare(`SELECT PasswordHash FROM Users WHERE UserId = ?`)
    .get(req.user!.userId) as { PasswordHash: string } | undefined;

  if (!row || !verifyPassword(currentPassword, row.PasswordHash)) {
    res.status(400).json({ success: false, message: 'Current password is incorrect.' });
    return;
  }

  const newHash = hashPassword(newPassword);
  db.exec('BEGIN');
  try {
    db.prepare(`UPDATE Users SET PasswordHash = ?, UpdatedOn = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE UserId = ?`)
      .run(newHash, req.user!.userId);
    db.prepare(
      `UPDATE RefreshTokens
       SET RevokedOn = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
           UpdatedOn = strftime('%Y-%m-%dT%H:%M:%fZ','now')
       WHERE UserId = ? AND RevokedOn IS NULL`
    ).run(req.user!.userId);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  writeAuditLog({
    userId: req.user!.userId,
    businessId: req.user!.businessId,
    action: 'PasswordChanged',
    entityType: 'User',
    entityId: req.user!.userId,
    details: 'User rotated account password',
    ipAddress: req.ip,
  });

  res.json({ success: true, message: 'Password updated successfully.' });
});

// Scoped Audit Logs (SuperAdmin sees all; BusinessOwner/BusinessAdmin sees strictly own BusinessId)
router.get(
  '/audit-logs',
  authenticate,
  requireRoles('SuperAdmin', 'BusinessOwner', 'BusinessAdmin'),
  (req: AuthenticatedRequest, res) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize) || 15));
    const offset = (page - 1) * pageSize;

    const isSuperAdmin = req.user!.role === 'SuperAdmin';
    const businessId = req.user!.businessId;

    const whereSql = isSuperAdmin ? '' : 'WHERE a.BusinessId = ?';
    const params = isSuperAdmin ? [] : [businessId!];

    const totalRow = db
      .prepare(`SELECT COUNT(*) AS total FROM AuditLogs a ${whereSql}`)
      .get(...params) as { total: number };

    const items = db
      .prepare(
        `SELECT
          a.AuditLogId AS auditLogId,
          a.Action AS action,
          a.EntityType AS entityType,
          a.EntityId AS entityId,
          a.Details AS details,
          a.IpAddress AS ipAddress,
          a.CreatedOn AS createdOn,
          u.FullName AS actorName,
          u.Email AS actorEmail,
          b.Name AS businessName
        FROM AuditLogs a
        LEFT JOIN Users u ON u.UserId = a.UserId
        LEFT JOIN Businesses b ON b.BusinessId = a.BusinessId
        ${whereSql}
        ORDER BY a.CreatedOn DESC
        LIMIT ? OFFSET ?`
      )
      .all(...params, pageSize, offset);

    res.json({
      success: true,
      data: { items, total: totalRow.total, page, pageSize },
    });
  }
);

export default router;
