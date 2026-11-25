import crypto from 'node:crypto';
import { config } from '../config.ts';

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, originalHex] = parts;
  if (!salt || !originalHex) return false;

  const derivedBuffer = crypto.scryptSync(password, salt, 64);
  const originalBuffer = Buffer.from(originalHex, 'hex');
  if (derivedBuffer.length !== originalBuffer.length) return false;
  return crypto.timingSafeEqual(derivedBuffer, originalBuffer);
}

export function generateRefreshToken(): { rawToken: string; tokenHash: string } {
  const rawToken = crypto.randomBytes(48).toString('base64url');
  return { rawToken, tokenHash: hashToken(rawToken) };
}

export function hashToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

function base64UrlEncode(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

function base64UrlDecode(input: string): string {
  return Buffer.from(input, 'base64url').toString('utf8');
}

export interface JwtPayload {
  sub: number;
  email: string;
  role: string;
  businessId: number | null;
  jti: string;
  iss: string;
  aud: string;
  iat: number;
  exp: number;
}

export function signJwt(payload: Omit<JwtPayload, 'iss' | 'aud' | 'iat' | 'exp' | 'jti'>): string {
  const now = Math.floor(Date.now() / 1000);
  const fullPayload: JwtPayload = {
    ...payload,
    jti: crypto.randomUUID(),
    iss: config.jwtIssuer,
    aud: config.jwtAudience,
    iat: now,
    exp: now + config.accessTokenTtlSeconds,
  };

  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64UrlEncode(JSON.stringify(fullPayload));
  const signingInput = `${header}.${body}`;
  const sig = crypto
    .createHmac('sha256', config.jwtAccessSecret)
    .update(signingInput)
    .digest('base64url');

  return `${signingInput}.${sig}`;
}

export function verifyJwt(token: string): JwtPayload | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, sigB64] = parts;
  const signingInput = `${headerB64}.${payloadB64}`;

  const expectedSig = crypto
    .createHmac('sha256', config.jwtAccessSecret)
    .update(signingInput)
    .digest();
  const actualSig = Buffer.from(sigB64, 'base64url');

  if (expectedSig.length !== actualSig.length || !crypto.timingSafeEqual(expectedSig, actualSig)) {
    return null;
  }

  try {
    const parsed = JSON.parse(base64UrlDecode(payloadB64)) as JwtPayload;
    const now = Math.floor(Date.now() / 1000);
    if (parsed.iss !== config.jwtIssuer || parsed.aud !== config.jwtAudience) return null;
    if (typeof parsed.exp !== 'number' || parsed.exp <= now) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function slugifyBusinessName(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'workspace';
  const suffix = crypto.randomInt(1000, 9999);
  return `${base}-${suffix}`;
}
