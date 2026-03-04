import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Response } from "express";
import type { OAuthClientInformationFull } from "@modelcontextprotocol/sdk/shared/auth.js";
import type { AuthorizationParams } from "@modelcontextprotocol/sdk/server/auth/provider.js";
import {
  DevboxOAuthProvider,
  InMemoryClientsStore,
} from "./oauth-provider.js";

const mockClient: OAuthClientInformationFull = {
  client_id: "test-client",
  client_id_issued_at: Date.now(),
  redirect_uris: ["https://example.com/callback"],
  grant_types: ["authorization_code", "refresh_token"],
  response_types: ["code"],
  token_endpoint_auth_method: "none",
};

const mockParams: AuthorizationParams = {
  state: "test-state",
  scopes: ["mcp:tools"],
  codeChallenge: "test-challenge-abc123",
  redirectUri: "https://example.com/callback",
};

function mockResponse(): Response & { redirect: ReturnType<typeof vi.fn> } {
  return { redirect: vi.fn() } as unknown as Response & {
    redirect: ReturnType<typeof vi.fn>;
  };
}

describe("InMemoryClientsStore", () => {
  let store: InMemoryClientsStore;

  beforeEach(() => {
    store = new InMemoryClientsStore();
  });

  it("returns undefined for unknown client", async () => {
    expect(await store.getClient("unknown")).toBeUndefined();
  });

  it("registers and retrieves a client", async () => {
    await store.registerClient!(mockClient);
    const result = await store.getClient("test-client");
    expect(result?.client_id).toBe("test-client");
  });
});

describe("DevboxOAuthProvider", () => {
  let provider: DevboxOAuthProvider;

  beforeEach(() => {
    provider = new DevboxOAuthProvider();
  });

  async function doAuthorize(
    params = mockParams
  ): Promise<{ code: string; res: ReturnType<typeof mockResponse> }> {
    const res = mockResponse();
    await provider.authorize(mockClient, params, res);
    const redirectUrl = new URL(res.redirect.mock.calls[0][1]);
    return { code: redirectUrl.searchParams.get("code")!, res };
  }

  async function doFullExchange() {
    const { code } = await doAuthorize();
    // Call challengeForAuthorizationCode first (as the SDK does)
    await provider.challengeForAuthorizationCode(mockClient, code);
    return provider.exchangeAuthorizationCode(mockClient, code);
  }

  describe("authorize", () => {
    it("redirects with code and state", async () => {
      const { res } = await doAuthorize();
      expect(res.redirect).toHaveBeenCalledOnce();
      const [status, url] = res.redirect.mock.calls[0];
      expect(status).toBe(302);
      const redirectUrl = new URL(url);
      expect(redirectUrl.searchParams.get("code")).toBeTruthy();
      expect(redirectUrl.searchParams.get("state")).toBe("test-state");
      expect(redirectUrl.origin + redirectUrl.pathname).toBe(
        "https://example.com/callback"
      );
    });

    it("omits state when not provided", async () => {
      const { res } = await doAuthorize({ ...mockParams, state: undefined });
      const redirectUrl = new URL(res.redirect.mock.calls[0][1]);
      expect(redirectUrl.searchParams.has("state")).toBe(false);
    });
  });

  describe("challengeForAuthorizationCode", () => {
    it("returns the stored code challenge", async () => {
      const { code } = await doAuthorize();
      const challenge = await provider.challengeForAuthorizationCode(
        mockClient,
        code
      );
      expect(challenge).toBe("test-challenge-abc123");
    });

    it("throws for invalid code", async () => {
      await expect(
        provider.challengeForAuthorizationCode(mockClient, "bad-code")
      ).rejects.toThrow("Invalid authorization code");
    });

    it("throws when client_id does not match", async () => {
      const { code } = await doAuthorize();
      const otherClient = { ...mockClient, client_id: "other" };
      await expect(
        provider.challengeForAuthorizationCode(otherClient, code)
      ).rejects.toThrow("Code not issued to this client");
    });
  });

  describe("exchangeAuthorizationCode", () => {
    it("returns access and refresh tokens", async () => {
      const tokens = await doFullExchange();
      expect(tokens.access_token).toBeTruthy();
      expect(tokens.refresh_token).toBeTruthy();
      expect(tokens.token_type).toBe("bearer");
      expect(tokens.expires_in).toBe(3600);
    });

    it("deletes the code after use", async () => {
      const { code } = await doAuthorize();
      await provider.challengeForAuthorizationCode(mockClient, code);
      await provider.exchangeAuthorizationCode(mockClient, code);
      await expect(
        provider.exchangeAuthorizationCode(mockClient, code)
      ).rejects.toThrow("Invalid authorization code");
    });

    it("throws for invalid code", async () => {
      await expect(
        provider.exchangeAuthorizationCode(mockClient, "bad-code")
      ).rejects.toThrow("Invalid authorization code");
    });

    it("throws when client_id does not match", async () => {
      const { code } = await doAuthorize();
      await provider.challengeForAuthorizationCode(mockClient, code);
      const otherClient = { ...mockClient, client_id: "other" };
      await expect(
        provider.exchangeAuthorizationCode(otherClient, code)
      ).rejects.toThrow("Code not issued to this client");
    });
  });

  describe("verifyAccessToken", () => {
    it("returns auth info for valid token", async () => {
      const tokens = await doFullExchange();
      const info = await provider.verifyAccessToken(tokens.access_token);
      expect(info.clientId).toBe("test-client");
      expect(info.scopes).toEqual(["mcp:tools"]);
      expect(info.expiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000));
    });

    it("throws for unknown token", async () => {
      await expect(provider.verifyAccessToken("bad-token")).rejects.toThrow(
        "Invalid access token"
      );
    });

    it("rejects refresh tokens", async () => {
      const tokens = await doFullExchange();
      await expect(
        provider.verifyAccessToken(tokens.refresh_token!)
      ).rejects.toThrow("Invalid access token");
    });
  });

  describe("exchangeRefreshToken", () => {
    it("rotates tokens", async () => {
      const tokens = await doFullExchange();
      const newTokens = await provider.exchangeRefreshToken(
        mockClient,
        tokens.refresh_token!
      );
      expect(newTokens.access_token).not.toBe(tokens.access_token);
      expect(newTokens.refresh_token).not.toBe(tokens.refresh_token);
      // Old access token should be revoked
      await expect(
        provider.verifyAccessToken(tokens.access_token)
      ).rejects.toThrow();
      // New access token should work
      const info = await provider.verifyAccessToken(newTokens.access_token);
      expect(info.clientId).toBe("test-client");
    });

    it("throws for invalid refresh token", async () => {
      await expect(
        provider.exchangeRefreshToken(mockClient, "bad-token")
      ).rejects.toThrow("Invalid refresh token");
    });

    it("rejects access tokens used as refresh tokens", async () => {
      const tokens = await doFullExchange();
      await expect(
        provider.exchangeRefreshToken(mockClient, tokens.access_token)
      ).rejects.toThrow("Invalid refresh token");
    });
  });

  describe("revokeToken", () => {
    it("revokes access token and its linked refresh token", async () => {
      const tokens = await doFullExchange();
      await provider.revokeToken!(mockClient, { token: tokens.access_token });
      await expect(
        provider.verifyAccessToken(tokens.access_token)
      ).rejects.toThrow();
      await expect(
        provider.exchangeRefreshToken(mockClient, tokens.refresh_token!)
      ).rejects.toThrow();
    });

    it("does nothing for unknown token", async () => {
      // Should not throw
      await provider.revokeToken!(mockClient, { token: "unknown" });
    });

    it("does nothing when client_id does not match", async () => {
      const tokens = await doFullExchange();
      const otherClient = { ...mockClient, client_id: "other" };
      await provider.revokeToken!(otherClient, {
        token: tokens.access_token,
      });
      // Token should still be valid
      const info = await provider.verifyAccessToken(tokens.access_token);
      expect(info.clientId).toBe("test-client");
    });
  });
});
