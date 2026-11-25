import crypto from 'node:crypto';
import { Router } from 'express';
import { config } from '../config.ts';
import { db, getSystemSettings, writeAuditLog } from '../db.ts';
import {
  authenticate,
  getUserAuthContextById,
  type AuthenticatedRequest,
} from '../middleware/auth.ts';
import { createRateLimiter } from '../middleware/rateLimit.ts';
import {
  generateRefreshToken,
  hashPassword,
  hashToken,
  signJwt,
  slugifyBusinessName,
  verifyPassword,
} from '../utils/crypto.ts';

const router = Router();
const authLimiter = createRateLimiter(30, 60 * 1000);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isSuperAdminClaimed(): boolean {
  const row = db
    .prepare(
      `SELECT 1 AS Found
       FROM UserRoles ur
       JOIN Roles r ON ur.RoleId = r.RoleId
       WHERE r.Name = 'SuperAdmin'
       LIMIT 1`
    )
    .get() as { Found: number } | undefined;
  return Boolean(row);
}

function issueSession(userId: number, ipAddress: string | undefined) {
  const user = getUserAuthContextById(userId);
  if (!user) {
    throw new Error('Unable to resolve user session.');
  }

  const accessToken = signJwt({
    sub: user.userId,
    email: user.email,
    role: user.role,
    businessId: user.businessId,
  });

  const { rawToken: refreshToken, tokenHash } = generateRefreshToken();
  const expiresOn = new Date(Date.now() + config.refreshTokenTtlDays * 86400 * 1000).toISOString();

  db.prepare(
    `INSERT INTO RefreshTokens (UserId, TokenHash, ExpiresOn, CreatedByIp)
     VALUES (?, ?, ?, ?)`
  ).run(user.userId, tokenHash, expiresOn, ipAddress ?? null);

  return {
    accessToken,
    refreshToken,
    expiresInSeconds: config.accessTokenTtlSeconds,
    user,
  };
}

router.get('/bootstrap-status', (_req, res) => {
  const settings = getSystemSettings();

  res.json({
    success: true,
    data: {
      superAdminClaimed: isSuperAdminClaimed(),
      requiresPasscode: Boolean(config.superAdminPasscode),
      allowPublicRegistration: settings.allowPublicRegistration,
      maintenanceMode: settings.maintenanceMode,
      supportContactEmail: settings.supportContactEmail,
      defaultTrialDays: settings.defaultTrialDays,
    },
  });
});

router.post('/claim-super-admin', authLimiter, (req, res) => {
  if (isSuperAdminClaimed()) {
    res.status(409).json({
      success: false,
      message: 'Super Admin account has already been initialized.',
    });
    return;
  }

  const fullName = typeof req.body?.fullName === 'string' ? req.body.fullName.trim() : '';
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const passcode = typeof req.body?.passcode === 'string' ? req.body.passcode : '';

  if (config.superAdminPasscode) {
    const expected = Buffer.from(config.superAdminPasscode);
    const actual = Buffer.from(passcode);
    if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
      res.status(403).json({ success: false, message: 'Invalid setup passcode.' });
      return;
    }
  }

  if (fullName.length < 2 || fullName.length > 150) {
    res.status(400).json({ success: false, message: 'Full name must be between 2 and 150 characters.' });
    return;
  }
  if (!EMAIL_RE.test(email) || email.length > 256) {
    res.status(400).json({ success: false, message: 'Please enter a valid email address.' });
    return;
  }
  if (password.length < 8 || password.length > 128) {
    res.status(400).json({ success: false, message: 'Password must be between 8 and 128 characters.' });
    return;
  }

  const existingEmail = db.prepare(`SELECT UserId FROM Users WHERE LOWER(Email) = ?`).get(email);
  if (existingEmail) {
    res.status(409).json({ success: false, message: 'That email address is already registered.' });
    return;
  }

  const roleRow = db.prepare(`SELECT RoleId FROM Roles WHERE Name = 'SuperAdmin'`).get() as
    | { RoleId: number }
    | undefined;
  if (!roleRow) {
    res.status(500).json({ success: false, message: 'SuperAdmin role is missing from database.' });
    return;
  }

  const passwordHash = hashPassword(password);
  let createdUserId = 0;

  db.exec('BEGIN');
  try {
    if (isSuperAdminClaimed()) {
      db.exec('ROLLBACK');
      res.status(409).json({ success: false, message: 'Super Admin account has already been initialized.' });
      return;
    }

    const userRes = db
      .prepare(`INSERT INTO Users (FullName, Email, PasswordHash, IsActive, LastLoginOn) VALUES (?, ?, ?, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now'))`)
      .run(fullName, email, passwordHash);
    createdUserId = Number(userRes.lastInsertRowid);

    db.prepare(`INSERT INTO UserRoles (UserId, RoleId) VALUES (?, ?)`).run(createdUserId, roleRow.RoleId);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  writeAuditLog({
    userId: createdUserId,
    action: 'SuperAdminClaimed',
    entityType: 'User',
    entityId: createdUserId,
    details: `Initial Super Admin ${email} provisioned`,
    ipAddress: req.ip,
  });

  const session = issueSession(createdUserId, req.ip);
  res.status(201).json({
    success: true,
    message: 'Super Admin workspace initialized.',
    data: session,
  });
});

router.post('/register', authLimiter, (req, res) => {
  const regSetting = db
    .prepare(`SELECT SettingValue FROM SystemSettings WHERE SettingKey = 'AllowPublicRegistration'`)
    .get() as { SettingValue: string } | undefined;
  if (regSetting?.SettingValue === 'false') {
    res.status(403).json({
      success: false,
      message: 'Public workspace registration is currently disabled by platform administrators.',
    });
    return;
  }

  const fullName = typeof req.body?.fullName === 'string' ? req.body.fullName.trim() : '';
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const businessName = typeof req.body?.businessName === 'string' ? req.body.businessName.trim() : '';
  const industry = typeof req.body?.industry === 'string' ? req.body.industry.trim().slice(0, 100) : null;
  const websiteUrl = typeof req.body?.websiteUrl === 'string' ? req.body.websiteUrl.trim().slice(0, 500) : null;

  if (fullName.length < 2 || fullName.length > 150) {
    res.status(400).json({ success: false, message: 'Full name must be between 2 and 150 characters.' });
    return;
  }
  if (!EMAIL_RE.test(email) || email.length > 256) {
    res.status(400).json({ success: false, message: 'Please enter a valid email address.' });
    return;
  }
  if (password.length < 8 || password.length > 128) {
    res.status(400).json({ success: false, message: 'Password must be between 8 and 128 characters.' });
    return;
  }
  if (businessName.length < 2 || businessName.length > 200) {
    res.status(400).json({ success: false, message: 'Business name must be between 2 and 200 characters.' });
    return;
  }
  if (websiteUrl && !/^https?:\/\/.+/i.test(websiteUrl)) {
    res.status(400).json({ success: false, message: 'Website URL must start with http:// or https://.' });
    return;
  }

  const existing = db.prepare(`SELECT UserId FROM Users WHERE LOWER(Email) = ?`).get(email);
  if (existing) {
    res.status(409).json({ success: false, message: 'An account with this email already exists.' });
    return;
  }

  const ownerRole = db.prepare(`SELECT RoleId FROM Roles WHERE Name = 'BusinessOwner'`).get() as
    | { RoleId: number }
    | undefined;
  const freePlan = db.prepare(`SELECT PlanId FROM SubscriptionPlans WHERE Code = 'FREE'`).get() as
    | { PlanId: number }
    | undefined;

  if (!ownerRole || !freePlan) {
    res.status(500).json({ success: false, message: 'Core roles or plans are missing.' });
    return;
  }

  const passwordHash = hashPassword(password);
  const slug = slugifyBusinessName(businessName);

  let userId = 0;
  let businessId = 0;

  db.exec('BEGIN');
  try {
    const userRes = db
      .prepare(`INSERT INTO Users (FullName, Email, PasswordHash, IsActive, LastLoginOn) VALUES (?, ?, ?, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now'))`)
      .run(fullName, email, passwordHash);
    userId = Number(userRes.lastInsertRowid);

    const bizRes = db
      .prepare(
        `INSERT INTO Businesses (Name, Slug, Industry, WebsiteUrl, SupportEmail, Status)
         VALUES (?, ?, ?, ?, ?, 'Active')`
      )
      .run(businessName, slug, industry || null, websiteUrl || null, email);
    businessId = Number(bizRes.lastInsertRowid);

    db.prepare(
      `INSERT INTO BusinessUsers (BusinessId, UserId, RoleId, IsPrimaryOwner)
       VALUES (?, ?, ?, 1)`
    ).run(businessId, userId, ownerRole.RoleId);

    db.prepare(
      `INSERT INTO Subscriptions (BusinessId, PlanId, BillingCycle, Status, StartsOn)
       VALUES (?, ?, 'Monthly', 'Active', strftime('%Y-%m-%dT%H:%M:%fZ','now'))`
    ).run(businessId, freePlan.PlanId);

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  writeAuditLog({
    userId,
    businessId,
    action: 'BusinessRegistered',
    entityType: 'Business',
    entityId: businessId,
    details: `Registered workspace "${businessName}" on Free plan`,
    ipAddress: req.ip,
  });

  const session = issueSession(userId, req.ip);
  res.status(201).json({
    success: true,
    message: 'Business account created successfully.',
    data: session,
  });
});

router.post('/login', authLimiter, (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';

  if (!EMAIL_RE.test(email) || !password) {
    res.status(400).json({ success: false, message: 'Email and password are required.' });
    return;
  }

  const userRow = db
    .prepare(`SELECT UserId, PasswordHash, IsActive FROM Users WHERE LOWER(Email) = ?`)
    .get(email) as { UserId: number; PasswordHash: string; IsActive: number } | undefined;

  if (!userRow || !verifyPassword(password, userRow.PasswordHash)) {
    res.status(401).json({ success: false, message: 'Invalid email or password.' });
    return;
  }

  if (userRow.IsActive !== 1) {
    res.status(403).json({ success: false, message: 'This user account has been deactivated.' });
    return;
  }

  const context = getUserAuthContextById(userRow.UserId);
  if (!context) {
    res.status(403).json({ success: false, message: 'No active role is assigned to this user.' });
    return;
  }

  if (context.role !== 'SuperAdmin' && context.businessId !== null && context.businessStatus !== 'Active') {
    res.status(403).json({
      success: false,
      message: `Your business account is currently ${context.businessStatus}. Contact platform support.`,
    });
    return;
  }

  db.prepare(`UPDATE Users SET LastLoginOn = strftime('%Y-%m-%dT%H:%M:%fZ','now'), UpdatedOn = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE UserId = ?`)
    .run(userRow.UserId);

  writeAuditLog({
    userId: context.userId,
    businessId: context.businessId,
    action: 'UserLogin',
    entityType: 'User',
    entityId: context.userId,
    details: `${context.role} signed in`,
    ipAddress: req.ip,
  });

  const session = issueSession(context.userId, req.ip);
  res.json({ success: true, data: session });
});

router.post('/refresh', authLimiter, (req, res) => {
  const rawToken = typeof req.body?.refreshToken === 'string' ? req.body.refreshToken.trim() : '';
  if (!rawToken) {
    res.status(400).json({ success: false, message: 'Refresh token is required.' });
    return;
  }

  const tokenHash = hashToken(rawToken);
  const tokenRow = db
    .prepare(
      `SELECT RefreshTokenId, UserId, ExpiresOn, RevokedOn
       FROM RefreshTokens
       WHERE TokenHash = ?`
    )
    .get(tokenHash) as
    | { RefreshTokenId: number; UserId: number; ExpiresOn: string; RevokedOn: string | null }
    | undefined;

  if (!tokenRow) {
    res.status(401).json({ success: false, message: 'Invalid refresh token.' });
    return;
  }

  if (tokenRow.RevokedOn) {
    // Reuse detection: revoke all active tokens for this user
    db.prepare(
      `UPDATE RefreshTokens
       SET RevokedOn = strftime('%Y-%m-%dT%H:%M:%fZ','now'), UpdatedOn = strftime('%Y-%m-%dT%H:%M:%fZ','now')
       WHERE UserId = ? AND RevokedOn IS NULL`
    ).run(tokenRow.UserId);

    writeAuditLog({
      userId: tokenRow.UserId,
      action: 'RefreshTokenReuseDetected',
      entityType: 'RefreshToken',
      entityId: tokenRow.RefreshTokenId,
      details: 'Revoked all sessions due to token replay',
      ipAddress: req.ip,
    });

    res.status(401).json({ success: false, message: 'Session revoked for security. Please sign in again.' });
    return;
  }

  if (new Date(tokenRow.ExpiresOn).getTime() <= Date.now()) {
    res.status(401).json({ success: false, message: 'Refresh token expired. Please sign in again.' });
    return;
  }

  const context = getUserAuthContextById(tokenRow.UserId);
  if (!context || (context.role !== 'SuperAdmin' && context.businessId !== null && context.businessStatus !== 'Active')) {
    res.status(403).json({ success: false, message: 'Account or business workspace is not active.' });
    return;
  }

  const { rawToken: nextRefresh, tokenHash: nextHash } = generateRefreshToken();
  const nextExpires = new Date(Date.now() + config.refreshTokenTtlDays * 86400 * 1000).toISOString();

  db.exec('BEGIN');
  try {
    db.prepare(
      `UPDATE RefreshTokens
       SET RevokedOn = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
           ReplacedByTokenHash = ?,
           UpdatedOn = strftime('%Y-%m-%dT%H:%M:%fZ','now')
       WHERE RefreshTokenId = ?`
    ).run(nextHash, tokenRow.RefreshTokenId);

    db.prepare(
      `INSERT INTO RefreshTokens (UserId, TokenHash, ExpiresOn, CreatedByIp)
       VALUES (?, ?, ?, ?)`
    ).run(context.userId, nextHash, nextExpires, req.ip ?? null);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  const accessToken = signJwt({
    sub: context.userId,
    email: context.email,
    role: context.role,
    businessId: context.businessId,
  });

  res.json({
    success: true,
    data: {
      accessToken,
      refreshToken: nextRefresh,
      expiresInSeconds: config.accessTokenTtlSeconds,
      user: context,
    },
  });
});

router.post('/logout', (req, res) => {
  const rawToken = typeof req.body?.refreshToken === 'string' ? req.body.refreshToken.trim() : '';
  if (rawToken) {
    const tokenHash = hashToken(rawToken);
    db.prepare(
      `UPDATE RefreshTokens
       SET RevokedOn = strftime('%Y-%m-%dT%H:%M:%fZ','now'), UpdatedOn = strftime('%Y-%m-%dT%H:%M:%fZ','now')
       WHERE TokenHash = ? AND RevokedOn IS NULL`
    ).run(tokenHash);
  }
  res.json({ success: true, message: 'Signed out cleanly.' });
});

router.get('/me', authenticate, (req: AuthenticatedRequest, res) => {
  res.json({ success: true, data: req.user });
});

export default router;
