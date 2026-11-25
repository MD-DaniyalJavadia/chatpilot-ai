import { Router } from 'express';
import { db } from '../db.ts';
import { authenticate, requireRoles, type AuthenticatedRequest } from '../middleware/auth.ts';

const router = Router();

router.get('/super-admin', authenticate, requireRoles('SuperAdmin'), (_req, res) => {
  const metrics = db
    .prepare(
      `SELECT
        (SELECT COUNT(*) FROM Users) AS totalUsers,
        (SELECT COUNT(*) FROM Businesses) AS totalBusinesses,
        (SELECT COUNT(*) FROM Chatbots WHERE IsEnabled = 1) AS totalActiveChatbots,
        (SELECT COUNT(*) FROM Conversations) AS totalConversations,
        (SELECT COUNT(*) FROM Messages) AS totalMessages,
        (SELECT COALESCE(SUM(TokensUsed), 0) FROM UsageLogs) AS totalAiTokensUsed,
        (SELECT COALESCE(SUM(AmountUsd), 0) FROM Payments WHERE Status = 'Succeeded') AS monthlyRevenueUsd,
        (SELECT COUNT(*) FROM Subscriptions WHERE Status = 'Active') AS activeSubscriptions,
        (SELECT COUNT(*) FROM Subscriptions WHERE Status = 'Expired') AS expiredSubscriptions`
    )
    .get();

  const recentBusinesses = db
    .prepare(
      `SELECT
        b.BusinessId AS businessId,
        b.Name AS name,
        b.Industry AS industry,
        b.Status AS status,
        b.CreatedOn AS createdOn,
        sp.Name AS planName,
        (SELECT COUNT(*) FROM BusinessUsers bu WHERE bu.BusinessId = b.BusinessId) AS memberCount
      FROM Businesses b
      LEFT JOIN Subscriptions s ON s.BusinessId = b.BusinessId AND s.Status = 'Active'
      LEFT JOIN SubscriptionPlans sp ON sp.PlanId = s.PlanId
      ORDER BY b.CreatedOn DESC
      LIMIT 6`
    )
    .all();

  const planDistribution = db
    .prepare(
      `SELECT
        sp.Name AS planName,
        COUNT(s.SubscriptionId) AS tenantCount
      FROM SubscriptionPlans sp
      LEFT JOIN Subscriptions s ON s.PlanId = sp.PlanId AND s.Status = 'Active'
      GROUP BY sp.PlanId, sp.Name
      ORDER BY sp.MonthlyPriceUsd ASC`
    )
    .all();

  const plans = db
    .prepare(
      `SELECT
        PlanId AS planId,
        Code AS code,
        Name AS name,
        MonthlyPriceUsd AS monthlyPriceUsd,
        YearlyPriceUsd AS yearlyPriceUsd,
        MaxChatbots AS maxChatbots,
        MaxMonthlyMessages AS maxMonthlyMessages,
        MaxTeamMembers AS maxTeamMembers,
        AllowWebsiteIngestion AS allowWebsiteIngestion
      FROM SubscriptionPlans
      WHERE IsActive = 1
      ORDER BY MonthlyPriceUsd ASC`
    )
    .all();

  res.json({
    success: true,
    data: {
      metrics,
      recentBusinesses,
      planDistribution,
      plans,
    },
  });
});

router.get(
  '/business',
  authenticate,
  requireRoles('BusinessOwner', 'BusinessAdmin', 'BusinessStaff'),
  (req: AuthenticatedRequest, res) => {
    const businessId = req.user?.businessId;
    if (!businessId) {
      res.status(403).json({ success: false, message: 'No tenant workspace assigned to this account.' });
      return;
    }

    const summary = db
      .prepare(
        `SELECT
          b.BusinessId AS businessId,
          b.Name AS businessName,
          b.Industry AS industry,
          b.WebsiteUrl AS websiteUrl,
          b.SupportEmail AS supportEmail,
          b.Timezone AS timezone,
          b.Status AS businessStatus,
          b.CreatedOn AS createdOn,
          COALESCE(sp.Name, 'Free') AS planName,
          COALESCE(sp.MaxChatbots, 1) AS maxChatbots,
          COALESCE(sp.MaxMonthlyMessages, 250) AS maxMonthlyMessages,
          COALESCE(sp.MaxTeamMembers, 1) AS maxTeamMembers,
          (SELECT COUNT(*) FROM BusinessUsers WHERE BusinessId = b.BusinessId) AS teamMemberCount,
          (SELECT COUNT(*) FROM Chatbots WHERE BusinessId = b.BusinessId) AS chatbotCount,
          (SELECT COUNT(*) FROM Conversations WHERE BusinessId = b.BusinessId) AS conversationCount,
          (SELECT COUNT(*) FROM Messages WHERE BusinessId = b.BusinessId) AS messageCount,
          (SELECT COALESCE(SUM(TokensUsed), 0) FROM UsageLogs WHERE BusinessId = b.BusinessId) AS tokensUsed
        FROM Businesses b
        LEFT JOIN Subscriptions s ON s.BusinessId = b.BusinessId AND s.Status = 'Active'
        LEFT JOIN SubscriptionPlans sp ON sp.PlanId = s.PlanId
        WHERE b.BusinessId = ?`
      )
      .get(businessId);

    if (!summary) {
      res.status(404).json({ success: false, message: 'Business workspace not found.' });
      return;
    }

    const recentAuditLogs = db
      .prepare(
        `SELECT
          a.AuditLogId AS auditLogId,
          a.Action AS action,
          a.EntityType AS entityType,
          a.Details AS details,
          a.CreatedOn AS createdOn,
          u.FullName AS actorName
        FROM AuditLogs a
        LEFT JOIN Users u ON u.UserId = a.UserId
        WHERE a.BusinessId = ?
        ORDER BY a.CreatedOn DESC
        LIMIT 8`
      )
      .all(businessId);

    res.json({
      success: true,
      data: {
        summary,
        recentAuditLogs,
      },
    });
  }
);

export default router;
