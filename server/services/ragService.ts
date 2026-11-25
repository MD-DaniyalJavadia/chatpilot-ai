import { db } from '../db.ts';
import { generateGeminiEmbeddings } from './geminiService.ts';

export interface TextChunk {
  chunkIndex: number;
  content: string;
  tokenCount: number;
}

export interface RetrievedChunk {
  chunkId: number;
  sourceId: number;
  sourceTitle: string;
  sourceType: string;
  sourceUri: string | null;
  chunkIndex: number;
  content: string;
  score: number;
  tokenCount: number;
}

export function estimateTokenCount(text: string): number {
  return Math.max(1, Math.ceil(text.trim().length / 4));
}

export function chunkText(
  rawText: string,
  options: { maxChars?: number; overlapChars?: number } = {}
): TextChunk[] {
  const maxChars = options.maxChars ?? 1000;
  const overlapChars = options.overlapChars ?? 180;
  const cleaned = rawText.replace(/\r\n/g, '\n').trim();
  if (!cleaned) return [];

  if (cleaned.length <= maxChars) {
    return [{ chunkIndex: 0, content: cleaned, tokenCount: estimateTokenCount(cleaned) }];
  }

  const chunks: TextChunk[] = [];
  let start = 0;
  let chunkIndex = 0;

  while (start < cleaned.length) {
    let end = Math.min(cleaned.length, start + maxChars);

    if (end < cleaned.length) {
      // Prefer paragraph -> newline -> sentence -> whitespace boundary
      const windowSlice = cleaned.slice(start, end);
      const minAcceptable = Math.floor(maxChars * 0.45);
      const paraIdx = windowSlice.lastIndexOf('\n\n');
      const lineIdx = windowSlice.lastIndexOf('\n');
      const sentIdx = Math.max(
        windowSlice.lastIndexOf('. '),
        windowSlice.lastIndexOf('? '),
        windowSlice.lastIndexOf('! ')
      );
      const spaceIdx = windowSlice.lastIndexOf(' ');

      if (paraIdx >= minAcceptable) {
        end = start + paraIdx;
      } else if (lineIdx >= minAcceptable) {
        end = start + lineIdx;
      } else if (sentIdx >= minAcceptable) {
        end = start + sentIdx + 1;
      } else if (spaceIdx >= minAcceptable) {
        end = start + spaceIdx;
      }
    }

    const slice = cleaned.slice(start, end).trim();
    if (slice) {
      chunks.push({
        chunkIndex,
        content: slice,
        tokenCount: estimateTokenCount(slice),
      });
      chunkIndex += 1;
    }

    if (end >= cleaned.length) break;
    const nextStart = Math.max(start + 1, end - overlapChars);
    start = nextStart;
  }

  return chunks;
}

function cosineSimilarity(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  if (len === 0) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < len; i += 1) {
    const va = a[i];
    const vb = b[i];
    dot += va * vb;
    normA += va * va;
    normB += vb * vb;
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom > 0 ? dot / denom : 0;
}

function computeKeywordBoost(query: string, chunkContent: string): number {
  const terms = query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3);
  if (!terms.length) return 0;

  const lower = chunkContent.toLowerCase();
  let hits = 0;
  for (const term of terms) {
    if (lower.includes(term)) hits += 1;
  }
  return Math.min(0.08, (hits / terms.length) * 0.08);
}

export async function indexKnowledgeSourceChunks(params: {
  sourceId: number;
  chatbotId: number;
  businessId: number;
  rawText: string;
}): Promise<{ chunkCount: number; totalTokens: number }> {
  const chunks = chunkText(params.rawText);
  if (!chunks.length) {
    throw new Error('No content available to chunk and index.');
  }

  const vectors = await generateGeminiEmbeddings(chunks.map((c) => c.content));
  const totalTokens = chunks.reduce((acc, c) => acc + c.tokenCount, 0);

  db.exec('BEGIN');
  try {
    db.prepare(
      `DELETE FROM KnowledgeChunks WHERE SourceId = ? AND ChatbotId = ? AND BusinessId = ?`
    ).run(params.sourceId, params.chatbotId, params.businessId);

    const insertChunk = db.prepare(
      `INSERT INTO KnowledgeChunks (SourceId, ChatbotId, BusinessId, ChunkIndex, Content, EmbeddingJson, TokenCount)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );

    for (let i = 0; i < chunks.length; i += 1) {
      const c = chunks[i];
      const vec = vectors[i];
      insertChunk.run(
        params.sourceId,
        params.chatbotId,
        params.businessId,
        c.chunkIndex,
        c.content,
        JSON.stringify(vec),
        c.tokenCount
      );
    }

    db.prepare(
      `UPDATE KnowledgeSources
       SET Status = 'Indexed',
           ErrorMessage = NULL,
           ChunkCount = ?,
           TotalTokens = ?,
           LastIndexedOn = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
           UpdatedOn = strftime('%Y-%m-%dT%H:%M:%fZ','now')
       WHERE SourceId = ? AND ChatbotId = ? AND BusinessId = ?`
    ).run(chunks.length, totalTokens, params.sourceId, params.chatbotId, params.businessId);

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  return { chunkCount: chunks.length, totalTokens };
}

export function getIndexedChunkCountForChatbot(chatbotId: number, businessId: number): number {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS cnt
       FROM KnowledgeChunks kc
       JOIN KnowledgeSources ks ON ks.SourceId = kc.SourceId
       WHERE kc.ChatbotId = ? AND kc.BusinessId = ? AND ks.BusinessId = ? AND ks.Status = 'Indexed'`
    )
    .get(chatbotId, businessId, businessId) as { cnt: number } | undefined;

  return row?.cnt ?? 0;
}

export async function retrieveRelevantChunks(params: {
  chatbotId: number;
  businessId: number;
  query: string;
  topK?: number;
  minScore?: number;
  maxContextTokens?: number;
}): Promise<RetrievedChunk[]> {
  const topK = Math.min(10, Math.max(1, params.topK ?? 5));
  const minScore = params.minScore ?? 0.28;
  const maxContextTokens = params.maxContextTokens ?? 3200;

  const rows = db
    .prepare(
      `SELECT
        kc.ChunkId AS chunkId,
        kc.SourceId AS sourceId,
        kc.ChunkIndex AS chunkIndex,
        kc.Content AS content,
        kc.EmbeddingJson AS embeddingJson,
        kc.TokenCount AS tokenCount,
        ks.Title AS sourceTitle,
        ks.SourceType AS sourceType,
        ks.SourceUri AS sourceUri
       FROM KnowledgeChunks kc
       JOIN KnowledgeSources ks ON ks.SourceId = kc.SourceId
       WHERE kc.ChatbotId = ?
         AND kc.BusinessId = ?
         AND ks.BusinessId = ?
         AND ks.Status = 'Indexed'
         AND kc.EmbeddingJson IS NOT NULL`
    )
    .all(params.chatbotId, params.businessId, params.businessId) as Array<{
    chunkId: number;
    sourceId: number;
    chunkIndex: number;
    content: string;
    embeddingJson: string;
    tokenCount: number;
    sourceTitle: string;
    sourceType: string;
    sourceUri: string | null;
  }>;

  if (!rows.length) {
    return [];
  }

  const [queryVector] = await generateGeminiEmbeddings([params.query]);

  const scored = rows
    .map((row) => {
      let vec: number[] = [];
      try {
        vec = JSON.parse(row.embeddingJson) as number[];
      } catch {
        return null;
      }
      const sim = cosineSimilarity(queryVector, vec);
      const score = Math.min(1, sim + computeKeywordBoost(params.query, row.content));
      return {
        chunkId: row.chunkId,
        sourceId: row.sourceId,
        sourceTitle: row.sourceTitle,
        sourceType: row.sourceType,
        sourceUri: row.sourceUri,
        chunkIndex: row.chunkIndex,
        content: row.content,
        score: Number(score.toFixed(4)),
        tokenCount: row.tokenCount,
      };
    })
    .filter((item): item is RetrievedChunk => item !== null && item.score >= minScore)
    .sort((a, b) => b.score - a.score);

  const selected: RetrievedChunk[] = [];
  let runningTokens = 0;

  for (const item of scored) {
    if (selected.length >= topK) break;
    if (selected.length > 0 && runningTokens + item.tokenCount > maxContextTokens) break;
    selected.push(item);
    runningTokens += item.tokenCount;
  }

  return selected;
}
