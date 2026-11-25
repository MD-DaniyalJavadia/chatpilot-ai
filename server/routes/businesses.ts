import { Router } from 'express';
import { db, writeAuditLog } from '../db.ts';
import { authenticate, requireRoles, type AuthenticatedRequest } from '../middleware/auth.ts';
import { hashPassword } from '../utils/crypto.ts';

const router = Router();
const VALID_STATUSES = new Set(['Active', 'Suspended', 'Deactivated']);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Super Admin: List all businesses with search, status filter, pagination
router.get('/', authenticate, requireRoles('SuperAdmin'), (req, res) => {
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  const status = typeof req.query.status === 'string' ? req.query.status.trim() : '';
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize) || 10));
  const offset = (page - 1) * pageSize;

  const whereClauses: string[] = [];
  const params: (string | number)[] = [];

  if (status && VALID_STATUSES.has(status)) {
    whereClauses.push('b.Status = ?');
    params.push(status);
  }
  if (search) {
    whereClauses.push('(b.Name LIKE ? OR b.SupportEmail LIKE ? OR b.Industry LIKE ?)');
    const like = `%${search}%`;
    params.push(like, like, like);
  }

  const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';

  const totalRow = db
    .prepare(`SELECT COUNT(*) AS total FROM Businesses b ${whereSql}`)
    .get(...params) as { total: number };

  const items = db
    .prepare(
      `SELECT
        b.BusinessId AS businessId,
        b.Name AS name,
        b.Slug AS slug,
        b.Industry AS industry,
        b.WebsiteUrl AS websiteUrl,
        b.SupportEmail AS supportEmail,
        b.Timezone AS timezone,
        b.Status AS status,
        b.CreatedOn AS createdOn,
        COALESCE((
          SELECT sp.Name
          FROM Subscriptions s
          JOIN SubscriptionPlans sp ON sp.PlanId = s.PlanId
          WHERE s.BusinessId = b.BusinessId
            AND s.Status = 'Active'
            AND (s.ExpiresOn IS NULL OR s.ExpiresOn > strftime('%Y-%m-%dT%H:%M:%fZ','now'))
          ORDER BY s.SubscriptionId DESC
          LIMIT 1
        ), 'Free') AS planName,
        (SELECT COUNT(*) FROM BusinessUsers bu WHERE bu.BusinessId = b.BusinessId) AS memberCount,
        (SELECT COUNT(*) FROM Chatbots c WHERE c.BusinessId = b.BusinessId) AS chatbotCount
      FROM Businesses b
      ${whereSql}
      ORDER BY b.CreatedOn DESC
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

// Super Admin: Activate, Suspend, or Deactivate a business
router.patch('/:id/status', authenticate, requireRoles('SuperAdmin'), (req: AuthenticatedRequest, res) => {
  const businessId = Number(req.params.id);
  const status = typeof req.body?.status === 'string' ? req.body.status.trim() : '';

  if (!Number.isInteger(businessId) || businessId <= 0) {
    res.status(400).json({ success: false, message: 'Invalid business identifier.' });
    return;
  }
  if (!VALID_STATUSES.has(status)) {
    res.status(400).json({ success: false, message: 'Status must be Active, Suspended, or Deactivated.' });
    return;
  }

  const existing = db
    .prepare(`SELECT BusinessId, Name, Status FROM Businesses WHERE BusinessId = ?`)
    .get(businessId) as { BusinessId: number; Name: string; Status: string } | undefined;

  if (!existing) {
    res.status(404).json({ success: false, message: 'Business not found.' });
    return;
  }

  db.exec('BEGIN');
  try {
    db.prepare(`UPDATE Businesses SET Status = ?, UpdatedOn = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE BusinessId = ?`)
      .run(status, businessId);

    if (status !== 'Active') {
      db.prepare(
        `UPDATE RefreshTokens
         SET RevokedOn = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
             UpdatedOn = strftime('%Y-%m-%dT%H:%M:%fZ','now')
         WHERE RevokedOn IS NULL
           AND UserId IN (SELECT UserId FROM BusinessUsers WHERE BusinessId = ?)`
      ).run(businessId);
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  writeAuditLog({
    userId: req.user?.userId,
    businessId,
    action: 'BusinessStatusChanged',
    entityType: 'Business',
    entityId: businessId,
    details: `${existing.Name}: ${existing.Status} -> ${status}`,
    ipAddress: req.ip,
  });

  res.json({
    success: true,
    message: `Business status updated to ${status}.`,
    data: { businessId, status },
  });
});

// Tenant-Scoped: Get current business profile
router.get(
  '/current/profile',
  authenticate,
  requireRoles('BusinessOwner', 'BusinessAdmin', 'BusinessStaff'),
  (req: AuthenticatedRequest, res) => {
    const businessId = req.user?.businessId;
    if (!businessId) {
      res.status(403).json({ success: false, message: 'No business workspace assigned.' });
      return;
    }

    const profile = db
      .prepare(
        `SELECT
          BusinessId AS businessId,
          Name AS name,
          Slug AS slug,
          Industry AS industry,
          WebsiteUrl AS websiteUrl,
          SupportEmail AS supportEmail,
          Timezone AS timezone,
          Status AS status,
          CreatedOn AS createdOn,
          UpdatedOn AS updatedOn
        FROM Businesses
        WHERE BusinessId = ?`
      )
      .get(businessId);

    res.json({ success: true, data: profile });
  }
);

// Tenant-Scoped: Update current business profile
router.put(
  '/current/profile',
  authenticate,
  requireRoles('BusinessOwner', 'BusinessAdmin'),
  (req: AuthenticatedRequest, res) => {
    const businessId = req.user?.businessId;
    if (!businessId) {
      res.status(403).json({ success: false, message: 'No business workspace assigned.' });
      return;
    }

    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const industry = typeof req.body?.industry === 'string' ? req.body.industry.trim().slice(0, 100) : null;
    const websiteUrl = typeof req.body?.websiteUrl === 'string' ? req.body.websiteUrl.trim().slice(0, 500) : null;
    const supportEmail = typeof req.body?.supportEmail === 'string' ? req.body.supportEmail.trim().toLowerCase() : null;
    const timezone = typeof req.body?.timezone === 'string' ? req.body.timezone.trim().slice(0, 64) : 'UTC';

    if (name.length < 2 || name.length > 200) {
      res.status(400).json({ success: false, message: 'Business name must be between 2 and 200 characters.' });
      return;
    }
    if (websiteUrl && !/^https?:\/\/.+/i.test(websiteUrl)) {
      res.status(400).json({ success: false, message: 'Website URL must start with http:// or https://.' });
      return;
    }
    if (supportEmail && !EMAIL_RE.test(supportEmail)) {
      res.status(400).json({ success: false, message: 'Please provide a valid support email.' });
      return;
    }

    db.prepare(
      `UPDATE Businesses
       SET Name = ?, Industry = ?, WebsiteUrl = ?, SupportEmail = ?, Timezone = ?, UpdatedOn = strftime('%Y-%m-%dT%H:%M:%fZ','now')
       WHERE BusinessId = ?`
    ).run(name, industry || null, websiteUrl || null, supportEmail || null, timezone || 'UTC', businessId);

    writeAuditLog({
      userId: req.user?.userId,
      businessId,
      action: 'BusinessProfileUpdated',
      entityType: 'Business',
      entityId: businessId,
      details: `Updated workspace profile for "${name}"`,
      ipAddress: req.ip,
    });

    const updated = db
      .prepare(
        `SELECT BusinessId AS businessId, Name AS name, Slug AS slug, Industry AS industry, WebsiteUrl AS websiteUrl, SupportEmail AS supportEmail, Timezone AS timezone, Status AS status, UpdatedOn AS updatedOn
         FROM Businesses WHERE BusinessId = ?`
      )
      .get(businessId);

    res.json({ success: true, message: 'Business profile saved.', data: updated });
  }
);

// Tenant-Scoped: List team members inside current BusinessId
router.get(
  '/current/team',
  authenticate,
  requireRoles('BusinessOwner', 'BusinessAdmin'),
  (req: AuthenticatedRequest, res) => {
    const businessId = req.user?.businessId;
    if (!businessId) {
      res.status(403).json({ success: false, message: 'No business workspace assigned.' });
      return;
    }

    const members = db
      .prepare(
        `SELECT
          u.UserId AS userId,
          u.FullName AS fullName,
          u.Email AS email,
          u.IsActive AS isActive,
          u.LastLoginOn AS lastLoginOn,
          r.Name AS role,
          bu.IsPrimaryOwner AS isPrimaryOwner,
          bu.CreatedOn AS joinedOn
        FROM BusinessUsers bu
        JOIN Users u ON u.UserId = bu.UserId
        JOIN Roles r ON r.RoleId = bu.RoleId
        WHERE bu.BusinessId = ?
        ORDER BY bu.IsPrimaryOwner DESC, bu.CreatedOn ASC`
      )
      .all(businessId);

    res.json({ success: true, data: members });
  }
);

// Tenant-Scoped: Add BusinessAdmin or BusinessStaff member inside current BusinessId
router.post(
  '/current/team',
  authenticate,
  requireRoles('BusinessOwner', 'BusinessAdmin'),
  (req: AuthenticatedRequest, res) => {
    const businessId = req.user?.businessId;
    if (!businessId) {
      res.status(403).json({ success: false, message: 'No business workspace assigned.' });
      return;
    }

    const fullName = typeof req.body?.fullName === 'string' ? req.body.fullName.trim() : '';
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const roleName = typeof req.body?.role === 'string' ? req.body.role.trim() : '';

    if (fullName.length < 2 || fullName.length > 150) {
      res.status(400).json({ success: false, message: 'Full name must be between 2 and 150 characters.' });
      return;
    }
    if (!EMAIL_RE.test(email)) {
      res.status(400).json({ success: false, message: 'Please provide a valid email address.' });
      return;
    }
    if (password.length < 8 || password.length > 128) {
      res.status(400).json({ success: false, message: 'Temporary password must be between 8 and 128 characters.' });
      return;
    }
    if (roleName !== 'BusinessAdmin' && roleName !== 'BusinessStaff') {
      res.status(400).json({ success: false, message: 'Team members can only be assigned BusinessAdmin or BusinessStaff.' });
      return;
    }
    if (req.user?.role === 'BusinessAdmin' && roleName === 'BusinessAdmin') {
      res.status(403).json({ success: false, message: 'Only a Business Owner can add another Business Admin.' });
      return;
    }

    const planCheck = db
      .prepare(
        `SELECT
          COALESCE((
            SELECT sp.MaxTeamMembers
            FROM Subscriptions s
            JOIN SubscriptionPlans sp ON sp.PlanId = s.PlanId
            WHERE s.BusinessId = b.BusinessId
              AND s.Status = 'Active'
              AND (s.ExpiresOn IS NULL OR s.ExpiresOn > strftime('%Y-%m-%dT%H:%M:%fZ','now'))
            ORDER BY s.SubscriptionId DESC
            LIMIT 1
          ), 1) AS maxTeamMembers,
          (SELECT COUNT(*) FROM BusinessUsers WHERE BusinessId = ?) AS currentCount
        FROM Businesses b
        WHERE b.BusinessId = ?`
      )
      .get(businessId, businessId) as { maxTeamMembers: number; currentCount: number } | undefined;

    if (planCheck && planCheck.currentCount >= planCheck.maxTeamMembers) {
      res.status(403).json({
        success: false,
        message: `Team member limit reached (${planCheck.currentCount}/${planCheck.maxTeamMembers}) for your current subscription plan.`,
      });
      return;
    }

    const existingEmail = db.prepare(`SELECT UserId FROM Users WHERE LOWER(Email) = ?`).get(email);
    if (existingEmail) {
      res.status(409).json({ success: false, message: 'This email is already registered on ChatPilot AI.' });
      return;
    }

    const roleRow = db.prepare(`SELECT RoleId FROM Roles WHERE Name = ?`).get(roleName) as { RoleId: number } | undefined;
    if (!roleRow) {
      res.status(500).json({ success: false, message: 'Role definition not found.' });
      return;
    }

    const passwordHash = hashPassword(password);
    let createdUserId = 0;

    db.exec('BEGIN');
    try {
      const uRes = db
        .prepare(`INSERT INTO Users (FullName, Email, PasswordHash, IsActive) VALUES (?, ?, ?, 1)`)
        .run(fullName, email, passwordHash);
      createdUserId = Number(uRes.lastInsertRowid);

      db.prepare(`INSERT INTO BusinessUsers (BusinessId, UserId, RoleId, IsPrimaryOwner) VALUES (?, ?, ?, 0)`)
        .run(businessId, createdUserId, roleRow.RoleId);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }

    writeAuditLog({
      userId: req.user?.userId,
      businessId,
      action: 'TeamMemberAdded',
      entityType: 'User',
      entityId: createdUserId,
      details: `Added ${email} as ${roleName}`,
      ipAddress: req.ip,
    });

    res.status(201).json({
      success: true,
      message: `${fullName} added as ${roleName}.`,
      data: { userId: createdUserId, fullName, email, role: roleName },
    });
  }
);

export default router;
