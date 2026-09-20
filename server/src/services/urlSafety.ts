import dns from "node:dns/promises";
import net from "node:net";
import { env } from "../config/env.js";

export class UnsafeUrlError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "UnsafeUrlError";
  }
}

function ipv4ToLong(ip: string): number {
  return ip
    .split(".")
    .reduce((acc, octet) => (acc << 8) + Number(octet), 0) >>> 0;
}

function inRangeV4(ip: string, base: string, maskBits: number): boolean {
  const ipLong = ipv4ToLong(ip);
  const baseLong = ipv4ToLong(base);
  const mask = maskBits === 0 ? 0 : (~0 << (32 - maskBits)) >>> 0;
  return (ipLong & mask) === (baseLong & mask);
}

const PRIVATE_V4_RANGES: [string, number][] = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["224.0.0.0", 4],
];

export function isPrivateOrLoopbackIp(ip: string): boolean {
  if (net.isIP(ip) === 4) {
    return PRIVATE_V4_RANGES.some(([base, bits]) => inRangeV4(ip, base, bits));
  }
  if (net.isIP(ip) === 6) {
    const lower = ip.toLowerCase();
    if (lower === "::1") return true;
    if (lower.startsWith("fe80:")) return true; // link-local
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // unique local
    if (lower.startsWith("::ffff:")) {
      const v4 = lower.split(":").pop() ?? "";
      if (net.isIP(v4) === 4) return isPrivateOrLoopbackIp(v4);
    }
    return false;
  }
  return true; // unparsable, treat as unsafe
}

/**
 * Validates a URL's syntax and, unless private-network targets are allowed
 * (dev / batch-eval fixture servers), resolves its hostname and rejects
 * loopback / private / link-local addresses. Returns the parsed URL so
 * callers don't re-parse.
 */
export async function assertSafeUrl(rawUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new UnsafeUrlError("INVALID_URL", `"${rawUrl}" is not a valid URL`);
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UnsafeUrlError(
      "UNSUPPORTED_PROTOCOL",
      `Only http/https URLs are supported, got ${url.protocol}`
    );
  }

  if (env.allowPrivateNetworkTargets) {
    return url;
  }

  const hostname = url.hostname;
  if (net.isIP(hostname)) {
    if (isPrivateOrLoopbackIp(hostname)) {
      throw new UnsafeUrlError("PRIVATE_ADDRESS", `Refusing to fetch private address ${hostname}`);
    }
    return url;
  }

  if (hostname === "localhost" || hostname.endsWith(".localhost")) {
    throw new UnsafeUrlError("PRIVATE_ADDRESS", "Refusing to fetch localhost in production");
  }

  let addresses: string[];
  try {
    const records = await dns.lookup(hostname, { all: true });
    addresses = records.map((r) => r.address);
  } catch {
    throw new UnsafeUrlError("DNS_FAILURE", `Could not resolve hostname ${hostname}`);
  }

  if (addresses.length === 0 || addresses.some(isPrivateOrLoopbackIp)) {
    throw new UnsafeUrlError(
      "PRIVATE_ADDRESS",
      `Refusing to fetch ${hostname}: resolves to a private/loopback address`
    );
  }

  return url;
}
