import { Router } from 'express';
import { db } from '../db.ts';
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

// Business Analytics Overview (/api/v1/analytics/overview)
router.get(
  '/analytics/overview',
  authenticate,
  requireRoles('BusinessOwner', 'BusinessAdmin'),
  (req: AuthenticatedRequest, res) => {
    const businessId = req.user?.businessId;
    if (!businessId) {
      res.status(403).json({ success: false, message: 'No business workspace assigned.' });
      return;
    }

    const daysParam = Number(req.query.days) || 30;
    const days = [7, 14, 30, 90].includes(daysParam) ? daysParam : 30;
    const chatbotIdRaw = req.query.chatbotId ? Number(req.query.chatbotId) : null;
    const chatbotId = chatbotIdRaw && Number.isInteger(chatbotIdRaw) && chatbotIdRaw > 0 ? chatbotIdRaw : null;

    const { sinceIso, dayKeys } = buildDayWindow(days);

    const kpis = db
      .prepare(
        `SELECT
          (SELECT COUNT(*) FROM Conversations conv WHERE conv.BusinessId = ? AND (? IS NULL OR conv.ChatbotId = ?) AND conv.CreatedOn >= ?) AS totalConversations,
          (SELECT COUNT(*) FROM Conversations conv WHERE conv.BusinessId = ? AND (? IS NULL OR conv.ChatbotId = ?) AND conv.CreatedOn >= ? AND conv.IsResolved = 1) AS resolvedConversations,
          (SELECT COUNT(*) FROM Messages m JOIN Conversations conv ON conv.ConversationId = m.ConversationId WHERE m.BusinessId = ? AND (? IS NULL OR conv.ChatbotId = ?) AND m.CreatedOn >= ?) AS totalMessages,
          (SELECT COUNT(*) FROM Messages m JOIN Conversations conv ON conv.ConversationId = m.ConversationId WHERE m.BusinessId = ? AND (? IS NULL OR conv.ChatbotId = ?) AND m.CreatedOn >= ? AND m.IsUnanswered = 1) AS unansweredMessages,
          (SELECT COALESCE(SUM(u.TokensUsed), 0) FROM UsageLogs u WHERE u.BusinessId = ? AND (? IS NULL OR u.ChatbotId = ?) AND u.CreatedOn >= ?) AS totalTokensUsed`
      )
      .get(
        businessId, chatbotId, chatbotId, sinceIso,
        businessId, chatbotId, chatbotId, sinceIso,
        businessId, chatbotId, chatbotId, sinceIso,
        businessId, chatbotId, chatbotId, sinceIso,
        businessId, chatbotId, chatbotId, sinceIso
      ) as {
        totalConversations: number;
        resolvedConversations: number;
        totalMessages: number;
        unansweredMessages: number;
        totalTokensUsed: number;
      };

    const dailyConvRows = db
      .prepare(
        `SELECT substr(conv.CreatedOn, 1, 10) AS dayKey, COUNT(*) AS count
         FROM Conversations conv
         WHERE conv.BusinessId = ? AND (? IS NULL OR conv.ChatbotId = ?) AND conv.CreatedOn >= ?
         GROUP BY substr(conv.CreatedOn, 1, 10)`
      )
      .all(businessId, chatbotId, chatbotId, sinceIso) as Array<{ dayKey: string; count: number }>;

    const dailyMsgRows = db
      .prepare(
        `SELECT substr(m.CreatedOn, 1, 10) AS dayKey, COUNT(*) AS msgCount,
                SUM(CASE WHEN m.IsUnanswered = 1 THEN 1 ELSE 0 END) AS unansweredCount
         FROM Messages m
         JOIN Conversations conv ON conv.ConversationId = m.ConversationId
         WHERE m.BusinessId = ? AND (? IS NULL OR conv.ChatbotId = ?) AND m.CreatedOn >= ?
         GROUP BY substr(m.CreatedOn, 1, 10)`
      )
      .all(businessId, chatbotId, chatbotId, sinceIso) as Array<{
        dayKey: string;
        msgCount: number;
        unansweredCount: number;
      }>;

    const dailyTokenRows = db
      .prepare(
        `SELECT substr(u.CreatedOn, 1, 10) AS dayKey, COALESCE(SUM(u.TokensUsed), 0) AS tokens
         FROM UsageLogs u
         WHERE u.BusinessId = ? AND (? IS NULL OR u.ChatbotId = ?) AND u.CreatedOn >= ?
         GROUP BY substr(u.CreatedOn, 1, 10)`
      )
      .all(businessId, chatbotId, chatbotId, sinceIso) as Array<{ dayKey: string; tokens: number }>;

    const convMap = new Map(dailyConvRows.map((r) => [r.dayKey, r.count]));
    const msgMap = new Map(dailyMsgRows.map((r) => [r.dayKey, r]));
    const tokenMap = new Map(dailyTokenRows.map((r) => [r.dayKey, r.tokens]));

    const dailySeries = dayKeys.map((day) => ({
      date: day,
      label: day.slice(5),
      conversations: convMap.get(day) ?? 0,
      messages: msgMap.get(day)?.msgCount ?? 0,
      unanswered: msgMap.get(day)?.unansweredCount ?? 0,
      tokensUsed: tokenMap.get(day) ?? 0,
    }));

    const chatbotBreakdown = db
      .prepare(
        `SELECT
          c.ChatbotId AS chatbotId,
          c.Name AS chatbotName,
          c.IsEnabled AS isEnabled,
          (SELECT COUNT(*) FROM Conversations conv WHERE conv.ChatbotId = c.ChatbotId AND conv.CreatedOn >= ?) AS conversationsCount,
          (SELECT COUNT(*) FROM Conversations conv WHERE conv.ChatbotId = c.ChatbotId AND conv.CreatedOn >= ? AND conv.IsResolved = 1) AS resolvedCount,
          (SELECT COUNT(*) FROM Messages m JOIN Conversations conv ON conv.ConversationId = m.ConversationId WHERE conv.ChatbotId = c.ChatbotId AND m.CreatedOn >= ?) AS messagesCount,
          (SELECT COUNT(*) FROM Messages m JOIN Conversations conv ON conv.ConversationId = m.ConversationId WHERE conv.ChatbotId = c.ChatbotId AND m.CreatedOn >= ? AND m.IsUnanswered = 1) AS unansweredCount,
          (SELECT COALESCE(SUM(u.TokensUsed), 0) FROM UsageLogs u WHERE u.ChatbotId = c.ChatbotId AND u.CreatedOn >= ?) AS tokensUsed
         FROM Chatbots c
         WHERE c.BusinessId = ? AND (? IS NULL OR c.ChatbotId = ?)
         ORDER BY conversationsCount DESC, c.ChatbotId ASC`
      )
      .all(sinceIso, sinceIso, sinceIso, sinceIso, sinceIso, businessId, chatbotId, chatbotId) as Array<
        Record<string, unknown>
      >;

    const popularQuestions = db
      .prepare(
        `SELECT
          substr(trim(m.Content), 1, 180) AS questionText,
          COUNT(*) AS askCount,
          MAX(m.CreatedOn) AS lastAskedOn
         FROM Messages m
         JOIN Conversations conv ON conv.ConversationId = m.ConversationId
         WHERE m.BusinessId = ? AND (? IS NULL OR conv.ChatbotId = ?) AND m.SenderType = 'User' AND m.CreatedOn >= ?
         GROUP BY lower(substr(trim(m.Content), 1, 180))
         ORDER BY askCount DESC, lastAskedOn DESC
         LIMIT 8`
      )
      .all(businessId, chatbotId, chatbotId, sinceIso);

    const unansweredPrompts = db
      .prepare(
        `SELECT
          m.ConversationId AS conversationId,
          c.Name AS chatbotName,
          COALESCE(
            (SELECT uq.Content FROM Messages uq
             WHERE uq.ConversationId = m.ConversationId AND uq.SenderType = 'User' AND uq.MessageId < m.MessageId
             ORDER BY uq.MessageId DESC LIMIT 1),
            '(Prompt unavailable)'
          ) AS userQuestion,
          m.Content AS assistantReply,
          m.CreatedOn AS createdOn
         FROM Messages m
         JOIN Conversations conv ON conv.ConversationId = m.ConversationId
         JOIN Chatbots c ON c.ChatbotId = conv.ChatbotId
         WHERE m.BusinessId = ? AND (? IS NULL OR conv.ChatbotId = ?) AND m.IsUnanswered = 1 AND m.CreatedOn >= ?
         ORDER BY m.MessageId DESC
         LIMIT 8`
      )
      .all(businessId, chatbotId, chatbotId, sinceIso);

    const resolutionRate =
      kpis.totalConversations > 0
        ? Math.round((kpis.resolvedConversations / kpis.totalConversations) * 100)
        : 0;

    res.json({
      success: true,
      data: {
        days,
        kpis: {
          ...kpis,
          resolutionRate,
        },
        dailySeries,
        chatbotBreakdown: chatbotBreakdown.map((row) => ({ ...row, isEnabled: Boolean(row.isEnabled) })),
        popularQuestions,
        unansweredPrompts,
      },
    });
  }
);

// Business Usage & Plan Quota Summary (/api/v1/usage/summary)
router.get(
  '/usage/summary',
  authenticate,
  requireRoles('BusinessOwner', 'BusinessAdmin'),
  (req: AuthenticatedRequest, res) => {
    const businessId = req.user?.businessId;
    if (!businessId) {
      res.status(403).json({ success: false, message: 'No business workspace assigned.' });
      return;
    }

    const monthPrefix = new Date().toISOString().slice(0, 7);

    const quotaRow = db
      .prepare(
        `SELECT
          COALESCE(sp.Name, 'Free') AS planName,
          COALESCE(sp.Code, 'FREE') AS planCode,
          COALESCE(sp.MaxChatbots, 1) AS maxChatbots,
          COALESCE(sp.MaxMonthlyMessages, 250) AS maxMonthlyMessages,
          COALESCE(sp.MaxTeamMembers, 1) AS maxTeamMembers,
          COALESCE(sp.AllowWebsiteIngestion, 0) AS allowWebsiteIngestion,
          (SELECT COUNT(*) FROM Chatbots WHERE BusinessId = ?) AS chatbotsUsed,
          (SELECT COUNT(*) FROM BusinessUsers WHERE BusinessId = ?) AS teamMembersUsed,
          (SELECT COUNT(*) FROM Messages WHERE BusinessId = ? AND SenderType = 'User' AND substr(CreatedOn, 1, 7) = ?) AS monthlyUserMessagesUsed,
          (SELECT COALESCE(SUM(TokensUsed), 0) FROM UsageLogs WHERE BusinessId = ? AND substr(CreatedOn, 1, 7) = ?) AS monthlyTokensUsed,
          (SELECT COUNT(*) FROM KnowledgeSources WHERE BusinessId = ?) AS knowledgeSourcesCount,
          (SELECT COUNT(*) FROM KnowledgeChunks WHERE BusinessId = ?) AS knowledgeChunksCount,
          (SELECT COALESCE(SUM(TotalTokens), 0) FROM KnowledgeSources WHERE BusinessId = ?) AS knowledgeTokensIndexed
         FROM Businesses b
         LEFT JOIN Subscriptions s ON s.BusinessId = b.BusinessId AND s.Status = 'Active'
         LEFT JOIN SubscriptionPlans sp ON sp.PlanId = s.PlanId
         WHERE b.BusinessId = ?
         ORDER BY s.SubscriptionId DESC
         LIMIT 1`
      )
      .get(
        businessId,
        businessId,
        businessId,
        monthPrefix,
        businessId,
        monthPrefix,
        businessId,
        businessId,
        businessId,
        businessId
      ) as Record<string, unknown>;

    const modelBreakdown = db
      .prepare(
        `SELECT
          COALESCE(ModelName, 'unknown') AS modelName,
          COUNT(*) AS requestCount,
          COALESCE(SUM(MessageCount), 0) AS widgetMessages,
          COALESCE(SUM(TokensUsed), 0) AS tokensUsed
         FROM UsageLogs
         WHERE BusinessId = ? AND substr(CreatedOn, 1, 7) = ?
         GROUP BY COALESCE(ModelName, 'unknown')
         ORDER BY tokensUsed DESC`
      )
      .all(businessId, monthPrefix);

    const { sinceIso, dayKeys } = buildDayWindow(14);
    const dailyRows = db
      .prepare(
        `SELECT substr(CreatedOn, 1, 10) AS dayKey,
                COALESCE(SUM(TokensUsed), 0) AS tokensUsed,
                COALESCE(SUM(MessageCount), 0) AS messagesCount,
                COUNT(*) AS apiCalls
         FROM UsageLogs
         WHERE BusinessId = ? AND CreatedOn >= ?
         GROUP BY substr(CreatedOn, 1, 10)`
      )
      .all(businessId, sinceIso) as Array<{
        dayKey: string;
        tokensUsed: number;
        messagesCount: number;
        apiCalls: number;
      }>;

    const dailyMap = new Map(dailyRows.map((r) => [r.dayKey, r]));
    const dailyUsage = dayKeys.map((day) => ({
      date: day,
      label: day.slice(5),
      tokensUsed: dailyMap.get(day)?.tokensUsed ?? 0,
      messagesCount: dailyMap.get(day)?.messagesCount ?? 0,
      apiCalls: dailyMap.get(day)?.apiCalls ?? 0,
    }));

    res.json({
      success: true,
      data: {
        billingPeriod: monthPrefix,
        quotas: {
          ...quotaRow,
          allowWebsiteIngestion: Boolean(quotaRow?.allowWebsiteIngestion),
        },
        modelBreakdown,
        dailyUsage,
      },
    });
  }
);

export default router;
