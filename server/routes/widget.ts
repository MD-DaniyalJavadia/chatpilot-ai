import crypto from 'node:crypto';
import { Router, type Request, type Response, type NextFunction } from 'express';
import { db, getSystemSettings } from '../db.ts';
import { createRateLimiter } from '../middleware/rateLimit.ts';
import { evaluateWidgetOrigin } from '../services/domainAllowlistService.ts';
import {
  GeminiServiceError,
  generateGeminiReply,
  generateGeminiReplyStream,
  type PlaygroundTurn,
} from '../services/geminiService.ts';
import { buildComposedInstruction, detectUnansweredReply } from '../services/promptBuilder.ts';
import {
  getIndexedChunkCountForChatbot,
  retrieveRelevantChunks,
  type RetrievedChunk,
} from '../services/ragService.ts';

const router = Router();
const widgetChatLimiter = createRateLimiter(() => getSystemSettings().defaultWidgetRateLimitPerMin, 60 * 1000);
const SESSION_ID_REGEX = /^[a-zA-Z0-9_-]{8,128}$/;

interface PublicWidgetBotRow {
  chatbotId: number;
  businessId: number;
  publicId: string;
  name: string;
  description: string | null;
  businessName: string;
  websiteUrl: string | null;
  isEnabled: number;
  businessStatus: string;
  aiProvider: string;
  aiModel: string;
  systemInstructions: string | null;
  welcomeMessage: string | null;
  fallbackMessage: string | null;
  personality: string | null;
  responseLanguage: string;
  responseTone: string;
  temperature: number;
  maxOutputTokens: number;
  brandColor: string;
  logoUrl: string | null;
  humanHandoverEmail: string | null;
  widgetPosition: string;
  widgetTitle: string | null;
  widgetSubtitle: string | null;
  launcherLabel: string | null;
  showCitations: number;
  enableConversationHistory: number;
  enableHumanHandover: number;
  enableFollowUpQuestions: number;
}

interface WidgetRequest extends Request {
  widgetBot?: PublicWidgetBotRow;
  visitorDomain?: string | null;
}

function getPublicWidgetBot(publicId: string): PublicWidgetBotRow | null {
  const row = db
    .prepare(
      `SELECT
        c.ChatbotId AS chatbotId,
        c.BusinessId AS businessId,
        c.PublicId AS publicId,
        c.Name AS name,
        c.Description AS description,
        c.BusinessName AS businessName,
        c.WebsiteUrl AS websiteUrl,
        c.IsEnabled AS isEnabled,
        b.Status AS businessStatus,
        cs.AiProvider AS aiProvider,
        cs.AiModel AS aiModel,
        cs.SystemInstructions AS systemInstructions,
        cs.WelcomeMessage AS welcomeMessage,
        cs.FallbackMessage AS fallbackMessage,
        cs.Personality AS personality,
        cs.ResponseLanguage AS responseLanguage,
        cs.ResponseTone AS responseTone,
        cs.Temperature AS temperature,
        cs.MaxOutputTokens AS maxOutputTokens,
        cs.BrandColor AS brandColor,
        cs.LogoUrl AS logoUrl,
        cs.HumanHandoverEmail AS humanHandoverEmail,
        cs.WidgetPosition AS widgetPosition,
        cs.WidgetTitle AS widgetTitle,
        cs.WidgetSubtitle AS widgetSubtitle,
        cs.LauncherLabel AS launcherLabel,
        cs.ShowCitations AS showCitations,
        cs.EnableConversationHistory AS enableConversationHistory,
        cs.EnableHumanHandover AS enableHumanHandover,
        cs.EnableFollowUpQuestions AS enableFollowUpQuestions
      FROM Chatbots c
      JOIN Businesses b ON b.BusinessId = c.BusinessId
      JOIN ChatbotSettings cs ON cs.ChatbotId = c.ChatbotId
      WHERE c.PublicId = ?`
    )
    .get(publicId) as PublicWidgetBotRow | undefined;

  return row ?? null;
}

function enforceWidgetCorsAndStatus(req: WidgetRequest, res: Response, next: NextFunction): void {
  const publicId = typeof req.params.publicId === 'string' ? req.params.publicId.trim() : '';
  if (!publicId || publicId.length > 64) {
    res.status(400).json({ success: false, message: 'Invalid chatbot public ID.' });
    return;
  }

  const bot = getPublicWidgetBot(publicId);
  if (!bot) {
    res.status(404).json({ success: false, message: 'Widget chatbot not found.' });
    return;
  }

  const originCheck = evaluateWidgetOrigin({
    chatbotId: bot.chatbotId,
    originHeader: typeof req.headers.origin === 'string' ? req.headers.origin : undefined,
    refererHeader: typeof req.headers.referer === 'string' ? req.headers.referer : undefined,
    requestHostHeader: req.headers['x-forwarded-host'] || req.headers.host,
  });

  if (originCheck.corsOrigin) {
    res.setHeader('Access-Control-Allow-Origin', originCheck.corsOrigin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }

  if (!originCheck.allowed) {
    res.status(403).json({
      success: false,
      message: originCheck.reason || 'Domain is not authorized to load this widget.',
    });
    return;
  }

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (bot.businessStatus !== 'Active') {
    res.status(403).json({
      success: false,
      message: 'This chatbot workspace is currently inactive.',
    });
    return;
  }

  if (!bot.isEnabled) {
    res.status(403).json({
      success: false,
      message: 'This chatbot is currently paused.',
    });
    return;
  }

  req.widgetBot = bot;
  req.visitorDomain = originCheck.visitorDomain;
  next();
}

router.options('/:publicId/config', enforceWidgetCorsAndStatus);
router.options('/:publicId/history', enforceWidgetCorsAndStatus);
router.options('/:publicId/chat', enforceWidgetCorsAndStatus);

// Public Widget Configuration (returns non-sensitive branding & welcome settings only)
router.get('/:publicId/config', enforceWidgetCorsAndStatus, (req: WidgetRequest, res: Response) => {
  const bot = req.widgetBot!;
  res.json({
    success: true,
    data: {
      publicId: bot.publicId,
      name: bot.name,
      businessName: bot.businessName,
      widgetTitle: bot.widgetTitle || bot.name,
      widgetSubtitle: bot.widgetSubtitle || bot.businessName || 'AI Support Assistant',
      launcherLabel: bot.launcherLabel || 'Chat with us',
      welcomeMessage:
        bot.welcomeMessage ||
        `Hello! I am ${bot.name}, the AI assistant for ${bot.businessName || 'our team'}. How can I help you today?`,
      brandColor: /^#[0-9a-fA-F]{6}$/.test(bot.brandColor || '') ? bot.brandColor : '#2563EB',
      logoUrl: bot.logoUrl && /^https?:\/\//i.test(bot.logoUrl) ? bot.logoUrl : null,
      widgetPosition: bot.widgetPosition === 'bottom-left' ? 'bottom-left' : 'bottom-right',
      showCitations: Boolean(bot.showCitations),
      enableConversationHistory: Boolean(bot.enableConversationHistory),
      enableHumanHandover: Boolean(bot.enableHumanHandover),
      humanHandoverEmail: bot.enableHumanHandover ? bot.humanHandoverEmail : null,
    },
  });
});

// Public Visitor Conversation History Resume
router.get('/:publicId/history', enforceWidgetCorsAndStatus, (req: WidgetRequest, res: Response) => {
  const bot = req.widgetBot!;
  const sessionId = typeof req.query.sessionId === 'string' ? req.query.sessionId.trim() : '';

  if (!sessionId || !SESSION_ID_REGEX.test(sessionId)) {
    res.status(400).json({ success: false, message: 'Valid sessionId is required.' });
    return;
  }

  if (!bot.enableConversationHistory) {
    res.json({ success: true, data: { sessionId, messages: [] } });
    return;
  }

  const conv = db
    .prepare(
      `SELECT ConversationId AS conversationId
       FROM Conversations
       WHERE ChatbotId = ? AND BusinessId = ? AND VisitorSession = ?
       ORDER BY ConversationId DESC
       LIMIT 1`
    )
    .get(bot.chatbotId, bot.businessId, sessionId) as { conversationId: number } | undefined;

  if (!conv) {
    res.json({ success: true, data: { sessionId, messages: [] } });
    return;
  }

  const messages = db
    .prepare(
      `SELECT SenderType AS senderType, Content AS content, CreatedOn AS createdOn
       FROM Messages
       WHERE ConversationId = ?
       ORDER BY MessageId ASC
       LIMIT 30`
    )
    .all(conv.conversationId);

  res.json({
    success: true,
    data: {
      sessionId,
      messages,
    },
  });
});

// Public Live Widget Chat Endpoint (Rate limited, Quota checked, RAG + Gemini + Conversation Persistence)
router.post(
  '/:publicId/chat',
  enforceWidgetCorsAndStatus,
  widgetChatLimiter,
  async (req: WidgetRequest, res: Response) => {
    const bot = req.widgetBot!;

    const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
    if (!message || message.length > 4000) {
      res.status(400).json({ success: false, message: 'Message must be between 1 and 4000 characters.' });
      return;
    }

    const providedSession = typeof req.body?.sessionId === 'string' ? req.body.sessionId.trim() : '';
    const sessionId =
      providedSession && SESSION_ID_REGEX.test(providedSession)
        ? providedSession
        : `vis_${crypto.randomBytes(12).toString('hex')}`;

    // Enforce monthly plan message quota for this business tenant
    const quotaRow = db
      .prepare(
        `SELECT
          COALESCE((
            SELECT sp.MaxMonthlyMessages
            FROM Subscriptions s
            JOIN SubscriptionPlans sp ON sp.PlanId = s.PlanId
            WHERE s.BusinessId = ?
              AND s.Status = 'Active'
              AND (s.ExpiresOn IS NULL OR s.ExpiresOn > strftime('%Y-%m-%dT%H:%M:%fZ','now'))
            ORDER BY s.SubscriptionId DESC
            LIMIT 1
          ), 250) AS maxMonthlyMessages,
          (
            SELECT COUNT(*)
            FROM Messages m
            WHERE m.BusinessId = ?
              AND m.SenderType = 'User'
              AND strftime('%Y-%m', m.CreatedOn) = strftime('%Y-%m', 'now')
          ) AS usedThisMonth`
      )
      .get(bot.businessId, bot.businessId) as { maxMonthlyMessages: number; usedThisMonth: number };

    if (quotaRow.usedThisMonth >= quotaRow.maxMonthlyMessages) {
      res.status(429).json({
        success: false,
        message: 'This assistant has reached its monthly message quota. Please contact support directly.',
      });
      return;
    }

    // Retrieve or prepare conversation context
    const existingConv = db
      .prepare(
        `SELECT ConversationId AS conversationId
         FROM Conversations
         WHERE ChatbotId = ? AND BusinessId = ? AND VisitorSession = ?
         ORDER BY ConversationId DESC
         LIMIT 1`
      )
      .get(bot.chatbotId, bot.businessId, sessionId) as { conversationId: number } | undefined;

    let history: PlaygroundTurn[] = [];
    if (bot.enableConversationHistory && existingConv) {
      const priorRows = db
        .prepare(
          `SELECT SenderType AS senderType, Content AS content
           FROM Messages
           WHERE ConversationId = ?
           ORDER BY MessageId DESC
           LIMIT 12`
        )
        .all(existingConv.conversationId) as Array<{ senderType: string; content: string }>;

      history = priorRows.reverse().map((r) => ({
        role: r.senderType === 'Assistant' ? 'model' : 'user',
        content: r.content.slice(0, 4000),
      }));
    }

    const indexedChunksAvailable = getIndexedChunkCountForChatbot(bot.chatbotId, bot.businessId);
    const wantsStream =
      req.body?.stream === true ||
      req.query.stream === '1' ||
      (typeof req.headers.accept === 'string' && req.headers.accept.includes('text/event-stream'));

    const persistTurn = (replyText: string, totalTokens: number, modelName: string) => {
      const isUnanswered = detectUnansweredReply(replyText, bot.fallbackMessage);
      let conversationId = existingConv?.conversationId ?? 0;

      db.exec('BEGIN');
      try {
        if (!conversationId) {
          const convRes = db
            .prepare(
              `INSERT INTO Conversations (ChatbotId, BusinessId, VisitorSession, VisitorDomain, IsResolved)
               VALUES (?, ?, ?, ?, 0)`
            )
            .run(bot.chatbotId, bot.businessId, sessionId, req.visitorDomain ?? null);
          conversationId = Number(convRes.lastInsertRowid);
        } else {
          db.prepare(
            `UPDATE Conversations
             SET VisitorDomain = COALESCE(?, VisitorDomain),
                 UpdatedOn = strftime('%Y-%m-%dT%H:%M:%fZ','now')
             WHERE ConversationId = ? AND BusinessId = ?`
          ).run(req.visitorDomain ?? null, conversationId, bot.businessId);
        }

        const insertMsg = db.prepare(
          `INSERT INTO Messages (ConversationId, BusinessId, SenderType, Content, TokensUsed, IsUnanswered)
           VALUES (?, ?, ?, ?, ?, ?)`
        );
        insertMsg.run(conversationId, bot.businessId, 'User', message, 0, 0);
        insertMsg.run(
          conversationId,
          bot.businessId,
          'Assistant',
          replyText,
          totalTokens,
          isUnanswered ? 1 : 0
        );

        db.prepare(
          `INSERT INTO UsageLogs (BusinessId, ChatbotId, TokensUsed, MessageCount, ModelName)
           VALUES (?, ?, ?, 1, ?)`
        ).run(bot.businessId, bot.chatbotId, totalTokens, modelName);

        db.exec('COMMIT');
      } catch (dbErr) {
        db.exec('ROLLBACK');
        throw dbErr;
      }

      return { conversationId, isUnanswered };
    };

    let streamStarted = false;
    const sendSse = (event: string, data: unknown) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      let retrievedChunks: RetrievedChunk[] = [];
      if (indexedChunksAvailable > 0) {
        retrievedChunks = await retrieveRelevantChunks({
          chatbotId: bot.chatbotId,
          businessId: bot.businessId,
          query: message,
          topK: 5,
          minScore: 0.28,
        });
      }

      const composedInstruction = buildComposedInstruction(
        bot,
        bot.systemInstructions || '',
        bot.maxOutputTokens,
        retrievedChunks
      );

      let result;
      if (wantsStream) {
        res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');
        res.flushHeaders?.();
        streamStarted = true;
        sendSse('meta', { sessionId });

        result = await generateGeminiReplyStream(
          {
            model: bot.aiModel,
            systemInstruction: composedInstruction,
            history,
            userMessage: message,
            temperature: bot.temperature,
            maxOutputTokens: bot.maxOutputTokens,
          },
          (delta) => {
            sendSse('chunk', { delta });
          }
        );
      } else {
        result = await generateGeminiReply({
          model: bot.aiModel,
          systemInstruction: composedInstruction,
          history,
          userMessage: message,
          temperature: bot.temperature,
          maxOutputTokens: bot.maxOutputTokens,
        });
      }

      const { conversationId, isUnanswered } = persistTurn(
        result.reply,
        result.usage.totalTokens,
        result.model
      );

      const citations = bot.showCitations
        ? retrievedChunks.map((c) => ({
            sourceTitle: c.sourceTitle,
            sourceType: c.sourceType,
            sourceUri: c.sourceUri,
          }))
        : [];

      const handoverOffered =
        Boolean(bot.enableHumanHandover) &&
        Boolean(bot.humanHandoverEmail) &&
        (isUnanswered || /human|agent|support|representative|person/i.test(message));

      const payload = {
        sessionId,
        conversationId,
        reply: result.reply,
        responseTimeMs: result.responseTimeMs,
        citations,
        handoverOffered,
        humanHandoverEmail: handoverOffered ? bot.humanHandoverEmail : null,
      };

      if (streamStarted) {
        sendSse('done', payload);
        res.end();
      } else {
        res.json({ success: true, data: payload });
      }
    } catch (err: unknown) {
      const status = err instanceof GeminiServiceError ? err.statusCode : 500;
      const errMsg =
        err instanceof GeminiServiceError
          ? err.message
          : 'Unable to generate an assistant response right now. Please try again.';
      if (!(err instanceof GeminiServiceError)) {
        console.error('[Widget Chat Error]', err);
      }
      if (streamStarted) {
        sendSse('error', { message: errMsg });
        res.end();
      } else {
        res.status(status).json({ success: false, message: errMsg });
      }
    }
  }
);

export default router;
