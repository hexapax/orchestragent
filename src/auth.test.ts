import { describe, it, expect } from "vitest";
import { validateToken } from "./auth.js";

describe("validateToken", () => {
  it("accepts a valid token", () => {
    expect(validateToken("my-secret", "my-secret")).toBe(true);
  });

  it("rejects an invalid token", () => {
    expect(validateToken("my-secret", "wrong")).toBe(false);
  });

  it("rejects empty token", () => {
    expect(validateToken("my-secret", "")).toBe(false);
  });

  it("rejects when no expected token configured", () => {
    expect(validateToken(undefined, "anything")).toBe(false);
  });
});
