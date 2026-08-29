import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { isPrivateIP, validateUrlForFetch, safeFetch, UnsafeUrlError } from "./safeFetch";

vi.mock("node:dns", () => {
  return {
    default: {
      promises: {
        lookup: vi.fn(),
      },
    },
  };
});

import dns from "node:dns";
const mockLookup = dns.promises.lookup as unknown as ReturnType<typeof vi.fn>;

describe("isPrivateIP", () => {
  it("flags private/reserved IPv4 ranges", () => {
    expect(isPrivateIP("127.0.0.1")).toBe(true);
    expect(isPrivateIP("10.1.2.3")).toBe(true);
    expect(isPrivateIP("192.168.1.1")).toBe(true);
    expect(isPrivateIP("172.16.5.5")).toBe(true);
    expect(isPrivateIP("172.31.255.255")).toBe(true);
    expect(isPrivateIP("169.254.1.1")).toBe(true);
    expect(isPrivateIP("0.0.0.0")).toBe(true);
    expect(isPrivateIP("100.64.0.1")).toBe(true);
  });

  it("does not flag a normal public IPv4", () => {
    expect(isPrivateIP("8.8.8.8")).toBe(false);
    expect(isPrivateIP("1.1.1.1")).toBe(false);
    // 172.15.x.x and 172.32.x.x are just outside the RFC1918 172.16/12 block
    expect(isPrivateIP("172.15.0.1")).toBe(false);
    expect(isPrivateIP("172.32.0.1")).toBe(false);
  });

  it("flags private/reserved IPv6 ranges", () => {
    expect(isPrivateIP("::1")).toBe(true);
    expect(isPrivateIP("::")).toBe(true);
    expect(isPrivateIP("fe80::1")).toBe(true);
    expect(isPrivateIP("fc00::1")).toBe(true);
    expect(isPrivateIP("fd12:3456:789a::1")).toBe(true);
    expect(isPrivateIP("ff02::1")).toBe(true);
  });

  it("flags IPv4-mapped IPv6 loopback (::ffff:127.0.0.1)", () => {
    expect(isPrivateIP("::ffff:127.0.0.1")).toBe(true);
  });

  it("does not flag a normal public IPv6", () => {
    expect(isPrivateIP("2001:4860:4860::8888")).toBe(false);
  });
});

describe("validateUrlForFetch", () => {
  beforeEach(() => {
    mockLookup.mockReset();
  });

  it("rejects non-http(s) protocols", async () => {
    await expect(validateUrlForFetch("file:///etc/passwd")).rejects.toThrow(UnsafeUrlError);
    await expect(validateUrlForFetch("ftp://example.com/x")).rejects.toThrow(UnsafeUrlError);
  });

  it("rejects localhost without needing DNS", async () => {
    await expect(validateUrlForFetch("http://localhost/")).rejects.toThrow(UnsafeUrlError);
    expect(mockLookup).not.toHaveBeenCalled();
  });

  it("rejects a literal private IPv4 host", async () => {
    await expect(validateUrlForFetch("http://127.0.0.1/")).rejects.toThrow(UnsafeUrlError);
    await expect(validateUrlForFetch("http://192.168.1.1/")).rejects.toThrow(UnsafeUrlError);
  });

  it("rejects a literal private IPv6 host", async () => {
    await expect(validateUrlForFetch("http://[::1]/")).rejects.toThrow(UnsafeUrlError);
  });

  it("rejects decimal/hex-encoded loopback IPv4 (WHATWG URL normalizes it)", async () => {
    // 2130706433 === 127.0.0.1 in decimal; the URL parser itself normalizes this.
    await expect(validateUrlForFetch("http://2130706433/")).rejects.toThrow(UnsafeUrlError);
  });

  it("rejects a public-looking hostname that resolves to a private IP via DNS", async () => {
    mockLookup.mockResolvedValue([{ address: "127.0.0.1", family: 4 }]);
    await expect(validateUrlForFetch("http://internal.example.com/")).rejects.toThrow(UnsafeUrlError);
  });

  it("accepts a hostname that resolves only to public IPs", async () => {
    mockLookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    const { resolvedIps } = await validateUrlForFetch("http://example.com/");
    expect(resolvedIps).toEqual(["93.184.216.34"]);
  });

  it("rejects if ANY resolved address is private, even if others are public", async () => {
    mockLookup.mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
      { address: "10.0.0.5", family: 4 },
    ]);
    await expect(validateUrlForFetch("http://mixed.example.com/")).rejects.toThrow(UnsafeUrlError);
  });
});

describe("safeFetch redirect handling", () => {
  beforeEach(() => {
    mockLookup.mockReset();
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not follow a redirect from a public URL to a private IP", async () => {
    mockLookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(
      new Response(null, { status: 302, headers: { location: "http://127.0.0.1/admin" } }),
    );

    await expect(safeFetch("http://public.example.com/")).rejects.toThrow(UnsafeUrlError);
  });

  it("follows a redirect chain between two validated public hosts", async () => {
    mockLookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce(
        new Response(null, { status: 302, headers: { location: "http://public.example.com/next" } }),
      )
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));

    const { response, finalUrl } = await safeFetch("http://public.example.com/");
    expect(response.status).toBe(200);
    expect(finalUrl).toBe("http://public.example.com/next");
  });

  it("gives up after too many redirects", async () => {
    mockLookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(
      new Response(null, { status: 302, headers: { location: "http://public.example.com/loop" } }),
    );

    await expect(safeFetch("http://public.example.com/", { maxRedirects: 2 })).rejects.toThrow(UnsafeUrlError);
  });
});
