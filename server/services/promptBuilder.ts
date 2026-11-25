import type { RetrievedChunk } from './ragService.ts';

export interface PromptBotProfile {
  name: string;
  businessName: string;
  description: string | null;
  websiteUrl: string | null;
  responseLanguage: string;
  responseTone: string;
  personality: string | null;
  fallbackMessage: string | null;
  enableFollowUpQuestions: number | boolean;
  enableHumanHandover?: number | boolean;
  humanHandoverEmail?: string | null;
}

export function buildComposedInstruction(
  bot: PromptBotProfile,
  customInstructions: string,
  maxTokens: number,
  retrievedChunks: RetrievedChunk[]
): string {
  const lines: string[] = [
    `You are ${bot.name}, an AI assistant representing ${bot.businessName || 'the business'}.`,
  ];
  if (bot.description) lines.push(`Assistant purpose: ${bot.description}`);
  if (bot.websiteUrl) lines.push(`Official website: ${bot.websiteUrl}`);
  lines.push(
    `Respond in ${bot.responseLanguage || 'English'} with a ${bot.responseTone || 'Professional'} tone.`
  );
  if (bot.personality) lines.push(`Personality: ${bot.personality}.`);
  if (bot.fallbackMessage) {
    lines.push(
      `If you cannot answer reliably from verified context, respond politely using: "${bot.fallbackMessage}".`
    );
  }
  if (bot.enableHumanHandover && bot.humanHandoverEmail) {
    lines.push(
      `If the visitor asks to speak with a human or requires specialist help you cannot resolve, offer human support contact at ${bot.humanHandoverEmail}.`
    );
  }
  if (bot.enableFollowUpQuestions) {
    lines.push('When helpful, conclude with one brief, relevant follow-up question.');
  }
  lines.push(`Keep responses concise and well within ${maxTokens} tokens.`);
  if (customInstructions.trim()) {
    lines.push('Additional business instructions:');
    lines.push(customInstructions.trim());
  }

  if (retrievedChunks.length > 0) {
    lines.push('');
    lines.push('--- BUSINESS KNOWLEDGE BASE CONTEXT (GROUNDED SOURCES) ---');
    lines.push(
      'Use the following verified business knowledge snippets to answer the user accurately. Prioritize these facts over general assumptions. If the answer is not covered in the knowledge base or general business instructions, clearly state what is missing or use the fallback guidance instead of fabricating facts.'
    );
    retrievedChunks.forEach((chunk, index) => {
      const uriNote = chunk.sourceUri ? ` | ${chunk.sourceUri}` : '';
      lines.push(`[Source ${index + 1}: ${chunk.sourceTitle} (${chunk.sourceType}${uriNote})]`);
      lines.push(chunk.content);
      lines.push('');
    });
  }

  return lines.join('\n');
}

export function detectUnansweredReply(reply: string, fallbackMessage: string | null): boolean {
  const normalized = reply.trim().toLowerCase();
  if (!normalized) return true;
  if (fallbackMessage && fallbackMessage.trim().length > 12) {
    const fb = fallbackMessage.trim().toLowerCase();
    if (normalized.includes(fb.slice(0, Math.min(fb.length, 48)))) {
      return true;
    }
  }
  return (
    normalized.includes("i don't have enough information") ||
    normalized.includes('i do not have enough information') ||
    normalized.includes('not covered in the provided') ||
    normalized.includes('cannot answer that accurately')
  );
}
