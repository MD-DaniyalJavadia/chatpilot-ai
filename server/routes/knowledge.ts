import { Router, type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import { db, writeAuditLog } from '../db.ts';
import { authenticate, requireRoles, type AuthenticatedRequest } from '../middleware/auth.ts';
import { createRateLimiter } from '../middleware/rateLimit.ts';
import {
  DocumentExtractionError,
  MAX_UPLOAD_SIZE_BYTES,
  extractDocumentContent,
  normalizeExtractedText,
} from '../services/documentExtractorService.ts';
import { GeminiServiceError } from '../services/geminiService.ts';
import { indexKnowledgeSourceChunks, retrieveRelevantChunks } from '../services/ragService.ts';
import { WebsiteCrawlerError, crawlWebsiteContent } from '../services/websiteCrawlerService.ts';

const router = Router({ mergeParams: true });
const ingestLimiter = createRateLimiter(25, 60 * 1000);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_UPLOAD_SIZE_BYTES,
    files: 1,
  },
});

function handleSingleFileUpload(req: Request, res: Response, next: NextFunction): void {
  upload.single('file')(req, res, (err: unknown) => {
    if (!err) {
      next();
      return;
    }
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        res.status(400).json({ success: false, message: 'Uploaded file exceeds the 10 MB maximum size.' });
        return;
      }
      res.status(400).json({ success: false, message: err.message });
      return;
    }
    res.status(400).json({ success: false, message: 'Invalid multipart upload request.' });
  });
}

function getOwnedChatbot(chatbotId: number, businessId: number): { chatbotId: number; name: string } | null {
  const row = db
    .prepare(`SELECT ChatbotId AS chatbotId, Name AS name FROM Chatbots WHERE ChatbotId = ? AND BusinessId = ?`)
    .get(chatbotId, businessId) as { chatbotId: number; name: string } | undefined;
  return row ?? null;
}

function parseChatbotId(req: AuthenticatedRequest, res: Response): number | null {
  const chatbotId = Number(req.params.chatbotId);
  if (!Number.isInteger(chatbotId) || chatbotId <= 0) {
    res.status(400).json({ success: false, message: 'Invalid chatbot ID.' });
    return null;
  }
  return chatbotId;
}

function formatSourceSummary(row: Record<string, unknown>) {
  return {
    sourceId: row.sourceId,
    chatbotId: row.chatbotId,
    businessId: row.businessId,
    sourceType: row.sourceType,
    title: row.title,
    sourceUri: row.sourceUri,
    fileName: row.fileName,
    fileSizeBytes: row.fileSizeBytes,
    faqQuestion: row.faqQuestion,
    faqAnswer: row.faqAnswer,
    status: row.status,
    errorMessage: row.errorMessage,
    chunkCount: row.chunkCount,
    totalTokens: row.totalTokens,
    lastIndexedOn: row.lastIndexedOn,
    createdOn: row.createdOn,
    updatedOn: row.updatedOn,
  };
}

function getSourceRow(sourceId: number, chatbotId: number, businessId: number) {
  return db
    .prepare(
      `SELECT
        SourceId AS sourceId,
        ChatbotId AS chatbotId,
        BusinessId AS businessId,
        SourceType AS sourceType,
        Title AS title,
        SourceUri AS sourceUri,
        FileName AS fileName,
        FileSizeBytes AS fileSizeBytes,
        RawText AS rawText,
        FaqQuestion AS faqQuestion,
        FaqAnswer AS faqAnswer,
        Status AS status,
        ErrorMessage AS errorMessage,
        ChunkCount AS chunkCount,
        TotalTokens AS totalTokens,
        LastIndexedOn AS lastIndexedOn,
        CreatedOn AS createdOn,
        UpdatedOn AS updatedOn
      FROM KnowledgeSources
      WHERE SourceId = ? AND ChatbotId = ? AND BusinessId = ?`
    )
    .get(sourceId, chatbotId, businessId) as Record<string, unknown> | undefined;
}

function markSourceFailed(sourceId: number, businessId: number, message: string): void {
  db.prepare(
    `UPDATE KnowledgeSources
     SET Status = 'Failed', ErrorMessage = ?, UpdatedOn = strftime('%Y-%m-%dT%H:%M:%fZ','now')
     WHERE SourceId = ? AND BusinessId = ?`
  ).run(message.slice(0, 950), sourceId, businessId);
}

// 1. List Knowledge Sources + Stats (Tenant & Chatbot Isolated)
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
    const chatbotId = parseChatbotId(req, res);
    if (!chatbotId) return;

    const bot = getOwnedChatbot(chatbotId, businessId);
    if (!bot) {
      res.status(404).json({ success: false, message: 'Chatbot not found in your business workspace.' });
      return;
    }

    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const typeFilter = typeof req.query.type === 'string' ? req.query.type.trim() : 'All';
    const statusFilter = typeof req.query.status === 'string' ? req.query.status.trim() : 'All';
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));
    const offset = (page - 1) * pageSize;

    const where: string[] = ['ChatbotId = ?', 'BusinessId = ?'];
    const params: Array<string | number> = [chatbotId, businessId];

    if (typeFilter && typeFilter !== 'All') {
      if (typeFilter === 'Documents') {
        where.push(`SourceType IN ('PDF', 'DOCX', 'TXT')`);
      } else {
        where.push('SourceType = ?');
        params.push(typeFilter);
      }
    }

    if (statusFilter && statusFilter !== 'All') {
      where.push('Status = ?');
      params.push(statusFilter);
    }

    if (search) {
      where.push(`(Title LIKE ? OR COALESCE(SourceUri, '') LIKE ? OR COALESCE(FileName, '') LIKE ? OR COALESCE(FaqQuestion, '') LIKE ?)`);
      const like = `%${search}%`;
      params.push(like, like, like, like);
    }

    const whereSql = `WHERE ${where.join(' AND ')}`;

    const totalRow = db
      .prepare(`SELECT COUNT(*) AS total FROM KnowledgeSources ${whereSql}`)
      .get(...params) as { total: number };

    const items = db
      .prepare(
        `SELECT
          SourceId AS sourceId,
          ChatbotId AS chatbotId,
          BusinessId AS businessId,
          SourceType AS sourceType,
          Title AS title,
          SourceUri AS sourceUri,
          FileName AS fileName,
          FileSizeBytes AS fileSizeBytes,
          FaqQuestion AS faqQuestion,
          FaqAnswer AS faqAnswer,
          Status AS status,
          ErrorMessage AS errorMessage,
          ChunkCount AS chunkCount,
          TotalTokens AS totalTokens,
          LastIndexedOn AS lastIndexedOn,
          CreatedOn AS createdOn,
          UpdatedOn AS updatedOn
         FROM KnowledgeSources
         ${whereSql}
         ORDER BY CreatedOn DESC
         LIMIT ? OFFSET ?`
      )
      .all(...params, pageSize, offset) as Array<Record<string, unknown>>;

    const stats = db
      .prepare(
        `SELECT
          COUNT(*) AS totalSources,
          COALESCE(SUM(CASE WHEN Status = 'Indexed' THEN 1 ELSE 0 END), 0) AS indexedSources,
          COALESCE(SUM(CASE WHEN Status IN ('Pending', 'Processing') THEN 1 ELSE 0 END), 0) AS processingSources,
          COALESCE(SUM(CASE WHEN Status = 'Failed' THEN 1 ELSE 0 END), 0) AS failedSources,
          COALESCE(SUM(CASE WHEN Status = 'Indexed' THEN ChunkCount ELSE 0 END), 0) AS totalChunks,
          COALESCE(SUM(CASE WHEN Status = 'Indexed' THEN TotalTokens ELSE 0 END), 0) AS totalTokens
         FROM KnowledgeSources
         WHERE ChatbotId = ? AND BusinessId = ?`
      )
      .get(chatbotId, businessId) as Record<string, number>;

    res.json({
      success: true,
      data: {
        chatbot: bot,
        items: items.map(formatSourceSummary),
        total: totalRow.total,
        page,
        pageSize,
        stats,
      },
    });
  }
);

// 2. Get Single Knowledge Source + Indexed Chunks Preview
router.get(
  '/:sourceId',
  authenticate,
  requireRoles('BusinessOwner', 'BusinessAdmin', 'BusinessStaff'),
  (req: AuthenticatedRequest, res) => {
    const businessId = req.user?.businessId;
    if (!businessId) {
      res.status(403).json({ success: false, message: 'No business workspace assigned.' });
      return;
    }
    const chatbotId = parseChatbotId(req, res);
    if (!chatbotId) return;

    const sourceId = Number(req.params.sourceId);
    if (!Number.isInteger(sourceId) || sourceId <= 0) {
      res.status(400).json({ success: false, message: 'Invalid source ID.' });
      return;
    }

    const source = getSourceRow(sourceId, chatbotId, businessId);
    if (!source) {
      res.status(404).json({ success: false, message: 'Knowledge source not found.' });
      return;
    }

    const chunks = db
      .prepare(
        `SELECT ChunkId AS chunkId, ChunkIndex AS chunkIndex, Content AS content, TokenCount AS tokenCount, CreatedOn AS createdOn
         FROM KnowledgeChunks
         WHERE SourceId = ? AND ChatbotId = ? AND BusinessId = ?
         ORDER BY ChunkIndex ASC`
      )
      .all(sourceId, chatbotId, businessId);

    res.json({
      success: true,
      data: {
        ...formatSourceSummary(source),
        rawText: source.rawText,
        chunks,
      },
    });
  }
);

// 3. Upload Document (PDF, DOCX, TXT, MD) -> Extract -> Chunk -> Embed
router.post(
  '/upload',
  authenticate,
  requireRoles('BusinessOwner', 'BusinessAdmin'),
  ingestLimiter,
  handleSingleFileUpload,
  async (req: AuthenticatedRequest, res) => {
    const businessId = req.user?.businessId;
    if (!businessId) {
      res.status(403).json({ success: false, message: 'No business workspace assigned.' });
      return;
    }
    const chatbotId = parseChatbotId(req, res);
    if (!chatbotId) return;

    const bot = getOwnedChatbot(chatbotId, businessId);
    if (!bot) {
      res.status(404).json({ success: false, message: 'Chatbot not found in your business workspace.' });
      return;
    }

    const file = req.file;
    if (!file) {
      res.status(400).json({ success: false, message: 'Please select a PDF, DOCX, TXT, or MD file to upload.' });
      return;
    }

    let extracted;
    try {
      extracted = await extractDocumentContent({
        originalName: file.originalname,
        mimeType: file.mimetype,
        buffer: file.buffer,
      });
    } catch (err: unknown) {
      if (err instanceof DocumentExtractionError) {
        res.status(err.statusCode).json({ success: false, message: err.message });
        return;
      }
      res.status(400).json({ success: false, message: 'Failed to process uploaded document.' });
      return;
    }

    const customTitle = typeof req.body?.title === 'string' ? req.body.title.trim().slice(0, 200) : '';
    const title = customTitle || extracted.safeFileName;

    const insertRes = db
      .prepare(
        `INSERT INTO KnowledgeSources (
          ChatbotId, BusinessId, SourceType, Title, FileName, FileSizeBytes, RawText, Status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'Processing')`
      )
      .run(
        chatbotId,
        businessId,
        extracted.sourceType,
        title,
        extracted.safeFileName,
        file.size,
        extracted.text
      );

    const sourceId = Number(insertRes.lastInsertRowid);

    try {
      const { chunkCount, totalTokens } = await indexKnowledgeSourceChunks({
        sourceId,
        chatbotId,
        businessId,
        rawText: extracted.text,
      });

      writeAuditLog({
        userId: req.user?.userId,
        businessId,
        action: 'KnowledgeDocumentUploaded',
        entityType: 'KnowledgeSource',
        entityId: sourceId,
        details: `Indexed ${extracted.sourceType} "${title}" (${chunkCount} chunks, ${totalTokens} tokens) for chatbot ${chatbotId}`,
        ipAddress: req.ip,
      });

      const created = getSourceRow(sourceId, chatbotId, businessId)!;
      res.status(201).json({
        success: true,
        message: `Document "${title}" indexed into ${chunkCount} knowledge chunks.`,
        data: formatSourceSummary(created),
      });
    } catch (err: unknown) {
      const msg = err instanceof GeminiServiceError ? err.message : 'Failed to generate embeddings for uploaded document.';
      markSourceFailed(sourceId, businessId, msg);
      const status = err instanceof GeminiServiceError ? err.statusCode : 500;
      res.status(status).json({
        success: false,
        message: msg,
        data: formatSourceSummary(getSourceRow(sourceId, chatbotId, businessId)!),
      });
    }
  }
);

// 4. Website URL Ingestion (SSRF-Safe Crawl -> Extract -> Chunk -> Embed)
router.post(
  '/website',
  authenticate,
  requireRoles('BusinessOwner', 'BusinessAdmin'),
  ingestLimiter,
  async (req: AuthenticatedRequest, res) => {
    const businessId = req.user?.businessId;
    if (!businessId) {
      res.status(403).json({ success: false, message: 'No business workspace assigned.' });
      return;
    }
    const chatbotId = parseChatbotId(req, res);
    if (!chatbotId) return;

    const bot = getOwnedChatbot(chatbotId, businessId);
    if (!bot) {
      res.status(404).json({ success: false, message: 'Chatbot not found in your business workspace.' });
      return;
    }

    const url = typeof req.body?.url === 'string' ? req.body.url.trim() : '';
    const customTitle = typeof req.body?.title === 'string' ? req.body.title.trim().slice(0, 200) : '';
    const crawlMode = req.body?.crawlMode === 'crawl' ? 'crawl' : 'single';
    const requestedMaxPages = Math.min(10, Math.max(1, Math.round(Number(req.body?.maxPages) || 1)));

    if (!url) {
      res.status(400).json({ success: false, message: 'Website URL is required.' });
      return;
    }

    // Enforce plan-level multi-page crawl allowance while permitting single-page indexing on all plans
    const planRow = db
      .prepare(
        `SELECT COALESCE(sp.AllowWebsiteIngestion, 0) AS allowMultiCrawl, COALESCE(sp.Name, 'Free') AS planName
         FROM Businesses b
         LEFT JOIN Subscriptions s ON s.BusinessId = b.BusinessId
           AND s.Status = 'Active'
           AND (s.ExpiresOn IS NULL OR s.ExpiresOn > strftime('%Y-%m-%dT%H:%M:%fZ','now'))
         LEFT JOIN SubscriptionPlans sp ON sp.PlanId = s.PlanId
         WHERE b.BusinessId = ?
         ORDER BY s.SubscriptionId DESC
         LIMIT 1`
      )
      .get(businessId) as { allowMultiCrawl: number; planName: string } | undefined;

    const effectiveMaxPages = crawlMode === 'crawl' && !planRow?.allowMultiCrawl ? Math.min(3, requestedMaxPages) : requestedMaxPages;

    let crawled;
    try {
      crawled = await crawlWebsiteContent({
        url,
        crawlMode,
        maxPages: effectiveMaxPages,
      });
    } catch (err: unknown) {
      if (err instanceof WebsiteCrawlerError) {
        res.status(err.statusCode).json({ success: false, message: err.message });
        return;
      }
      res.status(400).json({ success: false, message: 'Failed to crawl website URL.' });
      return;
    }

    const title = customTitle || crawled.title || crawled.finalUrl;

    const insertRes = db
      .prepare(
        `INSERT INTO KnowledgeSources (
          ChatbotId, BusinessId, SourceType, Title, SourceUri, RawText, Status
        ) VALUES (?, ?, 'URL', ?, ?, ?, 'Processing')`
      )
      .run(chatbotId, businessId, title, crawled.finalUrl, crawled.text);

    const sourceId = Number(insertRes.lastInsertRowid);

    try {
      const { chunkCount, totalTokens } = await indexKnowledgeSourceChunks({
        sourceId,
        chatbotId,
        businessId,
        rawText: crawled.text,
      });

      writeAuditLog({
        userId: req.user?.userId,
        businessId,
        action: 'KnowledgeWebsiteIngested',
        entityType: 'KnowledgeSource',
        entityId: sourceId,
        details: `Indexed URL "${crawled.finalUrl}" (${crawled.pagesCrawled} page(s), ${chunkCount} chunks) for chatbot ${chatbotId}`,
        ipAddress: req.ip,
      });

      const created = getSourceRow(sourceId, chatbotId, businessId)!;
      res.status(201).json({
        success: true,
        message: `Website indexed (${crawled.pagesCrawled} page${crawled.pagesCrawled === 1 ? '' : 's'}, ${chunkCount} chunks).`,
        data: formatSourceSummary(created),
      });
    } catch (err: unknown) {
      const msg = err instanceof GeminiServiceError ? err.message : 'Failed to generate embeddings for crawled webpage.';
      markSourceFailed(sourceId, businessId, msg);
      const status = err instanceof GeminiServiceError ? err.statusCode : 500;
      res.status(status).json({
        success: false,
        message: msg,
        data: formatSourceSummary(getSourceRow(sourceId, chatbotId, businessId)!),
      });
    }
  }
);

// 5. Add Curated FAQ Pair
router.post(
  '/faq',
  authenticate,
  requireRoles('BusinessOwner', 'BusinessAdmin'),
  ingestLimiter,
  async (req: AuthenticatedRequest, res) => {
    const businessId = req.user?.businessId;
    if (!businessId) {
      res.status(403).json({ success: false, message: 'No business workspace assigned.' });
      return;
    }
    const chatbotId = parseChatbotId(req, res);
    if (!chatbotId) return;

    const bot = getOwnedChatbot(chatbotId, businessId);
    if (!bot) {
      res.status(404).json({ success: false, message: 'Chatbot not found in your business workspace.' });
      return;
    }

    const question = typeof req.body?.question === 'string' ? req.body.question.trim() : '';
    const answer = typeof req.body?.answer === 'string' ? req.body.answer.trim() : '';
    const customTitle = typeof req.body?.title === 'string' ? req.body.title.trim().slice(0, 200) : '';

    if (question.length < 5 || question.length > 500) {
      res.status(400).json({ success: false, message: 'FAQ question must be between 5 and 500 characters.' });
      return;
    }
    if (answer.length < 5 || answer.length > 8000) {
      res.status(400).json({ success: false, message: 'FAQ answer must be between 5 and 8000 characters.' });
      return;
    }

    const title = customTitle || question.slice(0, 120);
    const rawText = normalizeExtractedText(`FAQ Question: ${question}\nFAQ Answer: ${answer}`);

    const insertRes = db
      .prepare(
        `INSERT INTO KnowledgeSources (
          ChatbotId, BusinessId, SourceType, Title, RawText, FaqQuestion, FaqAnswer, Status
        ) VALUES (?, ?, 'FAQ', ?, ?, ?, ?, 'Processing')`
      )
      .run(chatbotId, businessId, title, rawText, question, answer);

    const sourceId = Number(insertRes.lastInsertRowid);

    try {
      const { chunkCount } = await indexKnowledgeSourceChunks({
        sourceId,
        chatbotId,
        businessId,
        rawText,
      });

      writeAuditLog({
        userId: req.user?.userId,
        businessId,
        action: 'KnowledgeFaqCreated',
        entityType: 'KnowledgeSource',
        entityId: sourceId,
        details: `Indexed FAQ "${title}" (${chunkCount} chunk(s)) for chatbot ${chatbotId}`,
        ipAddress: req.ip,
      });

      res.status(201).json({
        success: true,
        message: 'FAQ added and indexed for retrieval.',
        data: formatSourceSummary(getSourceRow(sourceId, chatbotId, businessId)!),
      });
    } catch (err: unknown) {
      const msg = err instanceof GeminiServiceError ? err.message : 'Failed to embed FAQ entry.';
      markSourceFailed(sourceId, businessId, msg);
      const status = err instanceof GeminiServiceError ? err.statusCode : 500;
      res.status(status).json({
        success: false,
        message: msg,
        data: formatSourceSummary(getSourceRow(sourceId, chatbotId, businessId)!),
      });
    }
  }
);

// 6. Add Manual Knowledge Text / Article
router.post(
  '/manual',
  authenticate,
  requireRoles('BusinessOwner', 'BusinessAdmin'),
  ingestLimiter,
  async (req: AuthenticatedRequest, res) => {
    const businessId = req.user?.businessId;
    if (!businessId) {
      res.status(403).json({ success: false, message: 'No business workspace assigned.' });
      return;
    }
    const chatbotId = parseChatbotId(req, res);
    if (!chatbotId) return;

    const bot = getOwnedChatbot(chatbotId, businessId);
    if (!bot) {
      res.status(404).json({ success: false, message: 'Chatbot not found in your business workspace.' });
      return;
    }

    const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
    const content = typeof req.body?.content === 'string' ? normalizeExtractedText(req.body.content) : '';

    if (title.length < 2 || title.length > 200) {
      res.status(400).json({ success: false, message: 'Title must be between 2 and 200 characters.' });
      return;
    }
    if (content.length < 15 || content.length > 100000) {
      res.status(400).json({ success: false, message: 'Content must be between 15 and 100,000 characters.' });
      return;
    }

    const insertRes = db
      .prepare(
        `INSERT INTO KnowledgeSources (
          ChatbotId, BusinessId, SourceType, Title, RawText, Status
        ) VALUES (?, ?, 'Manual', ?, ?, 'Processing')`
      )
      .run(chatbotId, businessId, title, content);

    const sourceId = Number(insertRes.lastInsertRowid);

    try {
      const { chunkCount } = await indexKnowledgeSourceChunks({
        sourceId,
        chatbotId,
        businessId,
        rawText: content,
      });

      writeAuditLog({
        userId: req.user?.userId,
        businessId,
        action: 'KnowledgeManualCreated',
        entityType: 'KnowledgeSource',
        entityId: sourceId,
        details: `Indexed manual knowledge "${title}" (${chunkCount} chunks) for chatbot ${chatbotId}`,
        ipAddress: req.ip,
      });

      res.status(201).json({
        success: true,
        message: `Knowledge entry "${title}" indexed into ${chunkCount} chunk(s).`,
        data: formatSourceSummary(getSourceRow(sourceId, chatbotId, businessId)!),
      });
    } catch (err: unknown) {
      const msg = err instanceof GeminiServiceError ? err.message : 'Failed to embed manual knowledge entry.';
      markSourceFailed(sourceId, businessId, msg);
      const status = err instanceof GeminiServiceError ? err.statusCode : 500;
      res.status(status).json({
        success: false,
        message: msg,
        data: formatSourceSummary(getSourceRow(sourceId, chatbotId, businessId)!),
      });
    }
  }
);

// 7. Update FAQ or Manual Knowledge Source & Re-embed
router.put(
  '/:sourceId',
  authenticate,
  requireRoles('BusinessOwner', 'BusinessAdmin'),
  ingestLimiter,
  async (req: AuthenticatedRequest, res) => {
    const businessId = req.user?.businessId;
    if (!businessId) {
      res.status(403).json({ success: false, message: 'No business workspace assigned.' });
      return;
    }
    const chatbotId = parseChatbotId(req, res);
    if (!chatbotId) return;

    const sourceId = Number(req.params.sourceId);
    if (!Number.isInteger(sourceId) || sourceId <= 0) {
      res.status(400).json({ success: false, message: 'Invalid source ID.' });
      return;
    }

    const existing = getSourceRow(sourceId, chatbotId, businessId);
    if (!existing) {
      res.status(404).json({ success: false, message: 'Knowledge source not found.' });
      return;
    }

    if (existing.sourceType !== 'FAQ' && existing.sourceType !== 'Manual') {
      res.status(400).json({ success: false, message: 'Only FAQ and Manual knowledge sources can be edited inline.' });
      return;
    }

    let nextTitle = '';
    let nextRawText = '';
    let nextQuestion: string | null = null;
    let nextAnswer: string | null = null;

    if (existing.sourceType === 'FAQ') {
      const question = typeof req.body?.question === 'string' ? req.body.question.trim() : '';
      const answer = typeof req.body?.answer === 'string' ? req.body.answer.trim() : '';
      const customTitle = typeof req.body?.title === 'string' ? req.body.title.trim().slice(0, 200) : '';
      if (question.length < 5 || question.length > 500) {
        res.status(400).json({ success: false, message: 'FAQ question must be between 5 and 500 characters.' });
        return;
      }
      if (answer.length < 5 || answer.length > 8000) {
        res.status(400).json({ success: false, message: 'FAQ answer must be between 5 and 8000 characters.' });
        return;
      }
      nextQuestion = question;
      nextAnswer = answer;
      nextTitle = customTitle || question.slice(0, 120);
      nextRawText = normalizeExtractedText(`FAQ Question: ${question}\nFAQ Answer: ${answer}`);
    } else {
      const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
      const content = typeof req.body?.content === 'string' ? normalizeExtractedText(req.body.content) : '';
      if (title.length < 2 || title.length > 200) {
        res.status(400).json({ success: false, message: 'Title must be between 2 and 200 characters.' });
        return;
      }
      if (content.length < 15 || content.length > 100000) {
        res.status(400).json({ success: false, message: 'Content must be between 15 and 100,000 characters.' });
        return;
      }
      nextTitle = title;
      nextRawText = content;
    }

    db.prepare(
      `UPDATE KnowledgeSources
       SET Title = ?, RawText = ?, FaqQuestion = ?, FaqAnswer = ?, Status = 'Processing', ErrorMessage = NULL,
           UpdatedOn = strftime('%Y-%m-%dT%H:%M:%fZ','now')
       WHERE SourceId = ? AND ChatbotId = ? AND BusinessId = ?`
    ).run(nextTitle, nextRawText, nextQuestion, nextAnswer, sourceId, chatbotId, businessId);

    try {
      const { chunkCount } = await indexKnowledgeSourceChunks({
        sourceId,
        chatbotId,
        businessId,
        rawText: nextRawText,
      });

      writeAuditLog({
        userId: req.user?.userId,
        businessId,
        action: 'KnowledgeSourceUpdated',
        entityType: 'KnowledgeSource',
        entityId: sourceId,
        details: `Updated & re-indexed "${nextTitle}" (${chunkCount} chunks)`,
        ipAddress: req.ip,
      });

      res.json({
        success: true,
        message: 'Knowledge entry updated and re-indexed.',
        data: formatSourceSummary(getSourceRow(sourceId, chatbotId, businessId)!),
      });
    } catch (err: unknown) {
      const msg = err instanceof GeminiServiceError ? err.message : 'Failed to re-embed knowledge entry.';
      markSourceFailed(sourceId, businessId, msg);
      const status = err instanceof GeminiServiceError ? err.statusCode : 500;
      res.status(status).json({ success: false, message: msg });
    }
  }
);

// 8. Re-index Knowledge Source (re-crawls URL if requested or re-embeds stored RawText)
router.post(
  '/:sourceId/reindex',
  authenticate,
  requireRoles('BusinessOwner', 'BusinessAdmin'),
  ingestLimiter,
  async (req: AuthenticatedRequest, res) => {
    const businessId = req.user?.businessId;
    if (!businessId) {
      res.status(403).json({ success: false, message: 'No business workspace assigned.' });
      return;
    }
    const chatbotId = parseChatbotId(req, res);
    if (!chatbotId) return;

    const sourceId = Number(req.params.sourceId);
    if (!Number.isInteger(sourceId) || sourceId <= 0) {
      res.status(400).json({ success: false, message: 'Invalid source ID.' });
      return;
    }

    const existing = getSourceRow(sourceId, chatbotId, businessId);
    if (!existing) {
      res.status(404).json({ success: false, message: 'Knowledge source not found.' });
      return;
    }

    let rawText = typeof existing.rawText === 'string' ? existing.rawText : '';

    if (existing.sourceType === 'URL' && existing.sourceUri && (req.body?.refreshCrawl || !rawText)) {
      try {
        const crawled = await crawlWebsiteContent({
          url: String(existing.sourceUri),
          crawlMode: 'single',
          maxPages: 1,
        });
        rawText = crawled.text;
        db.prepare(`UPDATE KnowledgeSources SET RawText = ? WHERE SourceId = ? AND BusinessId = ?`).run(
          rawText,
          sourceId,
          businessId
        );
      } catch (err: unknown) {
        const msg = err instanceof WebsiteCrawlerError ? err.message : 'Failed to re-crawl website URL.';
        markSourceFailed(sourceId, businessId, msg);
        res.status(400).json({ success: false, message: msg });
        return;
      }
    }

    if (!rawText.trim()) {
      res.status(400).json({ success: false, message: 'No extracted source text is available to re-index.' });
      return;
    }

    db.prepare(
      `UPDATE KnowledgeSources SET Status = 'Processing', ErrorMessage = NULL, UpdatedOn = strftime('%Y-%m-%dT%H:%M:%fZ','now')
       WHERE SourceId = ? AND BusinessId = ?`
    ).run(sourceId, businessId);

    try {
      const { chunkCount } = await indexKnowledgeSourceChunks({
        sourceId,
        chatbotId,
        businessId,
        rawText,
      });

      writeAuditLog({
        userId: req.user?.userId,
        businessId,
        action: 'KnowledgeSourceReindexed',
        entityType: 'KnowledgeSource',
        entityId: sourceId,
        details: `Re-indexed "${existing.title}" (${chunkCount} chunks)`,
        ipAddress: req.ip,
      });

      res.json({
        success: true,
        message: `Re-indexed "${existing.title}" into ${chunkCount} chunk(s).`,
        data: formatSourceSummary(getSourceRow(sourceId, chatbotId, businessId)!),
      });
    } catch (err: unknown) {
      const msg = err instanceof GeminiServiceError ? err.message : 'Failed to re-index knowledge source.';
      markSourceFailed(sourceId, businessId, msg);
      const status = err instanceof GeminiServiceError ? err.statusCode : 500;
      res.status(status).json({ success: false, message: msg });
    }
  }
);

// 9. Delete Knowledge Source & Cascading Vector Chunks
router.delete(
  '/:sourceId',
  authenticate,
  requireRoles('BusinessOwner', 'BusinessAdmin'),
  (req: AuthenticatedRequest, res) => {
    const businessId = req.user?.businessId;
    if (!businessId) {
      res.status(403).json({ success: false, message: 'No business workspace assigned.' });
      return;
    }
    const chatbotId = parseChatbotId(req, res);
    if (!chatbotId) return;

    const sourceId = Number(req.params.sourceId);
    if (!Number.isInteger(sourceId) || sourceId <= 0) {
      res.status(400).json({ success: false, message: 'Invalid source ID.' });
      return;
    }

    const existing = getSourceRow(sourceId, chatbotId, businessId);
    if (!existing) {
      res.status(404).json({ success: false, message: 'Knowledge source not found.' });
      return;
    }

    db.exec('BEGIN');
    try {
      db.prepare(`DELETE FROM KnowledgeChunks WHERE SourceId = ? AND ChatbotId = ? AND BusinessId = ?`).run(
        sourceId,
        chatbotId,
        businessId
      );
      db.prepare(`DELETE FROM KnowledgeSources WHERE SourceId = ? AND ChatbotId = ? AND BusinessId = ?`).run(
        sourceId,
        chatbotId,
        businessId
      );
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }

    writeAuditLog({
      userId: req.user?.userId,
      businessId,
      action: 'KnowledgeSourceDeleted',
      entityType: 'KnowledgeSource',
      entityId: sourceId,
      details: `Deleted ${existing.sourceType} source "${existing.title}" from chatbot ${chatbotId}`,
      ipAddress: req.ip,
    });

    res.json({ success: true, message: 'Knowledge source and associated chunks deleted.' });
  }
);

// 10. Semantic RAG Retrieval Test (Vector Similarity Search Preview)
router.post(
  '/search',
  authenticate,
  requireRoles('BusinessOwner', 'BusinessAdmin', 'BusinessStaff'),
  async (req: AuthenticatedRequest, res) => {
    const businessId = req.user?.businessId;
    if (!businessId) {
      res.status(403).json({ success: false, message: 'No business workspace assigned.' });
      return;
    }
    const chatbotId = parseChatbotId(req, res);
    if (!chatbotId) return;

    const bot = getOwnedChatbot(chatbotId, businessId);
    if (!bot) {
      res.status(404).json({ success: false, message: 'Chatbot not found in your business workspace.' });
      return;
    }

    const query = typeof req.body?.query === 'string' ? req.body.query.trim() : '';
    const topK = Math.min(10, Math.max(1, Math.round(Number(req.body?.topK) || 5)));

    if (!query || query.length > 1000) {
      res.status(400).json({ success: false, message: 'Search query must be between 1 and 1000 characters.' });
      return;
    }

    try {
      const results = await retrieveRelevantChunks({
        chatbotId,
        businessId,
        query,
        topK,
        minScore: 0.2,
      });

      res.json({
        success: true,
        data: {
          query,
          matches: results,
        },
      });
    } catch (err: unknown) {
      if (err instanceof GeminiServiceError) {
        res.status(err.statusCode).json({ success: false, message: err.message });
        return;
      }
      res.status(500).json({ success: false, message: 'Failed to execute semantic knowledge retrieval.' });
    }
  }
);

export default router;
