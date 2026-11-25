import { Router } from 'express';
import { db, writeAuditLog } from '../db.ts';
import { authenticate, requireRoles, type AuthenticatedRequest } from '../middleware/auth.ts';
import {
  executeSubscriptionCheckout,
  isSandboxBillingEnabled,
  isStripeConfigured,
  type PaymentProviderName,
} from '../services/paymentGatewayService.ts';

const router = Router();

const VALID_PLAN_CODE_RE = /^[A-Z0-9_]{2,40}$/;
const VALID_SUB_STATUSES = new Set(['Active', 'Expired', 'Cancelled', 'PastDue']);
const VALID_PAYMENT_STATUSES = new Set(['Succeeded', 'Pending', 'Failed', 'Refunded']);

function normalizePlanRow(row: Record<string, unknown>) {
  return {
    ...row,
    allowWebsiteIngestion: Boolean(row.allowWebsiteIngestion),
    isActive: Boolean(row.isActive),
  };
}

// List Subscription Plans (Active plans for any signed-in user; SuperAdmin can pass ?includeInactive=true)
router.get('/plans', authenticate, (req: AuthenticatedRequest, res) => {
  const includeInactive = req.query.includeInactive === 'true' && req.user?.role === 'SuperAdmin';
  const rows = db
    .prepare(
      `SELECT
        PlanId AS planId,
        Code AS code,
        Name AS name,
        Description AS description,
        MonthlyPriceUsd AS monthlyPriceUsd,
        YearlyPriceUsd AS yearlyPriceUsd,
        MaxChatbots AS maxChatbots,
        MaxMonthlyMessages AS maxMonthlyMessages,
        MaxTeamMembers AS maxTeamMembers,
        AllowWebsiteIngestion AS allowWebsiteIngestion,
        IsActive AS isActive,
        CreatedOn AS createdOn,
        UpdatedOn AS updatedOn,
        (SELECT COUNT(*) FROM Subscriptions s
         WHERE s.PlanId = SubscriptionPlans.PlanId
           AND s.Status = 'Active'
           AND (s.ExpiresOn IS NULL OR s.ExpiresOn > strftime('%Y-%m-%dT%H:%M:%fZ','now'))) AS activeTenantsCount
       FROM SubscriptionPlans
       ${includeInactive ? '' : 'WHERE IsActive = 1'}
       ORDER BY MonthlyPriceUsd ASC, PlanId ASC`
    )
    .all() as Array<Record<string, unknown>>;

  res.json({
    success: true,
    data: {
      items: rows.map(normalizePlanRow),
      stripeConfigured: isStripeConfigured(),
      sandboxBillingEnabled: isSandboxBillingEnabled(),
    },
  });
});

// Super Admin: Create Subscription Plan
router.post('/plans', authenticate, requireRoles('SuperAdmin'), (req: AuthenticatedRequest, res) => {
  const code = typeof req.body?.code === 'string' ? req.body.code.trim().toUpperCase() : '';
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  const description = typeof req.body?.description === 'string' ? req.body.description.trim().slice(0, 500) : null;
  const monthlyPriceUsd = Number(req.body?.monthlyPriceUsd);
  const yearlyPriceUsd = Number(req.body?.yearlyPriceUsd);
  const maxChatbots = Number(req.body?.maxChatbots);
  const maxMonthlyMessages = Number(req.body?.maxMonthlyMessages);
  const maxTeamMembers = Number(req.body?.maxTeamMembers);
  const allowWebsiteIngestion = Boolean(req.body?.allowWebsiteIngestion);

  if (!VALID_PLAN_CODE_RE.test(code)) {
    res.status(400).json({ success: false, message: 'Plan code must be 2–40 uppercase letters, digits, or underscores.' });
    return;
  }
  if (name.length < 2 || name.length > 100) {
    res.status(400).json({ success: false, message: 'Plan name must be between 2 and 100 characters.' });
    return;
  }
  if (!Number.isFinite(monthlyPriceUsd) || monthlyPriceUsd < 0 || !Number.isFinite(yearlyPriceUsd) || yearlyPriceUsd < 0) {
    res.status(400).json({ success: false, message: 'Monthly and yearly prices must be non-negative numbers.' });
    return;
  }
  if (
    !Number.isInteger(maxChatbots) || maxChatbots < 1 ||
    !Number.isInteger(maxMonthlyMessages) || maxMonthlyMessages < 1 ||
    !Number.isInteger(maxTeamMembers) || maxTeamMembers < 1
  ) {
    res.status(400).json({ success: false, message: 'Chatbot, message, and team limits must be positive integers.' });
    return;
  }

  const existing = db.prepare(`SELECT PlanId FROM SubscriptionPlans WHERE UPPER(Code) = ?`).get(code);
  if (existing) {
    res.status(409).json({ success: false, message: `Plan code "${code}" already exists.` });
    return;
  }

  const result = db
    .prepare(
      `INSERT INTO SubscriptionPlans
        (Code, Name, Description, MonthlyPriceUsd, YearlyPriceUsd, MaxChatbots, MaxMonthlyMessages, MaxTeamMembers, AllowWebsiteIngestion, IsActive)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`
    )
    .run(
      code,
      name,
      description || null,
      Math.round(monthlyPriceUsd * 100) / 100,
      Math.round(yearlyPriceUsd * 100) / 100,
      maxChatbots,
      maxMonthlyMessages,
      maxTeamMembers,
      allowWebsiteIngestion ? 1 : 0
    );

  const planId = Number(result.lastInsertRowid);
  writeAuditLog({
    userId: req.user?.userId,
    action: 'PlanCreated',
    entityType: 'SubscriptionPlan',
    entityId: planId,
    details: `Created plan ${name} (${code})`,
    ipAddress: req.ip,
  });

  const created = db
    .prepare(
      `SELECT PlanId AS planId, Code AS code, Name AS name, Description AS description,
              MonthlyPriceUsd AS monthlyPriceUsd, YearlyPriceUsd AS yearlyPriceUsd,
              MaxChatbots AS maxChatbots, MaxMonthlyMessages AS maxMonthlyMessages,
              MaxTeamMembers AS maxTeamMembers, AllowWebsiteIngestion AS allowWebsiteIngestion,
              IsActive AS isActive, CreatedOn AS createdOn, UpdatedOn AS updatedOn
       FROM SubscriptionPlans WHERE PlanId = ?`
    )
    .get(planId) as Record<string, unknown>;

  res.status(201).json({
    success: true,
    message: `Plan "${name}" created.`,
    data: normalizePlanRow(created),
  });
});

// Super Admin: Update Subscription Plan
router.put('/plans/:id', authenticate, requireRoles('SuperAdmin'), (req: AuthenticatedRequest, res) => {
  const planId = Number(req.params.id);
  if (!Number.isInteger(planId) || planId <= 0) {
    res.status(400).json({ success: false, message: 'Invalid plan ID.' });
    return;
  }

  const existing = db.prepare(`SELECT PlanId, Code FROM SubscriptionPlans WHERE PlanId = ?`).get(planId) as
    | { PlanId: number; Code: string }
    | undefined;
  if (!existing) {
    res.status(404).json({ success: false, message: 'Subscription plan not found.' });
    return;
  }

  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  const description = typeof req.body?.description === 'string' ? req.body.description.trim().slice(0, 500) : null;
  const monthlyPriceUsd = Number(req.body?.monthlyPriceUsd);
  const yearlyPriceUsd = Number(req.body?.yearlyPriceUsd);
  const maxChatbots = Number(req.body?.maxChatbots);
  const maxMonthlyMessages = Number(req.body?.maxMonthlyMessages);
  const maxTeamMembers = Number(req.body?.maxTeamMembers);
  const allowWebsiteIngestion = Boolean(req.body?.allowWebsiteIngestion);
  const isActive = req.body?.isActive !== undefined ? Boolean(req.body.isActive) : true;

  if (name.length < 2 || name.length > 100) {
    res.status(400).json({ success: false, message: 'Plan name must be between 2 and 100 characters.' });
    return;
  }
  if (!Number.isFinite(monthlyPriceUsd) || monthlyPriceUsd < 0 || !Number.isFinite(yearlyPriceUsd) || yearlyPriceUsd < 0) {
    res.status(400).json({ success: false, message: 'Prices must be non-negative numbers.' });
    return;
  }
  if (
    !Number.isInteger(maxChatbots) || maxChatbots < 1 ||
    !Number.isInteger(maxMonthlyMessages) || maxMonthlyMessages < 1 ||
    !Number.isInteger(maxTeamMembers) || maxTeamMembers < 1
  ) {
    res.status(400).json({ success: false, message: 'Plan limits must be positive integers.' });
    return;
  }

  db.prepare(
    `UPDATE SubscriptionPlans
     SET Name = ?,
         Description = ?,
         MonthlyPriceUsd = ?,
         YearlyPriceUsd = ?,
         MaxChatbots = ?,
         MaxMonthlyMessages = ?,
         MaxTeamMembers = ?,
         AllowWebsiteIngestion = ?,
         IsActive = ?,
         UpdatedOn = strftime('%Y-%m-%dT%H:%M:%fZ','now')
     WHERE PlanId = ?`
  ).run(
    name,
    description || null,
    Math.round(monthlyPriceUsd * 100) / 100,
    Math.round(yearlyPriceUsd * 100) / 100,
    maxChatbots,
    maxMonthlyMessages,
    maxTeamMembers,
    allowWebsiteIngestion ? 1 : 0,
    isActive ? 1 : 0,
    planId
  );

  writeAuditLog({
    userId: req.user?.userId,
    action: 'PlanUpdated',
    entityType: 'SubscriptionPlan',
    entityId: planId,
    details: `Updated plan ${name} (${existing.Code})`,
    ipAddress: req.ip,
  });

  const updated = db
    .prepare(
      `SELECT PlanId AS planId, Code AS code, Name AS name, Description AS description,
              MonthlyPriceUsd AS monthlyPriceUsd, YearlyPriceUsd AS yearlyPriceUsd,
              MaxChatbots AS maxChatbots, MaxMonthlyMessages AS maxMonthlyMessages,
              MaxTeamMembers AS maxTeamMembers, AllowWebsiteIngestion AS allowWebsiteIngestion,
              IsActive AS isActive, CreatedOn AS createdOn, UpdatedOn AS updatedOn
       FROM SubscriptionPlans WHERE PlanId = ?`
    )
    .get(planId) as Record<string, unknown>;

  res.json({
    success: true,
    message: `Plan "${name}" updated.`,
    data: normalizePlanRow(updated),
  });
});

// Super Admin: Toggle Plan Active/Archived Status
router.patch('/plans/:id/status', authenticate, requireRoles('SuperAdmin'), (req: AuthenticatedRequest, res) => {
  const planId = Number(req.params.id);
  if (!Number.isInteger(planId) || planId <= 0 || typeof req.body?.isActive !== 'boolean') {
    res.status(400).json({ success: false, message: 'Valid plan ID and isActive boolean are required.' });
    return;
  }

  const plan = db.prepare(`SELECT PlanId, Code, Name FROM SubscriptionPlans WHERE PlanId = ?`).get(planId) as
    | { PlanId: number; Code: string; Name: string }
    | undefined;
  if (!plan) {
    res.status(404).json({ success: false, message: 'Subscription plan not found.' });
    return;
  }

  if (plan.Code === 'FREE' && !req.body.isActive) {
    res.status(400).json({ success: false, message: 'The default Free plan cannot be archived.' });
    return;
  }

  const isActive = req.body.isActive;
  db.prepare(`UPDATE SubscriptionPlans SET IsActive = ?, UpdatedOn = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE PlanId = ?`)
    .run(isActive ? 1 : 0, planId);

  writeAuditLog({
    userId: req.user?.userId,
    action: isActive ? 'PlanActivated' : 'PlanArchived',
    entityType: 'SubscriptionPlan',
    entityId: planId,
    details: `${isActive ? 'Activated' : 'Archived'} plan ${plan.Name}`,
    ipAddress: req.ip,
  });

  res.json({
    success: true,
    message: `Plan "${plan.Name}" ${isActive ? 'activated' : 'archived'}.`,
    data: { planId, isActive },
  });
});

// Business Owner: Get Current Subscription, Available Plans & Workspace Payment History
router.get('/subscription', authenticate, requireRoles('BusinessOwner'), (req: AuthenticatedRequest, res) => {
  const businessId = req.user?.businessId;
  if (!businessId) {
    res.status(403).json({ success: false, message: 'No business workspace assigned.' });
    return;
  }

  const currentSubscription = db
    .prepare(
      `SELECT
        s.SubscriptionId AS subscriptionId,
        s.BusinessId AS businessId,
        s.PlanId AS planId,
        s.BillingCycle AS billingCycle,
        CASE
          WHEN s.Status = 'Active' AND s.ExpiresOn IS NOT NULL AND s.ExpiresOn <= strftime('%Y-%m-%dT%H:%M:%fZ','now')
            THEN 'Expired'
          ELSE s.Status
        END AS status,
        s.StartsOn AS startsOn,
        s.ExpiresOn AS expiresOn,
        CASE
          WHEN s.Status = 'Active' AND (s.ExpiresOn IS NULL OR s.ExpiresOn > strftime('%Y-%m-%dT%H:%M:%fZ','now'))
            THEN sp.Code
          ELSE 'FREE'
        END AS planCode,
        CASE
          WHEN s.Status = 'Active' AND (s.ExpiresOn IS NULL OR s.ExpiresOn > strftime('%Y-%m-%dT%H:%M:%fZ','now'))
            THEN sp.Name
          ELSE 'Free'
        END AS planName,
        sp.Description AS planDescription,
        sp.MonthlyPriceUsd AS monthlyPriceUsd,
        sp.YearlyPriceUsd AS yearlyPriceUsd,
        CASE
          WHEN s.Status = 'Active' AND (s.ExpiresOn IS NULL OR s.ExpiresOn > strftime('%Y-%m-%dT%H:%M:%fZ','now'))
            THEN sp.MaxChatbots
          ELSE 1
        END AS maxChatbots,
        CASE
          WHEN s.Status = 'Active' AND (s.ExpiresOn IS NULL OR s.ExpiresOn > strftime('%Y-%m-%dT%H:%M:%fZ','now'))
            THEN sp.MaxMonthlyMessages
          ELSE 250
        END AS maxMonthlyMessages,
        CASE
          WHEN s.Status = 'Active' AND (s.ExpiresOn IS NULL OR s.ExpiresOn > strftime('%Y-%m-%dT%H:%M:%fZ','now'))
            THEN sp.MaxTeamMembers
          ELSE 1
        END AS maxTeamMembers,
        CASE
          WHEN s.Status = 'Active' AND (s.ExpiresOn IS NULL OR s.ExpiresOn > strftime('%Y-%m-%dT%H:%M:%fZ','now'))
            THEN sp.AllowWebsiteIngestion
          ELSE 0
        END AS allowWebsiteIngestion
       FROM Subscriptions s
       JOIN SubscriptionPlans sp ON sp.PlanId = s.PlanId
       WHERE s.BusinessId = ?
       ORDER BY CASE
         WHEN s.Status = 'Active' AND (s.ExpiresOn IS NULL OR s.ExpiresOn > strftime('%Y-%m-%dT%H:%M:%fZ','now')) THEN 0
         ELSE 1
       END, s.SubscriptionId DESC
       LIMIT 1`
    )
    .get(businessId) as Record<string, unknown> | undefined;

  const plans = db
    .prepare(
      `SELECT PlanId AS planId, Code AS code, Name AS name, Description AS description,
              MonthlyPriceUsd AS monthlyPriceUsd, YearlyPriceUsd AS yearlyPriceUsd,
              MaxChatbots AS maxChatbots, MaxMonthlyMessages AS maxMonthlyMessages,
              MaxTeamMembers AS maxTeamMembers, AllowWebsiteIngestion AS allowWebsiteIngestion,
              IsActive AS isActive
       FROM SubscriptionPlans
       WHERE IsActive = 1
       ORDER BY MonthlyPriceUsd ASC, PlanId ASC`
    )
    .all() as Array<Record<string, unknown>>;

  const payments = db
    .prepare(
      `SELECT
        p.PaymentId AS paymentId,
        p.SubscriptionId AS subscriptionId,
        sp.Name AS planName,
        s.BillingCycle AS billingCycle,
        p.AmountUsd AS amountUsd,
        p.Currency AS currency,
        p.Provider AS provider,
        p.ExternalTxnId AS externalTxnId,
        p.Status AS status,
        p.PaidOn AS paidOn,
        p.CreatedOn AS createdOn
       FROM Payments p
       JOIN Subscriptions s ON s.SubscriptionId = p.SubscriptionId
       JOIN SubscriptionPlans sp ON sp.PlanId = s.PlanId
       WHERE p.BusinessId = ?
       ORDER BY p.CreatedOn DESC, p.PaymentId DESC
       LIMIT 30`
    )
    .all(businessId);

  res.json({
    success: true,
    data: {
      currentSubscription: currentSubscription
        ? {
            ...currentSubscription,
            allowWebsiteIngestion: Boolean(currentSubscription.allowWebsiteIngestion),
          }
        : null,
      plans: plans.map(normalizePlanRow),
      payments,
      stripeConfigured: isStripeConfigured(),
      sandboxBillingEnabled: isSandboxBillingEnabled(),
    },
  });
});

// Business Owner: Upgrade / Switch Plan Checkout
router.post('/subscription/checkout', authenticate, requireRoles('BusinessOwner'), async (req: AuthenticatedRequest, res) => {
  const businessId = req.user?.businessId;
  if (!businessId) {
    res.status(403).json({ success: false, message: 'No business workspace assigned.' });
    return;
  }

  const planId = Number(req.body?.planId);
  const billingCycle = req.body?.billingCycle === 'Yearly' ? 'Yearly' : 'Monthly';
  const rawProvider = typeof req.body?.provider === 'string' ? req.body.provider.trim() : 'SandboxCard';

  if (rawProvider !== 'Stripe' && rawProvider !== 'ManualInvoice' && rawProvider !== 'SandboxCard') {
    res.status(400).json({ success: false, message: 'Invalid payment provider. Choose Stripe, ManualInvoice, or SandboxCard.' });
    return;
  }
  const provider: PaymentProviderName = rawProvider;

  if (!Number.isInteger(planId) || planId <= 0) {
    res.status(400).json({ success: false, message: 'Please select a valid subscription plan.' });
    return;
  }

  const plan = db
    .prepare(
      `SELECT PlanId, Code, Name, MonthlyPriceUsd, YearlyPriceUsd, IsActive
       FROM SubscriptionPlans WHERE PlanId = ?`
    )
    .get(planId) as
    | {
        PlanId: number;
        Code: string;
        Name: string;
        MonthlyPriceUsd: number;
        YearlyPriceUsd: number;
        IsActive: number;
      }
    | undefined;

  if (!plan || plan.IsActive !== 1) {
    res.status(404).json({ success: false, message: 'Selected subscription plan is not available.' });
    return;
  }

  const amountUsd = billingCycle === 'Yearly' ? plan.YearlyPriceUsd : plan.MonthlyPriceUsd;

  if (provider === 'SandboxCard' && amountUsd > 0 && !isSandboxBillingEnabled()) {
    res.status(400).json({
      success: false,
      message: 'Sandbox card checkout is disabled in production mode. Please use Stripe or Manual Invoice.',
    });
    return;
  }

  try {
    const gatewayResult = await executeSubscriptionCheckout({
      businessId,
      planCode: plan.Code,
      planName: plan.Name,
      billingCycle,
      amountUsd,
      provider,
    });

    const isSettled = gatewayResult.status === 'Succeeded';
    const nextSubscriptionStatus = isSettled ? 'Active' : 'PastDue';
    const daysToAdd = billingCycle === 'Yearly' ? 365 : 30;
    const expiresOn = new Date(Date.now() + daysToAdd * 86400 * 1000).toISOString();

    let newSubscriptionId = 0;
    let newPaymentId = 0;

    db.exec('BEGIN');
    try {
      if (isSettled) {
        db.prepare(
          `UPDATE Subscriptions
           SET Status = 'Cancelled', UpdatedOn = strftime('%Y-%m-%dT%H:%M:%fZ','now')
           WHERE BusinessId = ? AND Status IN ('Active', 'PastDue')`
        ).run(businessId);
      } else {
        // Keep existing Active plan untouched until invoice/payment settles; replace only stale PastDue attempts
        db.prepare(
          `UPDATE Subscriptions
           SET Status = 'Cancelled', UpdatedOn = strftime('%Y-%m-%dT%H:%M:%fZ','now')
           WHERE BusinessId = ? AND Status = 'PastDue'`
        ).run(businessId);
      }

      const subRes = db
        .prepare(
          `INSERT INTO Subscriptions (BusinessId, PlanId, BillingCycle, Status, StartsOn, ExpiresOn)
           VALUES (?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'), ?)`
        )
        .run(businessId, plan.PlanId, billingCycle, nextSubscriptionStatus, expiresOn);
      newSubscriptionId = Number(subRes.lastInsertRowid);

      const payRes = db
        .prepare(
          `INSERT INTO Payments (BusinessId, SubscriptionId, AmountUsd, Currency, Provider, ExternalTxnId, Status, PaidOn)
           VALUES (?, ?, ?, 'USD', ?, ?, ?, ?)`
        )
        .run(
          businessId,
          newSubscriptionId,
          amountUsd,
          gatewayResult.provider,
          gatewayResult.externalTxnId,
          gatewayResult.status,
          gatewayResult.paidOn
        );
      newPaymentId = Number(payRes.lastInsertRowid);

      db.exec('COMMIT');
    } catch (dbErr) {
      db.exec('ROLLBACK');
      throw dbErr;
    }

    writeAuditLog({
      userId: req.user?.userId,
      businessId,
      action: isSettled ? 'SubscriptionChanged' : 'SubscriptionInvoiceIssued',
      entityType: 'Subscription',
      entityId: newSubscriptionId,
      details: `${isSettled ? 'Activated' : 'Requested'} ${plan.Name} (${billingCycle}) via ${gatewayResult.provider} [${gatewayResult.status}]`,
      ipAddress: req.ip,
    });

    res.status(201).json({
      success: true,
      message: gatewayResult.gatewayMessage,
      data: {
        subscriptionId: newSubscriptionId,
        subscriptionStatus: nextSubscriptionStatus,
        paymentId: newPaymentId,
        planId: plan.PlanId,
        planName: plan.Name,
        billingCycle,
        amountUsd,
        paymentStatus: gatewayResult.status,
        externalTxnId: gatewayResult.externalTxnId,
        expiresOn,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unable to process subscription checkout.';
    res.status(400).json({ success: false, message });
  }
});

// Business Owner: Cancel Current Paid Subscription (reverts to Free or marks Cancelled)
router.post('/subscription/cancel', authenticate, requireRoles('BusinessOwner'), (req: AuthenticatedRequest, res) => {
  const businessId = req.user?.businessId;
  if (!businessId) {
    res.status(403).json({ success: false, message: 'No business workspace assigned.' });
    return;
  }

  const activeSub = db
    .prepare(
      `SELECT s.SubscriptionId, sp.Code AS planCode, sp.Name AS planName
       FROM Subscriptions s
       JOIN SubscriptionPlans sp ON sp.PlanId = s.PlanId
       WHERE s.BusinessId = ?
         AND s.Status = 'Active'
         AND (s.ExpiresOn IS NULL OR s.ExpiresOn > strftime('%Y-%m-%dT%H:%M:%fZ','now'))
       ORDER BY s.SubscriptionId DESC
       LIMIT 1`
    )
    .get(businessId) as { SubscriptionId: number; planCode: string; planName: string } | undefined;

  if (!activeSub) {
    res.status(404).json({ success: false, message: 'No active subscription found.' });
    return;
  }

  if (activeSub.planCode === 'FREE') {
    res.status(400).json({ success: false, message: 'You are already on the Free plan.' });
    return;
  }

  const freePlan = db.prepare(`SELECT PlanId FROM SubscriptionPlans WHERE Code = 'FREE'`).get() as
    | { PlanId: number }
    | undefined;

  db.exec('BEGIN');
  try {
    db.prepare(
      `UPDATE Subscriptions SET Status = 'Cancelled', UpdatedOn = strftime('%Y-%m-%dT%H:%M:%fZ','now')
       WHERE SubscriptionId = ? AND BusinessId = ?`
    ).run(activeSub.SubscriptionId, businessId);

    if (freePlan) {
      db.prepare(
        `INSERT INTO Subscriptions (BusinessId, PlanId, BillingCycle, Status, StartsOn)
         VALUES (?, ?, 'Monthly', 'Active', strftime('%Y-%m-%dT%H:%M:%fZ','now'))`
      ).run(businessId, freePlan.PlanId);
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  writeAuditLog({
    userId: req.user?.userId,
    businessId,
    action: 'SubscriptionCancelled',
    entityType: 'Subscription',
    entityId: activeSub.SubscriptionId,
    details: `Cancelled ${activeSub.planName} and reverted to Free tier`,
    ipAddress: req.ip,
  });

  res.json({
    success: true,
    message: `Cancelled ${activeSub.planName} and switched workspace back to the Free plan.`,
  });
});

// Super Admin: List All Tenant Subscriptions
router.get('/admin/subscriptions', authenticate, requireRoles('SuperAdmin'), (req, res) => {
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  const status = typeof req.query.status === 'string' ? req.query.status.trim() : 'all';
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize) || 15));
  const offset = (page - 1) * pageSize;

  const where: string[] = [];
  const params: Array<string | number> = [];

  if (status !== 'all' && VALID_SUB_STATUSES.has(status)) {
    where.push('s.Status = ?');
    params.push(status);
  }
  if (search) {
    where.push('(b.Name LIKE ? OR sp.Name LIKE ? OR sp.Code LIKE ?)');
    const like = `%${search}%`;
    params.push(like, like, like);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const totalRow = db
    .prepare(
      `SELECT COUNT(*) AS total
       FROM Subscriptions s
       JOIN Businesses b ON b.BusinessId = s.BusinessId
       JOIN SubscriptionPlans sp ON sp.PlanId = s.PlanId
       ${whereSql}`
    )
    .get(...params) as { total: number };

  const items = db
    .prepare(
      `SELECT
        s.SubscriptionId AS subscriptionId,
        s.BusinessId AS businessId,
        b.Name AS businessName,
        b.Status AS businessStatus,
        s.PlanId AS planId,
        sp.Code AS planCode,
        sp.Name AS planName,
        s.BillingCycle AS billingCycle,
        s.Status AS status,
        s.StartsOn AS startsOn,
        s.ExpiresOn AS expiresOn,
        s.CreatedOn AS createdOn,
        sp.MonthlyPriceUsd AS monthlyPriceUsd,
        sp.YearlyPriceUsd AS yearlyPriceUsd
       FROM Subscriptions s
       JOIN Businesses b ON b.BusinessId = s.BusinessId
       JOIN SubscriptionPlans sp ON sp.PlanId = s.PlanId
       ${whereSql}
       ORDER BY s.UpdatedOn DESC, s.SubscriptionId DESC
       LIMIT ? OFFSET ?`
    )
    .all(...params, pageSize, offset);

  const summary = db
    .prepare(
      `SELECT
        (SELECT COUNT(*) FROM Subscriptions WHERE Status = 'Active') AS activeCount,
        (SELECT COUNT(*) FROM Subscriptions WHERE Status = 'PastDue') AS pastDueCount,
        (SELECT COUNT(*) FROM Subscriptions WHERE Status = 'Expired') AS expiredCount,
        (SELECT COUNT(*) FROM Subscriptions WHERE Status = 'Cancelled') AS cancelledCount`
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

// Super Admin: Update a Subscription (Status / Plan / Cycle)
router.patch('/admin/subscriptions/:id', authenticate, requireRoles('SuperAdmin'), (req: AuthenticatedRequest, res) => {
  const subscriptionId = Number(req.params.id);
  if (!Number.isInteger(subscriptionId) || subscriptionId <= 0) {
    res.status(400).json({ success: false, message: 'Invalid subscription ID.' });
    return;
  }

  const existing = db
    .prepare(`SELECT SubscriptionId, BusinessId, PlanId, BillingCycle, Status FROM Subscriptions WHERE SubscriptionId = ?`)
    .get(subscriptionId) as
    | { SubscriptionId: number; BusinessId: number; PlanId: number; BillingCycle: string; Status: string }
    | undefined;

  if (!existing) {
    res.status(404).json({ success: false, message: 'Subscription record not found.' });
    return;
  }

  const nextStatus = typeof req.body?.status === 'string' ? req.body.status : existing.Status;
  if (!VALID_SUB_STATUSES.has(nextStatus)) {
    res.status(400).json({ success: false, message: 'Invalid subscription status.' });
    return;
  }

  const nextPlanId = req.body?.planId ? Number(req.body.planId) : existing.PlanId;
  const planExists = db.prepare(`SELECT PlanId, Name FROM SubscriptionPlans WHERE PlanId = ?`).get(nextPlanId) as
    | { PlanId: number; Name: string }
    | undefined;
  if (!planExists) {
    res.status(400).json({ success: false, message: 'Referenced subscription plan not found.' });
    return;
  }

  const nextCycle =
    req.body?.billingCycle === 'Yearly'
      ? 'Yearly'
      : req.body?.billingCycle === 'Monthly'
        ? 'Monthly'
        : existing.BillingCycle;

  db.exec('BEGIN');
  try {
    if (nextStatus === 'Active') {
      db.prepare(
        `UPDATE Subscriptions
         SET Status = 'Cancelled', UpdatedOn = strftime('%Y-%m-%dT%H:%M:%fZ','now')
         WHERE BusinessId = ? AND SubscriptionId != ? AND Status = 'Active'`
      ).run(existing.BusinessId, subscriptionId);
    }

    db.prepare(
      `UPDATE Subscriptions
       SET PlanId = ?, BillingCycle = ?, Status = ?, UpdatedOn = strftime('%Y-%m-%dT%H:%M:%fZ','now')
       WHERE SubscriptionId = ?`
    ).run(nextPlanId, nextCycle, nextStatus, subscriptionId);

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  writeAuditLog({
    userId: req.user?.userId,
    businessId: existing.BusinessId,
    action: 'AdminSubscriptionUpdated',
    entityType: 'Subscription',
    entityId: subscriptionId,
    details: `Updated subscription to ${planExists.Name} (${nextCycle}) [${nextStatus}]`,
    ipAddress: req.ip,
  });

  res.json({
    success: true,
    message: 'Subscription updated.',
    data: { subscriptionId, planId: nextPlanId, billingCycle: nextCycle, status: nextStatus },
  });
});

// Super Admin: List All Platform Payments & Totals
router.get('/admin/payments', authenticate, requireRoles('SuperAdmin'), (req, res) => {
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  const status = typeof req.query.status === 'string' ? req.query.status.trim() : 'all';
  const provider = typeof req.query.provider === 'string' ? req.query.provider.trim() : 'all';
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize) || 15));
  const offset = (page - 1) * pageSize;

  const where: string[] = [];
  const params: Array<string | number> = [];

  if (status !== 'all' && VALID_PAYMENT_STATUSES.has(status)) {
    where.push('p.Status = ?');
    params.push(status);
  }
  if (provider !== 'all') {
    where.push('p.Provider = ?');
    params.push(provider);
  }
  if (search) {
    where.push(`(b.Name LIKE ? OR COALESCE(p.ExternalTxnId, '') LIKE ? OR sp.Name LIKE ?)`);
    const like = `%${search}%`;
    params.push(like, like, like);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const totalRow = db
    .prepare(
      `SELECT COUNT(*) AS total
       FROM Payments p
       JOIN Businesses b ON b.BusinessId = p.BusinessId
       JOIN Subscriptions s ON s.SubscriptionId = p.SubscriptionId
       JOIN SubscriptionPlans sp ON sp.PlanId = s.PlanId
       ${whereSql}`
    )
    .get(...params) as { total: number };

  const items = db
    .prepare(
      `SELECT
        p.PaymentId AS paymentId,
        p.BusinessId AS businessId,
        b.Name AS businessName,
        p.SubscriptionId AS subscriptionId,
        sp.Name AS planName,
        s.BillingCycle AS billingCycle,
        p.AmountUsd AS amountUsd,
        p.Currency AS currency,
        p.Provider AS provider,
        p.ExternalTxnId AS externalTxnId,
        p.Status AS status,
        p.PaidOn AS paidOn,
        p.CreatedOn AS createdOn
       FROM Payments p
       JOIN Businesses b ON b.BusinessId = p.BusinessId
       JOIN Subscriptions s ON s.SubscriptionId = p.SubscriptionId
       JOIN SubscriptionPlans sp ON sp.PlanId = s.PlanId
       ${whereSql}
       ORDER BY p.CreatedOn DESC, p.PaymentId DESC
       LIMIT ? OFFSET ?`
    )
    .all(...params, pageSize, offset);

  const summary = db
    .prepare(
      `SELECT
        COALESCE(SUM(CASE WHEN Status = 'Succeeded' THEN AmountUsd ELSE 0 END), 0) AS totalRevenueUsd,
        COUNT(CASE WHEN Status = 'Succeeded' THEN 1 END) AS succeededCount,
        COUNT(CASE WHEN Status = 'Pending' THEN 1 END) AS pendingCount,
        COUNT(CASE WHEN Status IN ('Failed', 'Refunded') THEN 1 END) AS failedOrRefundedCount
       FROM Payments`
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

// Super Admin: Reconcile Payment Status (Mark Succeeded / Refunded / Failed)
router.patch('/admin/payments/:id/status', authenticate, requireRoles('SuperAdmin'), (req: AuthenticatedRequest, res) => {
  const paymentId = Number(req.params.id);
  const status = typeof req.body?.status === 'string' ? req.body.status : '';
  if (!Number.isInteger(paymentId) || paymentId <= 0 || !VALID_PAYMENT_STATUSES.has(status)) {
    res.status(400).json({ success: false, message: 'Valid payment ID and status are required.' });
    return;
  }

  const payment = db
    .prepare(
      `SELECT p.PaymentId, p.BusinessId, p.SubscriptionId, p.PaidOn, s.BillingCycle, s.Status AS subStatus
       FROM Payments p
       JOIN Subscriptions s ON s.SubscriptionId = p.SubscriptionId
       WHERE p.PaymentId = ?`
    )
    .get(paymentId) as
    | {
        PaymentId: number;
        BusinessId: number;
        SubscriptionId: number;
        PaidOn: string | null;
        BillingCycle: string;
        subStatus: string;
      }
    | undefined;

  if (!payment) {
    res.status(404).json({ success: false, message: 'Payment record not found.' });
    return;
  }

  const paidOn =
    status === 'Succeeded'
      ? payment.PaidOn || new Date().toISOString()
      : payment.PaidOn;

  db.exec('BEGIN');
  try {
    db.prepare(
      `UPDATE Payments
       SET Status = ?, PaidOn = ?, UpdatedOn = strftime('%Y-%m-%dT%H:%M:%fZ','now')
       WHERE PaymentId = ?`
    ).run(status, paidOn, paymentId);

    if (status === 'Succeeded' && payment.subStatus === 'PastDue') {
      const daysToAdd = payment.BillingCycle === 'Yearly' ? 365 : 30;
      const newExpiresOn = new Date(Date.now() + daysToAdd * 86400 * 1000).toISOString();

      db.prepare(
        `UPDATE Subscriptions
         SET Status = 'Cancelled', UpdatedOn = strftime('%Y-%m-%dT%H:%M:%fZ','now')
         WHERE BusinessId = ? AND SubscriptionId != ? AND Status IN ('Active', 'PastDue')`
      ).run(payment.BusinessId, payment.SubscriptionId);

      db.prepare(
        `UPDATE Subscriptions
         SET Status = 'Active',
             StartsOn = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
             ExpiresOn = ?,
             UpdatedOn = strftime('%Y-%m-%dT%H:%M:%fZ','now')
         WHERE SubscriptionId = ? AND BusinessId = ?`
      ).run(newExpiresOn, payment.SubscriptionId, payment.BusinessId);
    } else if ((status === 'Failed' || status === 'Refunded') && payment.subStatus === 'PastDue') {
      db.prepare(
        `UPDATE Subscriptions
         SET Status = 'Cancelled', UpdatedOn = strftime('%Y-%m-%dT%H:%M:%fZ','now')
         WHERE SubscriptionId = ? AND BusinessId = ?`
      ).run(payment.SubscriptionId, payment.BusinessId);
    } else if (status === 'Refunded' && payment.subStatus === 'Active') {
      db.prepare(
        `UPDATE Subscriptions
         SET Status = 'Cancelled', UpdatedOn = strftime('%Y-%m-%dT%H:%M:%fZ','now')
         WHERE SubscriptionId = ? AND BusinessId = ?`
      ).run(payment.SubscriptionId, payment.BusinessId);

      const hasOtherActive = db
        .prepare(
          `SELECT SubscriptionId FROM Subscriptions
           WHERE BusinessId = ? AND Status = 'Active'
             AND (ExpiresOn IS NULL OR ExpiresOn > strftime('%Y-%m-%dT%H:%M:%fZ','now'))
           LIMIT 1`
        )
        .get(payment.BusinessId);

      if (!hasOtherActive) {
        const freePlan = db.prepare(`SELECT PlanId FROM SubscriptionPlans WHERE Code = 'FREE'`).get() as
          | { PlanId: number }
          | undefined;
        if (freePlan) {
          db.prepare(
            `INSERT INTO Subscriptions (BusinessId, PlanId, BillingCycle, Status, StartsOn)
             VALUES (?, ?, 'Monthly', 'Active', strftime('%Y-%m-%dT%H:%M:%fZ','now'))`
          ).run(payment.BusinessId, freePlan.PlanId);
        }
      }
    }

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  writeAuditLog({
    userId: req.user?.userId,
    businessId: payment.BusinessId,
    action: 'PaymentStatusUpdated',
    entityType: 'Payment',
    entityId: paymentId,
    details: `Marked payment #${paymentId} as ${status}`,
    ipAddress: req.ip,
  });

  res.json({
    success: true,
    message: `Payment #${paymentId} updated to ${status}.`,
    data: { paymentId, status, paidOn },
  });
});

export default router;
