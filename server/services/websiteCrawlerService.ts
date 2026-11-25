import dns from 'node:dns/promises';
import net from 'node:net';
import * as cheerio from 'cheerio';
import { normalizeExtractedText } from './documentExtractorService.ts';

export class WebsiteCrawlerError extends Error {
  statusCode: number;
  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

const MAX_RESPONSE_BYTES = 2 * 1024 * 1024; // 2 MB per page
const REQUEST_TIMEOUT_MS = 15000;
const MAX_REDIRECTS = 3;

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
  'metadata.google.internal',
  '169.254.169.254',
]);

function isPrivateOrReservedIpv4(ip: string): boolean {
  const parts = ip.split('.').map((n) => Number(n));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return true;
  }
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true; // link-local & cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a === 192 && b === 0) return true;
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a >= 224) return true; // multicast & reserved
  return false;
}

function isPrivateOrReservedIp(ip: string): boolean {
  const normalized = ip.toLowerCase();
  const version = net.isIP(normalized);
  if (version === 4) {
    return isPrivateOrReservedIpv4(normalized);
  }
  if (version === 6) {
    if (normalized === '::' || normalized === '::1') return true;
    if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true; // ULA fc00::/7
    if (normalized.startsWith('fe80:')) return true; // link-local
    if (normalized.startsWith('ff')) return true; // multicast
    if (normalized.startsWith('::ffff:')) {
      const mapped = normalized.slice(7);
      if (net.isIPv4(mapped)) {
        return isPrivateOrReservedIpv4(mapped);
      }
    }
    return false;
  }
  return true;
}

export async function assertSafePublicUrl(rawUrl: string): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    throw new WebsiteCrawlerError(400, 'Please enter a valid http:// or https:// website URL.');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new WebsiteCrawlerError(400, 'Only http:// and https:// URLs are permitted.');
  }

  if (parsed.username || parsed.password) {
    throw new WebsiteCrawlerError(400, 'URLs containing embedded credentials are not permitted.');
  }

  if (parsed.port && parsed.port !== '80' && parsed.port !== '443') {
    throw new WebsiteCrawlerError(400, 'Only standard HTTP/HTTPS ports (80/443) are permitted.');
  }

  const hostname = parsed.hostname.toLowerCase();
  if (
    !hostname ||
    BLOCKED_HOSTNAMES.has(hostname) ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    hostname.endsWith('.localdomain')
  ) {
    throw new WebsiteCrawlerError(400, 'Internal, loopback, or local network addresses are not permitted.');
  }

  if (net.isIP(hostname) !== 0) {
    if (isPrivateOrReservedIp(hostname)) {
      throw new WebsiteCrawlerError(400, 'Private or reserved IP addresses are not permitted.');
    }
    return parsed;
  }

  let resolved: Array<{ address: string }>;
  try {
    resolved = await dns.lookup(hostname, { all: true });
  } catch {
    throw new WebsiteCrawlerError(400, `Could not resolve hostname "${hostname}". Verify the URL is publicly reachable.`);
  }

  if (!resolved.length) {
    throw new WebsiteCrawlerError(400, `Hostname "${hostname}" did not resolve to any IP address.`);
  }

  for (const entry of resolved) {
    if (isPrivateOrReservedIp(entry.address)) {
      throw new WebsiteCrawlerError(400, 'Target URL resolves to a restricted private or internal network address.');
    }
  }

  return parsed;
}

async function fetchSafePage(startUrl: string): Promise<{ finalUrl: string; contentType: string; body: string }> {
  let currentUrl = await assertSafePublicUrl(startUrl);

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(currentUrl.toString(), {
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'User-Agent': 'ChatPilot-KnowledgeCrawler/1.0 (+https://chatpilot.ai)',
          Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9',
        },
      });

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location || hop === MAX_REDIRECTS) {
          throw new WebsiteCrawlerError(400, 'Website exceeded maximum safe redirect depth.');
        }
        const resolvedRedirect = new URL(location, currentUrl).toString();
        currentUrl = await assertSafePublicUrl(resolvedRedirect);
        continue;
      }

      if (!response.ok) {
        throw new WebsiteCrawlerError(400, `Website returned HTTP ${response.status}. Ensure the page is publicly accessible.`);
      }

      const contentType = (response.headers.get('content-type') || '').toLowerCase();
      if (
        contentType &&
        !contentType.includes('text/html') &&
        !contentType.includes('application/xhtml+xml') &&
        !contentType.includes('text/plain')
      ) {
        throw new WebsiteCrawlerError(400, `Unsupported content type "${contentType}". Expected an HTML or plain text page.`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new WebsiteCrawlerError(400, 'Empty response stream received from target website.');
      }

      const chunks: Uint8Array[] = [];
      let totalBytes = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          totalBytes += value.byteLength;
          if (totalBytes > MAX_RESPONSE_BYTES) {
            await reader.cancel();
            break;
          }
          chunks.push(value);
        }
      }

      const merged = Buffer.concat(chunks.map((c) => Buffer.from(c)));
      return {
        finalUrl: currentUrl.toString(),
        contentType,
        body: merged.toString('utf8'),
      };
    } catch (err: unknown) {
      if (err instanceof WebsiteCrawlerError) {
        throw err;
      }
      if ((err as { name?: string })?.name === 'AbortError') {
        throw new WebsiteCrawlerError(504, `Timed out fetching ${currentUrl.hostname} after 15 seconds.`);
      }
      throw new WebsiteCrawlerError(400, `Unable to fetch ${currentUrl.hostname}. Check the URL and try again.`);
    } finally {
      clearTimeout(timer);
    }
  }

  throw new WebsiteCrawlerError(400, 'Unable to fetch target URL.');
}

function extractReadableHtmlContent(html: string, pageUrl: string): {
  title: string;
  text: string;
  sameOriginLinks: string[];
} {
  const $ = cheerio.load(html);
  const parsedPage = new URL(pageUrl);

  const sameOriginLinks: string[] = [];
  $('a[href]').each((_idx, el) => {
    const href = $(el).attr('href');
    if (!href) return;
    try {
      const target = new URL(href, parsedPage);
      if (
        (target.protocol === 'http:' || target.protocol === 'https:') &&
        target.origin === parsedPage.origin &&
        !target.hash &&
        !/\.(pdf|jpg|jpeg|png|gif|svg|webp|zip|mp4|mp3|css|js)$/i.test(target.pathname)
      ) {
        target.hash = '';
        sameOriginLinks.push(target.toString());
      }
    } catch {
      // Ignore malformed relative links
    }
  });

  const title =
    $('title').first().text().trim() ||
    $('meta[property="og:title"]').attr('content')?.trim() ||
    $('h1').first().text().trim() ||
    parsedPage.hostname;

  const metaDescription = $('meta[name="description"]').attr('content')?.trim() || '';

  // Remove non-content elements
  $('script, style, noscript, svg, iframe, canvas, template, nav, footer, aside').remove();

  const root = $('main').length > 0 ? $('main').first() : $('article').length > 0 ? $('article').first() : $('body');
  const blocks: string[] = [];

  if (title) blocks.push(title);
  if (metaDescription) blocks.push(metaDescription);

  root.find('h1, h2, h3, h4, p, li, td, th, blockquote, pre').each((_idx, el) => {
    const chunkText = $(el).text().replace(/\s+/g, ' ').trim();
    if (chunkText.length >= 12) {
      blocks.push(chunkText);
    }
  });

  // Fallback if page lacks semantic tags
  if (blocks.length <= 2) {
    const rawBody = root.text();
    if (rawBody) blocks.push(rawBody);
  }

  const dedupedBlocks = Array.from(new Set(blocks));
  const text = normalizeExtractedText(dedupedBlocks.join('\n\n'));

  return {
    title: title.slice(0, 200),
    text,
    sameOriginLinks: Array.from(new Set(sameOriginLinks)),
  };
}

export async function crawlWebsiteContent(params: {
  url: string;
  crawlMode: 'single' | 'crawl';
  maxPages: number;
}): Promise<{ title: string; finalUrl: string; pagesCrawled: number; text: string }> {
  const maxPages = Math.min(10, Math.max(1, params.crawlMode === 'crawl' ? params.maxPages : 1));
  const visited = new Set<string>();
  const queue: string[] = [params.url.trim()];
  const pageSections: string[] = [];

  let primaryTitle = '';
  let primaryFinalUrl = params.url.trim();

  while (queue.length > 0 && visited.size < maxPages) {
    const nextUrl = queue.shift()!;
    const canonical = nextUrl.replace(/\/$/, '');
    if (visited.has(canonical)) continue;
    visited.add(canonical);

    try {
      const fetched = await fetchSafePage(nextUrl);
      if (visited.size === 1) {
        primaryFinalUrl = fetched.finalUrl;
      }

      if (fetched.contentType.includes('text/plain')) {
        const cleanText = normalizeExtractedText(fetched.body);
        if (cleanText.length >= 20) {
          if (!primaryTitle) primaryTitle = new URL(fetched.finalUrl).hostname;
          pageSections.push(`Page: ${fetched.finalUrl}\n${cleanText}`);
        }
        continue;
      }

      const extracted = extractReadableHtmlContent(fetched.body, fetched.finalUrl);
      if (!primaryTitle && extracted.title) {
        primaryTitle = extracted.title;
      }
      if (extracted.text.length >= 20) {
        pageSections.push(`Page: ${fetched.finalUrl} (${extracted.title})\n${extracted.text}`);
      }

      if (params.crawlMode === 'crawl') {
        for (const link of extracted.sameOriginLinks) {
          const canonLink = link.replace(/\/$/, '');
          if (!visited.has(canonLink) && queue.length + visited.size < maxPages * 3) {
            queue.push(link);
          }
        }
      }
    } catch (err) {
      // If the root URL fails, surface the exact SSRF/HTTP error
      if (visited.size === 1) {
        throw err;
      }
      // Secondary crawl link errors are skipped gracefully
    }
  }

  const combinedText = normalizeExtractedText(pageSections.join('\n\n---\n\n'));
  if (combinedText.length < 20) {
    throw new WebsiteCrawlerError(
      400,
      'Could not extract meaningful text from this webpage. JavaScript-only SPAs or login-walled pages may block static crawling.'
    );
  }

  return {
    title: primaryTitle || new URL(primaryFinalUrl).hostname,
    finalUrl: primaryFinalUrl,
    pagesCrawled: pageSections.length,
    text: combinedText,
  };
}
