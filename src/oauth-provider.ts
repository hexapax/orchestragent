import { randomUUID } from "node:crypto";
import type { Response } from "express";
import type {
  OAuthClientInformationFull,
  OAuthTokens,
  OAuthTokenRevocationRequest,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import type {
  OAuthServerProvider,
  AuthorizationParams,
} from "@modelcontextprotocol/sdk/server/auth/provider.js";
import type { OAuthRegisteredClientsStore } from "@modelcontextprotocol/sdk/server/auth/clients.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";

interface CodeRecord {
  clientId: string;
  params: AuthorizationParams;
}

interface TokenRecord {
  token: string;
  clientId: string;
  scopes: string[];
  expiresAt: number; // epoch seconds
  resource?: URL;
  type: "access" | "refresh";
  counterpart?: string; // linked token (refresh if access, access if refresh)
}

export class InMemoryClientsStore implements OAuthRegisteredClientsStore {
  private clients = new Map<string, OAuthClientInformationFull>();

  async getClient(
    clientId: string
  ): Promise<OAuthClientInformationFull | undefined> {
    return this.clients.get(clientId);
  }

  async registerClient(
    client: Omit<OAuthClientInformationFull, "client_id" | "client_id_issued_at">
  ): Promise<OAuthClientInformationFull> {
    // SDK's registration handler adds client_id and client_id_issued_at before calling us
    const fullClient = client as OAuthClientInformationFull;
    this.clients.set(fullClient.client_id, fullClient);
    return fullClient;
  }
}

export class DevboxOAuthProvider implements OAuthServerProvider {
  readonly clientsStore: InMemoryClientsStore;
  private codes = new Map<string, CodeRecord>();
  private tokens = new Map<string, TokenRecord>();

  constructor() {
    this.clientsStore = new InMemoryClientsStore();
  }

  async authorize(
    client: OAuthClientInformationFull,
    params: AuthorizationParams,
    res: Response
  ): Promise<void> {
    // Auto-approve for single-user devbox (no consent screen)
    const code = randomUUID();
    this.codes.set(code, { clientId: client.client_id, params });

    const targetUrl = new URL(params.redirectUri);
    targetUrl.searchParams.set("code", code);
    if (params.state) {
      targetUrl.searchParams.set("state", params.state);
    }
    res.redirect(302, targetUrl.toString());
  }

  async challengeForAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string
  ): Promise<string> {
    const record = this.codes.get(authorizationCode);
    if (!record) throw new Error("Invalid authorization code");
    if (record.clientId !== client.client_id)
      throw new Error("Code not issued to this client");
    return record.params.codeChallenge;
  }

  async exchangeAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string
  ): Promise<OAuthTokens> {
    const record = this.codes.get(authorizationCode);
    if (!record) throw new Error("Invalid authorization code");
    if (record.clientId !== client.client_id)
      throw new Error("Code not issued to this client");

    this.codes.delete(authorizationCode);

    const accessToken = randomUUID();
    const refreshToken = randomUUID();
    const expiresIn = 3600; // 1 hour
    const scopes = record.params.scopes || [];
    const now = Math.floor(Date.now() / 1000);

    this.tokens.set(accessToken, {
      token: accessToken,
      clientId: client.client_id,
      scopes,
      expiresAt: now + expiresIn,
      resource: record.params.resource,
      type: "access",
      counterpart: refreshToken,
    });

    this.tokens.set(refreshToken, {
      token: refreshToken,
      clientId: client.client_id,
      scopes,
      expiresAt: now + 30 * 24 * 3600, // 30 days
      resource: record.params.resource,
      type: "refresh",
      counterpart: accessToken,
    });

    return {
      access_token: accessToken,
      token_type: "bearer",
      expires_in: expiresIn,
      refresh_token: refreshToken,
      scope: scopes.join(" "),
    };
  }

  async exchangeRefreshToken(
    client: OAuthClientInformationFull,
    refreshToken: string,
    scopes?: string[]
  ): Promise<OAuthTokens> {
    const record = this.tokens.get(refreshToken);
    if (!record || record.type !== "refresh")
      throw new Error("Invalid refresh token");
    if (record.clientId !== client.client_id)
      throw new Error("Refresh token not issued to this client");
    if (record.expiresAt < Math.floor(Date.now() / 1000))
      throw new Error("Refresh token expired");

    // Revoke old tokens (rotation)
    if (record.counterpart) this.tokens.delete(record.counterpart);
    this.tokens.delete(refreshToken);

    // Issue new pair
    const newAccessToken = randomUUID();
    const newRefreshToken = randomUUID();
    const expiresIn = 3600;
    const tokenScopes = scopes || record.scopes;
    const now = Math.floor(Date.now() / 1000);

    this.tokens.set(newAccessToken, {
      token: newAccessToken,
      clientId: client.client_id,
      scopes: tokenScopes,
      expiresAt: now + expiresIn,
      resource: record.resource,
      type: "access",
      counterpart: newRefreshToken,
    });

    this.tokens.set(newRefreshToken, {
      token: newRefreshToken,
      clientId: client.client_id,
      scopes: tokenScopes,
      expiresAt: now + 30 * 24 * 3600,
      resource: record.resource,
      type: "refresh",
      counterpart: newAccessToken,
    });

    return {
      access_token: newAccessToken,
      token_type: "bearer",
      expires_in: expiresIn,
      refresh_token: newRefreshToken,
      scope: tokenScopes.join(" "),
    };
  }

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const record = this.tokens.get(token);
    if (!record || record.type !== "access")
      throw new Error("Invalid access token");
    if (record.expiresAt < Math.floor(Date.now() / 1000))
      throw new Error("Access token expired");

    return {
      token,
      clientId: record.clientId,
      scopes: record.scopes,
      expiresAt: record.expiresAt,
      resource: record.resource,
    };
  }

  async revokeToken(
    client: OAuthClientInformationFull,
    request: OAuthTokenRevocationRequest
  ): Promise<void> {
    const record = this.tokens.get(request.token);
    if (!record || record.clientId !== client.client_id) return;

    this.tokens.delete(request.token);
    if (record.counterpart) this.tokens.delete(record.counterpart);
  }
}

export function createOAuthProvider(): DevboxOAuthProvider {
  return new DevboxOAuthProvider();
}
