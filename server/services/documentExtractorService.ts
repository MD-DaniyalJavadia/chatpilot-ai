import path from 'node:path';
import mammoth from 'mammoth';
import { extractText } from 'unpdf';

export type DocumentSourceType = 'PDF' | 'DOCX' | 'TXT';

export class DocumentExtractionError extends Error {
  statusCode: number;
  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

export const MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

const ALLOWED_EXTENSIONS = new Map<string, DocumentSourceType>([
  ['.pdf', 'PDF'],
  ['.docx', 'DOCX'],
  ['.txt', 'TXT'],
  ['.md', 'TXT'],
]);

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/markdown',
  'application/octet-stream', // some browsers send octet-stream for .md or .docx
]);

export function normalizeExtractedText(raw: string): string {
  return raw
    .replace(/\u0000/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[\t\f\v]+/g, ' ')
    .replace(/[ ]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .trim();
}

function validateFileSignature(ext: string, buffer: Buffer): void {
  if (buffer.length === 0) {
    throw new DocumentExtractionError(400, 'Uploaded file is empty.');
  }

  if (ext === '.pdf') {
    const header = buffer.subarray(0, 5).toString('ascii');
    if (header !== '%PDF-') {
      throw new DocumentExtractionError(400, 'Invalid PDF file signature. Please upload a valid PDF document.');
    }
    return;
  }

  if (ext === '.docx') {
    const isZip =
      buffer.length >= 4 &&
      buffer[0] === 0x50 &&
      buffer[1] === 0x4b &&
      (buffer[2] === 0x03 || buffer[2] === 0x05 || buffer[2] === 0x07);
    if (!isZip) {
      throw new DocumentExtractionError(400, 'Invalid DOCX file signature. Please upload a valid Word (.docx) file.');
    }
    return;
  }

  // Plain text / Markdown check: reject binary files containing null bytes
  const sample = buffer.subarray(0, Math.min(buffer.length, 4096));
  if (sample.includes(0x00)) {
    throw new DocumentExtractionError(400, 'Text file appears to contain binary content.');
  }
}

export async function extractDocumentContent(params: {
  originalName: string;
  mimeType: string;
  buffer: Buffer;
}): Promise<{ sourceType: DocumentSourceType; safeFileName: string; text: string; pageCount?: number }> {
  const baseName = path.basename(params.originalName || 'document').replace(/[^\w.\- ]+/g, '_');
  const ext = path.extname(baseName).toLowerCase();
  const sourceType = ALLOWED_EXTENSIONS.get(ext);

  if (!sourceType) {
    throw new DocumentExtractionError(400, 'Unsupported file type. Allowed formats: PDF, DOCX, TXT, MD.');
  }

  if (params.mimeType && !ALLOWED_MIME_TYPES.has(params.mimeType.toLowerCase())) {
    throw new DocumentExtractionError(400, `Unsupported MIME type "${params.mimeType}".`);
  }

  if (params.buffer.length > MAX_UPLOAD_SIZE_BYTES) {
    throw new DocumentExtractionError(400, 'File exceeds the 10 MB maximum upload size.');
  }

  validateFileSignature(ext, params.buffer);

  try {
    if (sourceType === 'PDF') {
      const result = await extractText(new Uint8Array(params.buffer), { mergePages: true });
      const normalized = normalizeExtractedText(typeof result.text === 'string' ? result.text : '');
      if (normalized.length < 10) {
        throw new DocumentExtractionError(
          400,
          'No readable text could be extracted from this PDF. Scanned image-only PDFs are not supported without OCR.'
        );
      }
      return {
        sourceType,
        safeFileName: baseName,
        text: normalized,
        pageCount: result.totalPages,
      };
    }

    if (sourceType === 'DOCX') {
      const result = await mammoth.extractRawText({ buffer: params.buffer });
      const normalized = normalizeExtractedText(result.value || '');
      if (normalized.length < 10) {
        throw new DocumentExtractionError(400, 'No readable text found inside the DOCX document.');
      }
      return {
        sourceType,
        safeFileName: baseName,
        text: normalized,
      };
    }

    const decoded = params.buffer.toString('utf8');
    const normalized = normalizeExtractedText(decoded);
    if (normalized.length < 10) {
      throw new DocumentExtractionError(400, 'Uploaded text file must contain at least 10 characters of content.');
    }
    return {
      sourceType: 'TXT',
      safeFileName: baseName,
      text: normalized,
    };
  } catch (err: unknown) {
    if (err instanceof DocumentExtractionError) {
      throw err;
    }
    console.error('[DocumentExtractor Error]', err instanceof Error ? err.message : err);
    throw new DocumentExtractionError(
      400,
      'Failed to parse document content. Ensure the file is not corrupted or password-protected.'
    );
  }
}
