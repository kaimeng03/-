import dns from "node:dns";
import net from "node:net";

const dnsLookup = dns.promises.lookup;

// ---------------------------------------------------------------------------
// IP range checks (SSRF defense). String-matching hostnames is not enough:
// a hostname that looks public can still resolve to a private/loopback IP, and
// the WHATWG URL parser itself normalizes decimal/octal/hex IPv4 literals
// (e.g. "http://2130706433/") into dotted-decimal form, so checking
// `url.hostname` after parsing already collapses that class of obfuscation —
// but only DNS resolution can catch "attacker-controlled-name.example.com"
// pointing at 127.0.0.1.
// ---------------------------------------------------------------------------

function ipv4ToInt(ip: string): number {
  const parts = ip.split(".").map(Number);
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

function inCidr(ip: string, base: string, bits: number): boolean {
  const ipInt = ipv4ToInt(ip);
  const baseInt = ipv4ToInt(base);
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (ipInt & mask) === (baseInt & mask);
}

const PRIVATE_IPV4_RANGES: [string, number][] = [
  ["0.0.0.0", 8], // "this" network
  ["10.0.0.0", 8], // RFC1918
  ["100.64.0.0", 10], // CGNAT
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local
  ["172.16.0.0", 12], // RFC1918
  ["192.0.0.0", 24], // IETF protocol assignments
  ["192.0.2.0", 24], // TEST-NET-1
  ["192.168.0.0", 16], // RFC1918
  ["198.18.0.0", 15], // benchmarking
  ["198.51.100.0", 24], // TEST-NET-2
  ["203.0.113.0", 24], // TEST-NET-3
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved
  ["255.255.255.255", 32], // broadcast
];

function isPrivateIPv4(ip: string): boolean {
  return PRIVATE_IPV4_RANGES.some(([base, bits]) => inCidr(ip, base, bits));
}

function expandIPv6(ip: string): bigint {
  // Handles "::" compression and IPv4-mapped forms like "::ffff:127.0.0.1".
  let addr = ip;
  const ipv4Match = /(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(addr);
  if (ipv4Match && addr.includes(":")) {
    const v4 = ipv4Match[1];
    const hex = v4
      .split(".")
      .map((n) => parseInt(n, 10).toString(16).padStart(2, "0"))
      .join("");
    addr = addr.slice(0, addr.length - v4.length) + hex.slice(0, 4) + ":" + hex.slice(4);
  }

  let head = addr;
  let tail = "";
  if (addr.includes("::")) {
    const [h, t] = addr.split("::");
    head = h;
    tail = t;
  }
  const headParts = head ? head.split(":").filter(Boolean) : [];
  const tailParts = tail ? tail.split(":").filter(Boolean) : [];
  const missing = 8 - headParts.length - tailParts.length;
  const allParts = [...headParts, ...Array(Math.max(missing, 0)).fill("0"), ...tailParts];

  let value = BigInt(0);
  for (const part of allParts) {
    value = (value << BigInt(16)) | BigInt(parseInt(part || "0", 16));
  }
  return value;
}

function isPrivateIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  if (normalized === "::1" || normalized === "::") return true;

  // IPv4-mapped (::ffff:a.b.c.d) — check the embedded IPv4 address too.
  const mapped = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(normalized);
  if (mapped) return isPrivateIPv4(mapped[1]);

  const value = expandIPv6(normalized);
  const inRange = (baseHex: string, prefixBits: number) => {
    const base = BigInt(`0x${baseHex}`);
    const shift = BigInt(128) - BigInt(prefixBits);
    return (value >> shift) === (base >> shift);
  };

  if (inRange("fc000000000000000000000000000000", 7)) return true; // unique local (fc00::/7)
  if (inRange("fe800000000000000000000000000000", 10)) return true; // link-local (fe80::/10)
  if (inRange("ff000000000000000000000000000000", 8)) return true; // multicast (ff00::/8)
  return false;
}

export function isPrivateIP(ip: string): boolean {
  const family = net.isIP(ip);
  if (family === 4) return isPrivateIPv4(ip);
  if (family === 6) return isPrivateIPv6(ip);
  return true; // not a valid IP at all — refuse rather than guess
}

// Fast, synchronous pre-check on the hostname alone. Used as a cheap first pass;
// NOT sufficient on its own since it can't see where a hostname's DNS resolves to.
export function isObviouslyPrivateHostname(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".localhost") || h === "") return true;
  if (net.isIP(h)) return isPrivateIP(h);
  return false;
}

export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeUrlError";
  }
}

export interface ValidatedUrl {
  url: URL;
  resolvedIps: string[];
}

/**
 * Parses and fully validates a URL for server-side fetching: protocol allowlist,
 * hostname pre-check, and — the part a hostname string alone can't cover — DNS
 * resolution of every A/AAAA record, all of which must be public IPs.
 */
export async function validateUrlForFetch(rawUrl: string): Promise<ValidatedUrl> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new UnsafeUrlError("網址格式不正確");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UnsafeUrlError("網址必須是 http:// 或 https://");
  }
  if (isObviouslyPrivateHostname(url.hostname)) {
    throw new UnsafeUrlError("不允許存取此網址");
  }

  const family = net.isIP(url.hostname);
  let resolvedIps: string[];
  if (family) {
    resolvedIps = [url.hostname];
  } else {
    try {
      const results = await dnsLookup(url.hostname, { all: true, verbatim: true });
      resolvedIps = results.map((r) => r.address);
    } catch {
      throw new UnsafeUrlError("無法解析此網址的網域名稱");
    }
  }

  if (resolvedIps.length === 0 || resolvedIps.some((ip) => isPrivateIP(ip))) {
    throw new UnsafeUrlError("不允許存取此網址");
  }

  return { url, resolvedIps };
}

const DEFAULT_TIMEOUT_MS = 10000;
const DEFAULT_MAX_REDIRECTS = 5;
const DEFAULT_MAX_BYTES = 15 * 1024 * 1024; // 15MB

export interface SafeFetchOptions {
  method?: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
  maxRedirects?: number;
  /** Passed straight through to fetch()'s Next.js cache extension. Defaults to no-store. */
  cache?: RequestCache;
  next?: { revalidate?: number | false; tags?: string[] };
}

export interface SafeFetchResult {
  response: Response;
  finalUrl: string;
}

/**
 * A fetch() wrapper that re-validates SSRF safety on every hop: `redirect` is
 * always "manual" here, and each Location header is resolved and re-checked
 * against validateUrlForFetch() before being followed — a naive `redirect:
 * "follow"` would let a URL that passes validation redirect straight to an
 * internal address after the check already ran.
 */
export async function safeFetch(inputUrl: string, options: SafeFetchOptions = {}): Promise<SafeFetchResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  let currentUrl = inputUrl;

  for (let hop = 0; hop <= maxRedirects; hop++) {
    const { url: validated } = await validateUrlForFetch(currentUrl);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetch(validated.toString(), {
        method: options.method ?? "GET",
        headers: options.headers,
        redirect: "manual",
        signal: controller.signal,
        // cache and next.revalidate are mutually exclusive in Next's fetch patch —
        // default to no-store (always fresh) unless the caller opted into caching.
        ...(options.next ? { next: options.next } : { cache: options.cache ?? "no-store" }),
      });
    } finally {
      clearTimeout(timer);
    }

    const isRedirect = res.status >= 300 && res.status < 400;
    const location = res.headers.get("location");
    if (isRedirect && location) {
      if (hop === maxRedirects) throw new UnsafeUrlError("重新導向次數過多");
      currentUrl = new URL(location, validated).toString();
      continue;
    }

    return { response: res, finalUrl: validated.toString() };
  }
  throw new UnsafeUrlError("重新導向次數過多");
}

/** Reads a Response body while enforcing a hard byte cap, without trusting Content-Length alone. */
export async function readBodyWithLimit(res: Response, maxBytes = DEFAULT_MAX_BYTES): Promise<ArrayBuffer> {
  const contentLength = res.headers.get("content-length");
  if (contentLength && Number(contentLength) > maxBytes) {
    throw new UnsafeUrlError("回應內容過大");
  }

  const reader = res.body?.getReader();
  if (!reader) {
    const buf = await res.arrayBuffer();
    if (buf.byteLength > maxBytes) throw new UnsafeUrlError("回應內容過大");
    return buf;
  }

  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new UnsafeUrlError("回應內容過大");
    }
    chunks.push(value);
  }
  const result = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    result.set(c, offset);
    offset += c.byteLength;
  }
  return result.buffer;
}

/** Wraps a body stream so it errors out once more than maxBytes have passed through —
 *  for passthrough proxies (e.g. images) that stream rather than buffer the response. */
export function capStream(body: ReadableStream<Uint8Array>, maxBytes: number): ReadableStream<Uint8Array> {
  const reader = body.getReader();
  let total = 0;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        controller.close();
        return;
      }
      total += value.byteLength;
      if (total > maxBytes) {
        controller.error(new UnsafeUrlError("回應內容過大"));
        await reader.cancel().catch(() => {});
        return;
      }
      controller.enqueue(value);
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });
}

/** Convenience: safeFetch + size-capped UTF-8 text read in one call. */
export async function safeFetchText(
  inputUrl: string,
  options: SafeFetchOptions & { maxBytes?: number } = {},
): Promise<{ text: string; response: Response; finalUrl: string }> {
  const { response, finalUrl } = await safeFetch(inputUrl, options);
  const buf = await readBodyWithLimit(response, options.maxBytes);
  return { text: new TextDecoder("utf-8").decode(buf), response, finalUrl };
}

// Kept for the handful of call sites that only need a quick synchronous protocol
// + hostname sanity check (no network access), e.g. rejecting input before doing
// any I/O. Anything that actually performs a fetch should go through safeFetch()
// / validateUrlForFetch() above so the DNS-level check also applies.
export function assertPublicHttpUrl(rawUrl: string): URL {
  const parsed = new URL(rawUrl);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Unsupported protocol");
  }
  if (isObviouslyPrivateHostname(parsed.hostname)) {
    throw new Error("Blocked host");
  }
  return parsed;
}
