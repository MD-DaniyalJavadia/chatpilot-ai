import { GoogleGenAI, ThinkingLevel } from '@google/genai';

export class GeminiServiceError extends Error {
  statusCode: number;
  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

export const SUPPORTED_GEMINI_MODELS = new Set([
  'gemini-4-hydrogen',
  'gemini-3.1-flash-lite',
  'gemini-4-neon',
  'gemini-4-carbon',
]);

export interface PlaygroundTurn {
  role: 'user' | 'model';
  content: string;
}

export interface GeminiReplyResult {
  reply: string;
  model: string;
  responseTimeMs: number;
  usage: {
    promptTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
}

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new GeminiServiceError(
      503,
      'Gemini API key is not configured on the server. Set GEMINI_API_KEY in Settings > Secrets to test live AI responses.'
    );
  }

  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export function isGeminiConfigured(): boolean {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  return Boolean(apiKey && apiKey !== 'MY_GEMINI_API_KEY');
}

export async function generateGeminiReply(params: {
  model: string;
  systemInstruction: string;
  history: PlaygroundTurn[];
  userMessage: string;
  temperature: number;
  maxOutputTokens: number;
}): Promise<GeminiReplyResult> {
  const model = params.model.trim();
  if (!SUPPORTED_GEMINI_MODELS.has(model)) {
    throw new GeminiServiceError(400, `Unsupported Gemini model "${model}".`);
  }

  const ai = getGeminiClient();

  const contents = [
    ...params.history.slice(-16).map((turn) => ({
      role: turn.role === 'model' ? 'model' : 'user',
      parts: [{ text: turn.content }],
    })),
    {
      role: 'user',
      parts: [{ text: params.userMessage }],
    },
  ];

  const isGemini4 = model.startsWith('gemini-4-');
  const config: Record<string, unknown> = {
    systemInstruction: params.systemInstruction,
  };

  if (isGemini4) {
    config.thinkingConfig = { thinkingLevel: ThinkingLevel.LOW };
  } else {
    config.temperature = params.temperature;
    config.maxOutputTokens = params.maxOutputTokens;
  }

  const startedAt = Date.now();
  const timeoutMs = 90000;

  try {
    const response = await Promise.race([
      ai.models.generateContent({
        model,
        contents,
        config,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new GeminiServiceError(504, 'Gemini API request timed out after 90 seconds.')), timeoutMs)
      ),
    ]);

    const responseTimeMs = Date.now() - startedAt;
    const reply = (response.text ?? '').trim();

    if (!reply) {
      throw new GeminiServiceError(502, 'Gemini returned an empty response. Try adjusting system instructions.');
    }

    const usageMeta = response.usageMetadata;
    const promptTokens = Number(usageMeta?.promptTokenCount ?? 0);
    const outputTokens = Number(usageMeta?.candidatesTokenCount ?? 0);
    const totalTokens = Number(usageMeta?.totalTokenCount ?? promptTokens + outputTokens);

    return {
      reply,
      model,
      responseTimeMs,
      usage: {
        promptTokens,
        outputTokens,
        totalTokens,
      },
    };
  } catch (err: unknown) {
    if (err instanceof GeminiServiceError) {
      throw err;
    }

    const status = Number((err as { status?: number })?.status || 0);
    const rawMsg = err instanceof Error ? err.message : 'Unknown Gemini API error';
    console.error('[GeminiService Error]', status || 'ERR', rawMsg.slice(0, 200));

    if (status === 429 || /RESOURCE_EXHAUSTED|quota|rate limit/i.test(rawMsg)) {
      throw new GeminiServiceError(
        429,
        'Gemini API rate limit or quota reached. Wait a moment or check your billing tier in Settings > Secrets.'
      );
    }
    if (status === 401 || status === 403 || /API_KEY_INVALID|PERMISSION_DENIED/i.test(rawMsg)) {
      throw new GeminiServiceError(
        403,
        'Gemini API key was rejected or lacks permission for this model. Verify GEMINI_API_KEY in Settings > Secrets.'
      );
    }
    if (status === 404 || /NOT_FOUND/i.test(rawMsg)) {
      throw new GeminiServiceError(400, `Model "${model}" was not found or is unavailable for your key.`);
    }

    throw new GeminiServiceError(502, 'Unable to reach Gemini API right now. Please try again.');
  }
}

export const GEMINI_EMBEDDING_MODEL = 'gemini-embedding-2';

export async function generateGeminiEmbeddings(texts: string[]): Promise<number[][]> {
  if (!texts.length) return [];

  const ai = getGeminiClient();
  const batchSize = 20;
  const allVectors: number[][] = [];
  const timeoutMs = 30000;

  try {
    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const response = await Promise.race([
        ai.models.embedContent({
          model: GEMINI_EMBEDDING_MODEL,
          contents: batch,
        }),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new GeminiServiceError(504, 'Gemini embedding request timed out after 30 seconds.')),
            timeoutMs
          )
        ),
      ]);

      const embeddings = response.embeddings ?? [];
      if (embeddings.length !== batch.length) {
        throw new GeminiServiceError(502, 'Gemini embedding service returned an incomplete vector batch.');
      }

      for (const entry of embeddings) {
        const values = Array.isArray(entry.values) ? entry.values : [];
        if (!values.length) {
          throw new GeminiServiceError(502, 'Gemini embedding service returned an empty embedding vector.');
        }
        allVectors.push(values);
      }
    }

    return allVectors;
  } catch (err: unknown) {
    if (err instanceof GeminiServiceError) {
      throw err;
    }

    const status = Number((err as { status?: number })?.status || 0);
    const rawMsg = err instanceof Error ? err.message : 'Unknown Gemini embedding error';
    console.error('[GeminiEmbedding Error]', status || 'ERR', rawMsg.slice(0, 200));

    if (status === 429 || /RESOURCE_EXHAUSTED|quota|rate limit/i.test(rawMsg)) {
      throw new GeminiServiceError(
        429,
        'Gemini embedding quota or rate limit reached. Wait a moment or verify your API tier in Settings > Secrets.'
      );
    }
    if (status === 401 || status === 403 || /API_KEY_INVALID|PERMISSION_DENIED/i.test(rawMsg)) {
      throw new GeminiServiceError(
        403,
        'Gemini API key was rejected or lacks permission for embeddings. Verify GEMINI_API_KEY in Settings > Secrets.'
      );
    }
    if (status === 404 || /NOT_FOUND/i.test(rawMsg)) {
      throw new GeminiServiceError(400, `Embedding model "${GEMINI_EMBEDDING_MODEL}" is unavailable for your key.`);
    }

    throw new GeminiServiceError(502, 'Unable to generate knowledge embeddings right now. Please try again.');
  }
}

