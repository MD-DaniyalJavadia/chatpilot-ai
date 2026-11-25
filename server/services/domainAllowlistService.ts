import { db } from '../db.ts';

const DOMAIN_PATTERN_REGEX =
  /^(\*\.)?([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*|localhost)(:[0-9]{1,5})?$/;

export function normalizeDomainPattern(rawInput: string): string | null {
  const trimmed = rawInput.trim().toLowerCase();
  if (!trimmed || trimmed.length > 255) return null;
  if (/[\s?#\\]/.test(trimmed)) return null;

  let candidate = trimmed;

  if (candidate.includes('://')) {
    if (!/^https?:\/\//i.test(candidate)) {
      return null;
    }
    try {
      const parsed = new URL(candidate);
      if (parsed.username || parsed.password) return null;
      candidate = parsed.host.toLowerCase();
    } catch {
      return null;
    }
  } else {
    // Strip any trailing path if pasted like "example.com/about"
    candidate = candidate.split('/')[0];
  }

  if (!candidate || candidate === '*' || candidate.startsWith('*.localhost')) {
    return null;
  }

  // Reject wildcard on single-label domains (e.g. "*.com")
  if (candidate.startsWith('*.')) {
    const withoutWildcard = candidate.slice(2).split(':')[0];
    if (!withoutWildcard.includes('.')) {
      return null;
    }
  }

  if (!DOMAIN_PATTERN_REGEX.test(candidate)) {
    return null;
  }

  // Validate optional port range (1..65535)
  const portMatch = candidate.match(/:([0-9]+)$/);
  if (portMatch) {
    const port = Number(portMatch[1]);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      return null;
    }
  }

  return candidate;
}

export interface ParsedOriginInfo {
  rawOrigin: string;
  hostWithPort: string;
  hostname: string;
}

export function parseOriginHeader(headerValue: string | undefined): ParsedOriginInfo | null {
  if (!headerValue || typeof headerValue !== 'string') return null;
  const trimmed = headerValue.trim();
  if (!trimmed || trimmed === 'null') return null;

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    return {
      rawOrigin: parsed.origin,
      hostWithPort: parsed.host.toLowerCase(),
      hostname: parsed.hostname.toLowerCase(),
    };
  } catch {
    return null;
  }
}

export function extractRequestHost(hostHeader: string | string[] | undefined): string {
  const raw = Array.isArray(hostHeader) ? hostHeader[0] : hostHeader;
  if (!raw) return '';
  return raw.split(',')[0].trim().toLowerCase();
}

export function matchesAllowedDomain(origin: ParsedOriginInfo, allowedPattern: string): boolean {
  const pattern = allowedPattern.trim().toLowerCase();
  if (!pattern) return false;

  if (pattern.startsWith('*.')) {
    const baseAndPort = pattern.slice(2);
    const [baseHost, basePort] = baseAndPort.split(':');
    if (basePort) {
      const originPort = origin.hostWithPort.includes(':') ? origin.hostWithPort.split(':')[1] : '';
      if (originPort !== basePort) return false;
    }
    return origin.hostname === baseHost || origin.hostname.endsWith(`.${baseHost}`);
  }

  if (pattern.includes(':')) {
    return origin.hostWithPort === pattern;
  }

  return origin.hostname === pattern || origin.hostWithPort === pattern;
}

export interface OriginCheckResult {
  allowed: boolean;
  corsOrigin: string | null;
  visitorDomain: string | null;
  reason?: string;
}

export function evaluateWidgetOrigin(params: {
  chatbotId: number;
  originHeader?: string;
  refererHeader?: string;
  requestHostHeader?: string | string[];
}): OriginCheckResult {
  const originInfo =
    parseOriginHeader(params.originHeader) ?? parseOriginHeader(params.refererHeader);
  const requestHost = extractRequestHost(params.requestHostHeader);
  const requestHostname = requestHost.split(':')[0];

  const rows = db
    .prepare(`SELECT Domain AS domain FROM AllowedDomains WHERE ChatbotId = ?`)
    .all(params.chatbotId) as Array<{ domain: string }>;

  // Direct calls without Origin or Referer are permitted only before domain allowlisting is configured
  if (!originInfo) {
    if (rows.length > 0) {
      return {
        allowed: false,
        corsOrigin: null,
        visitorDomain: requestHostname || 'direct',
        reason: 'Origin or Referer header is required when domain allowlisting is enabled.',
      };
    }
    return {
      allowed: true,
      corsOrigin: null,
      visitorDomain: requestHostname || 'direct',
    };
  }

  // Always allow same-origin host so the ChatPilot portal preview & test page work seamlessly
  if (
    requestHost &&
    (originInfo.hostWithPort === requestHost ||
      (requestHostname && originInfo.hostname === requestHostname))
  ) {
    return {
      allowed: true,
      corsOrigin: params.originHeader ? originInfo.rawOrigin : null,
      visitorDomain: originInfo.hostWithPort,
    };
  }

  const matched = rows.some((row) => matchesAllowedDomain(originInfo, row.domain));
  if (!matched) {
    return {
      allowed: false,
      corsOrigin: null,
      visitorDomain: originInfo.hostWithPort,
      reason: `Origin "${originInfo.hostWithPort}" is not authorized for this chatbot. Add it to Allowed Domains in Widget Integration.`,
    };
  }

  return {
    allowed: true,
    corsOrigin: params.originHeader ? originInfo.rawOrigin : null,
    visitorDomain: originInfo.hostWithPort,
  };
}
