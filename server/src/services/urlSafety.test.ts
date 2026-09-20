import { describe, expect, it } from "vitest";
import { isPrivateOrLoopbackIp } from "./urlSafety.js";

describe("isPrivateOrLoopbackIp", () => {
  it("flags loopback addresses", () => {
    expect(isPrivateOrLoopbackIp("127.0.0.1")).toBe(true);
    expect(isPrivateOrLoopbackIp("::1")).toBe(true);
  });

  it("flags private IPv4 ranges", () => {
    expect(isPrivateOrLoopbackIp("10.1.2.3")).toBe(true);
    expect(isPrivateOrLoopbackIp("172.16.5.5")).toBe(true);
    expect(isPrivateOrLoopbackIp("192.168.1.1")).toBe(true);
    expect(isPrivateOrLoopbackIp("169.254.1.1")).toBe(true);
  });

  it("allows public IPv4 addresses", () => {
    expect(isPrivateOrLoopbackIp("8.8.8.8")).toBe(false);
    expect(isPrivateOrLoopbackIp("1.1.1.1")).toBe(false);
  });

  it("flags IPv6 unique-local and link-local addresses", () => {
    expect(isPrivateOrLoopbackIp("fe80::1")).toBe(true);
    expect(isPrivateOrLoopbackIp("fd00::1")).toBe(true);
  });
});
