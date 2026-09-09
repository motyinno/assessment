import { describe, expect, it } from "vitest";
import { decodeJwtPayload } from "@/lib/hrm/auth";

function base64url(input: string): string {
  return Buffer.from(input, "utf-8").toString("base64url");
}

function makeJwt(payload: unknown): string {
  const header = base64url(JSON.stringify({ alg: "none" }));
  const body = base64url(JSON.stringify(payload));
  return `${header}.${body}.`;
}

describe("decodeJwtPayload", () => {
  it("decodes a valid token", () => {
    const token = makeJwt({ exp: 1788845425, sub: "user-1" });
    expect(decodeJwtPayload(token)).toEqual({ exp: 1788845425, sub: "user-1" });
  });

  it("decodes base64url without padding", () => {
    // { "exp": 1788845425 } base64url-encoded, no '=' padding present.
    const token = "header.eyJleHAiOjE3ODg4NDU0MjV9.sig";
    expect(decodeJwtPayload(token)).toEqual({ exp: 1788845425 });
  });

  it("returns null on garbage", () => {
    expect(decodeJwtPayload("not-a-jwt")).toBeNull();
    expect(decodeJwtPayload("a.b")).toBeNull();
    expect(decodeJwtPayload("")).toBeNull();
  });

  it("returns null when the payload is an array", () => {
    const header = base64url(JSON.stringify({ alg: "none" }));
    const body = base64url(JSON.stringify([1, 2, 3]));
    expect(decodeJwtPayload(`${header}.${body}.`)).toBeNull();
  });

  it("decodes a payload without an exp claim", () => {
    const token = makeJwt({ sub: "user-1" });
    expect(decodeJwtPayload(token)).toEqual({ sub: "user-1" });
  });
});
