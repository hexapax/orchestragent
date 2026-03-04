import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadConfig } from "./config.js";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("loadConfig", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `orchestragent-test-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("loads a valid YAML config file", () => {
    const configPath = join(tmpDir, "config.yaml");
    writeFileSync(configPath, `
workspacePaths:
  - /opt/repos
server:
  port: 4000
  host: 127.0.0.1
auth:
  token:
    enabled: true
`);
    const config = loadConfig(configPath);
    expect(config.workspacePaths).toEqual(["/opt/repos"]);
    expect(config.server.port).toBe(4000);
    expect(config.server.host).toBe("127.0.0.1");
    expect(config.auth.token.enabled).toBe(true);
  });

  it("applies defaults for missing fields", () => {
    const configPath = join(tmpDir, "config.yaml");
    writeFileSync(configPath, `
workspacePaths:
  - /tmp/repos
`);
    const config = loadConfig(configPath);
    expect(config.server.port).toBe(3100);
    expect(config.server.host).toBe("0.0.0.0");
    expect(config.auth.token.enabled).toBe(false);
    expect(config.auth.oauth.enabled).toBe(false);
  });

  it("throws on missing workspacePaths", () => {
    const configPath = join(tmpDir, "config.yaml");
    writeFileSync(configPath, `server:\n  port: 3100`);
    expect(() => loadConfig(configPath)).toThrow();
  });

  it("overrides with environment variables", () => {
    const configPath = join(tmpDir, "config.yaml");
    writeFileSync(configPath, `
workspacePaths:
  - /tmp/repos
`);
    process.env.ORCHESTRAGENT_PORT = "5000";
    process.env.ORCHESTRAGENT_HOST = "localhost";
    process.env.ORCHESTRAGENT_AUTH_TOKEN = "secret123";
    try {
      const config = loadConfig(configPath);
      expect(config.server.port).toBe(5000);
      expect(config.server.host).toBe("localhost");
      expect(config.auth.token.enabled).toBe(true);
      expect(config.auth.tokenValue).toBe("secret123");
    } finally {
      delete process.env.ORCHESTRAGENT_PORT;
      delete process.env.ORCHESTRAGENT_HOST;
      delete process.env.ORCHESTRAGENT_AUTH_TOKEN;
    }
  });
});
