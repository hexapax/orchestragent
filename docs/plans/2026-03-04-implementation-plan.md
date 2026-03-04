# orchestragent Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a remote MCP server that lets claude.ai orchestrate Claude Code agents on a devbox via voice.

**Architecture:** TypeScript MCP server using `@modelcontextprotocol/sdk` v1.x with Streamable HTTP transport. Express handles HTTP + auth. Tools wrap git operations (`simple-git`) and Claude Code CLI spawning (`child_process.spawn`). Dual auth: OAuth 2.1 for claude.ai, pre-shared token for testing.

**Tech Stack:** TypeScript, `@modelcontextprotocol/sdk@^1.12.0`, `zod`, `simple-git`, `js-yaml`, `tsup`, Node.js 20+

---

## Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tsup.config.ts`
- Create: `src/index.ts` (entry point stub)
- Create: `.env.example`
- Create: `orchestragent.config.example.yaml`

**Step 1: Initialize package.json**

```bash
cd /home/jeremy/git-personal/orchestragent
npm init -y
```

Then edit `package.json`:

```json
{
  "name": "orchestragent",
  "version": "0.1.0",
  "description": "Remote MCP server for orchestrating Claude Code agents",
  "type": "module",
  "main": "dist/index.js",
  "bin": {
    "orchestragent": "dist/index.js"
  },
  "scripts": {
    "build": "tsup",
    "dev": "tsx src/index.ts",
    "start": "node dist/index.js",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "engines": {
    "node": ">=20.0.0"
  },
  "keywords": ["mcp", "claude", "agent", "orchestration", "devbox"],
  "license": "MIT"
}
```

**Step 2: Install dependencies**

```bash
npm install @modelcontextprotocol/sdk@^1.12.0 zod simple-git js-yaml express
npm install -D typescript tsx tsup vitest @types/node @types/js-yaml @types/express
```

**Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "strict": true,
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true,
    "sourceMap": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

**Step 4: Create tsup.config.ts**

```typescript
import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node20",
  outDir: "dist",
  clean: true,
  dts: true,
  sourcemap: true,
  banner: {
    js: "#!/usr/bin/env node",
  },
});
```

**Step 5: Create .env.example**

```bash
# Auth
ORCHESTRAGENT_AUTH_TOKEN=your-secret-token-here
ORCHESTRAGENT_OAUTH_ENABLED=false

# Server
ORCHESTRAGENT_PORT=3100
ORCHESTRAGENT_HOST=0.0.0.0

# Config file path (default: ./orchestragent.config.yaml)
ORCHESTRAGENT_CONFIG=./orchestragent.config.yaml
```

**Step 6: Create orchestragent.config.example.yaml**

```yaml
# orchestragent configuration
# Copy to orchestragent.config.yaml and edit.

workspacePaths:
  - /opt/repos              # scans children for git repos
  # - /home/user/project    # direct repo path

server:
  port: 3100
  host: 0.0.0.0

auth:
  oauth:
    enabled: false
    # issuer: https://your-tunnel-url.com
  token:
    enabled: true
    # actual token value in env: ORCHESTRAGENT_AUTH_TOKEN
```

**Step 7: Create src/index.ts stub**

```typescript
console.log("orchestragent starting...");
```

**Step 8: Verify build**

Run: `npx --prefix /home/jeremy/git-personal/orchestragent tsc --noEmit`
Expected: No errors

**Step 9: Commit**

```bash
git add package.json tsconfig.json tsup.config.ts src/index.ts .env.example orchestragent.config.example.yaml
git commit -m "feat: project scaffolding with TypeScript, MCP SDK, build config"
```

---

## Task 2: Configuration Loading

**Files:**
- Create: `src/config.ts`
- Create: `src/config.test.ts`

**Step 1: Write the failing test**

```typescript
// src/config.test.ts
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
```

**Step 2: Run test to verify it fails**

Run: `npx --prefix /home/jeremy/git-personal/orchestragent vitest run src/config.test.ts`
Expected: FAIL — cannot find module `./config.js`

**Step 3: Write minimal implementation**

```typescript
// src/config.ts
import { readFileSync } from "node:fs";
import { load as loadYaml } from "js-yaml";
import { z } from "zod";

const ConfigSchema = z.object({
  workspacePaths: z.array(z.string()).min(1, "At least one workspace path required"),
  server: z
    .object({
      port: z.number().default(3100),
      host: z.string().default("0.0.0.0"),
    })
    .default({}),
  auth: z
    .object({
      oauth: z
        .object({
          enabled: z.boolean().default(false),
          issuer: z.string().optional(),
        })
        .default({}),
      token: z
        .object({
          enabled: z.boolean().default(false),
        })
        .default({}),
    })
    .default({}),
});

export type Config = z.infer<typeof ConfigSchema> & {
  auth: { tokenValue?: string };
};

export function loadConfig(configPath: string): Config {
  const raw = readFileSync(configPath, "utf-8");
  const parsed = loadYaml(raw) as Record<string, unknown>;
  const config = ConfigSchema.parse(parsed);

  // Env overrides
  const port = process.env.ORCHESTRAGENT_PORT;
  if (port) config.server.port = parseInt(port, 10);

  const host = process.env.ORCHESTRAGENT_HOST;
  if (host) config.server.host = host;

  const token = process.env.ORCHESTRAGENT_AUTH_TOKEN;
  const result: Config = { ...config, auth: { ...config.auth, tokenValue: token } };

  if (token) {
    result.auth.token = { enabled: true };
  }

  return result;
}
```

**Step 4: Run test to verify it passes**

Run: `npx --prefix /home/jeremy/git-personal/orchestragent vitest run src/config.test.ts`
Expected: 4 tests PASS

**Step 5: Commit**

```bash
git add src/config.ts src/config.test.ts
git commit -m "feat: configuration loading with YAML, env overrides, and validation"
```

---

## Task 3: Workspace Discovery

**Files:**
- Create: `src/workspaces.ts`
- Create: `src/workspaces.test.ts`

**Step 1: Write the failing test**

```typescript
// src/workspaces.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { discoverWorkspaces } from "./workspaces.js";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";

describe("discoverWorkspaces", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `orchestragent-ws-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  function makeRepo(name: string): string {
    const repoPath = join(tmpDir, name);
    mkdirSync(repoPath, { recursive: true });
    execFileSync("git", ["init"], { cwd: repoPath, stdio: "ignore" });
    return repoPath;
  }

  it("discovers a direct repo path", async () => {
    const repo = makeRepo("my-project");
    const workspaces = await discoverWorkspaces([repo]);
    expect(workspaces).toHaveLength(1);
    expect(workspaces[0].id).toBe("my-project");
    expect(workspaces[0].path).toBe(repo);
  });

  it("discovers child repos in a parent directory", async () => {
    makeRepo("parent/repo-a");
    makeRepo("parent/repo-b");
    const parentPath = join(tmpDir, "parent");
    const workspaces = await discoverWorkspaces([parentPath]);
    expect(workspaces).toHaveLength(2);
    const ids = workspaces.map((w) => w.id).sort();
    expect(ids).toEqual(["repo-a", "repo-b"]);
  });

  it("skips non-git directories", async () => {
    makeRepo("parent/real-repo");
    mkdirSync(join(tmpDir, "parent", "not-a-repo"), { recursive: true });
    const parentPath = join(tmpDir, "parent");
    const workspaces = await discoverWorkspaces([parentPath]);
    expect(workspaces).toHaveLength(1);
    expect(workspaces[0].id).toBe("real-repo");
  });

  it("deduplicates repos found via multiple paths", async () => {
    const repo = makeRepo("solo");
    const workspaces = await discoverWorkspaces([repo, repo]);
    expect(workspaces).toHaveLength(1);
  });

  it("skips non-existent paths without throwing", async () => {
    const workspaces = await discoverWorkspaces(["/nonexistent/path"]);
    expect(workspaces).toHaveLength(0);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx --prefix /home/jeremy/git-personal/orchestragent vitest run src/workspaces.test.ts`
Expected: FAIL — cannot find module

**Step 3: Write minimal implementation**

```typescript
// src/workspaces.ts
import { existsSync, readdirSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import simpleGit, { type SimpleGit } from "simple-git";

export interface Workspace {
  id: string;
  path: string;
}

function isGitRepo(dirPath: string): boolean {
  return existsSync(join(dirPath, ".git"));
}

export async function discoverWorkspaces(
  workspacePaths: string[]
): Promise<Workspace[]> {
  const seen = new Set<string>();
  const workspaces: Workspace[] = [];

  for (const rawPath of workspacePaths) {
    const absPath = resolve(rawPath);

    if (!existsSync(absPath)) continue;

    if (isGitRepo(absPath)) {
      if (!seen.has(absPath)) {
        seen.add(absPath);
        workspaces.push({ id: basename(absPath), path: absPath });
      }
      continue;
    }

    // Scan children
    const entries = readdirSync(absPath, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const childPath = join(absPath, entry.name);
      if (isGitRepo(childPath) && !seen.has(childPath)) {
        seen.add(childPath);
        workspaces.push({ id: entry.name, path: childPath });
      }
    }
  }

  return workspaces;
}

export async function getWorkspaceDetails(workspace: Workspace) {
  const git: SimpleGit = simpleGit(workspace.path);
  const [branchSummary, status] = await Promise.all([
    git.branch(),
    git.status(),
  ]);

  return {
    ...workspace,
    currentBranch: branchSummary.current,
    branches: branchSummary.all,
    isDirty: !status.isClean(),
    modifiedFiles: status.modified.length + status.not_added.length,
  };
}
```

**Step 4: Run test to verify it passes**

Run: `npx --prefix /home/jeremy/git-personal/orchestragent vitest run src/workspaces.test.ts`
Expected: 5 tests PASS

**Step 5: Commit**

```bash
git add src/workspaces.ts src/workspaces.test.ts
git commit -m "feat: workspace discovery from configured paths with git detection"
```

---

## Task 4: Agent Manager (Claude Code CLI Spawning)

**Files:**
- Create: `src/agent-manager.ts`
- Create: `src/agent-manager.test.ts`

**Step 1: Write the failing test**

```typescript
// src/agent-manager.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { AgentManager } from "./agent-manager.js";

describe("AgentManager", () => {
  let manager: AgentManager;

  beforeEach(() => {
    manager = new AgentManager();
  });

  it("generates a unique agent ID on start", () => {
    const id1 = manager.generateAgentId();
    const id2 = manager.generateAgentId();
    expect(id1).not.toBe(id2);
    expect(id1).toMatch(/^agent-/);
  });

  it("tracks agent state after registration", () => {
    const id = manager.registerAgent({
      workspace: "/tmp/test",
      prompt: "do stuff",
      branch: "main",
    });
    const status = manager.getStatus(id);
    expect(status).toBeDefined();
    expect(status!.status).toBe("pending");
    expect(status!.workspace).toBe("/tmp/test");
  });

  it("returns undefined for unknown agent ID", () => {
    expect(manager.getStatus("nonexistent")).toBeUndefined();
  });

  it("lists all agents", () => {
    manager.registerAgent({ workspace: "/tmp/a", prompt: "a" });
    manager.registerAgent({ workspace: "/tmp/b", prompt: "b" });
    const agents = manager.listAgents();
    expect(agents).toHaveLength(2);
  });

  it("can cancel a pending agent", () => {
    const id = manager.registerAgent({ workspace: "/tmp/a", prompt: "a" });
    const result = manager.cancel(id);
    expect(result).toBe(true);
    expect(manager.getStatus(id)!.status).toBe("cancelled");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx --prefix /home/jeremy/git-personal/orchestragent vitest run src/agent-manager.test.ts`
Expected: FAIL — cannot find module

**Step 3: Write minimal implementation**

Note: This module uses `child_process.spawn` (not `exec`) which passes arguments as an array,
avoiding shell injection. The prompt is passed as a direct argument to the Claude CLI binary.

```typescript
// src/agent-manager.ts
import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";

export type AgentStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export interface AgentRecord {
  id: string;
  workspace: string;
  prompt: string;
  branch?: string;
  plan?: string;
  status: AgentStatus;
  sessionId?: string;
  pid?: number;
  output: string;
  exitCode?: number;
  startedAt: Date;
  completedAt?: Date;
  process?: ChildProcess;
}

export interface StartAgentOptions {
  workspace: string;
  prompt: string;
  branch?: string;
  plan?: string;
}

export class AgentManager {
  private agents = new Map<string, AgentRecord>();

  generateAgentId(): string {
    return `agent-${randomUUID().slice(0, 8)}`;
  }

  registerAgent(options: StartAgentOptions): string {
    const id = this.generateAgentId();
    this.agents.set(id, {
      id,
      workspace: options.workspace,
      prompt: options.prompt,
      branch: options.branch,
      plan: options.plan,
      status: "pending",
      output: "",
      startedAt: new Date(),
    });
    return id;
  }

  async startAgent(id: string): Promise<void> {
    const agent = this.agents.get(id);
    if (!agent) throw new Error(`Agent ${id} not found`);

    let fullPrompt = agent.prompt;
    if (agent.plan) {
      fullPrompt = [
        `A plan has been committed to docs/plans/${agent.plan}`,
        `on branch ${agent.branch ?? "current"}.`,
        `Pull latest and follow the plan.`,
        ``,
        `Additional instructions: ${agent.prompt}`,
      ].join("\n");
    }

    const args = [
      "-p",
      "--dangerously-skip-permissions",
      "--output-format",
      "json",
    ];

    if (agent.sessionId) {
      args.push("--resume", agent.sessionId);
    }

    // Prompt goes last
    args.push(fullPrompt);

    const proc = spawn("claude", args, {
      cwd: agent.workspace,
      stdio: ["inherit", "pipe", "pipe"],
      env: { ...process.env },
    });

    agent.process = proc;
    agent.pid = proc.pid;
    agent.status = "running";

    proc.stdout?.on("data", (data: Buffer) => {
      agent.output += data.toString();
    });

    proc.stderr?.on("data", (data: Buffer) => {
      agent.output += data.toString();
    });

    proc.on("exit", (code) => {
      agent.exitCode = code ?? 1;
      agent.status = code === 0 ? "completed" : "failed";
      agent.completedAt = new Date();
      agent.process = undefined;

      // Try to extract session ID from JSON output
      try {
        const parsed = JSON.parse(agent.output);
        if (parsed.session_id) {
          agent.sessionId = parsed.session_id;
        }
        if (parsed.result) {
          agent.output = parsed.result;
        }
      } catch {
        // output wasn't valid JSON — keep raw
      }
    });

    proc.on("error", (err) => {
      agent.status = "failed";
      agent.output += `\nProcess error: ${err.message}`;
      agent.completedAt = new Date();
      agent.process = undefined;
    });
  }

  async guideAgent(id: string, message: string): Promise<string> {
    const agent = this.agents.get(id);
    if (!agent) throw new Error(`Agent ${id} not found`);

    if (!agent.sessionId) {
      throw new Error(`Agent ${id} has no session ID — cannot guide`);
    }

    const guideId = this.registerAgent({
      workspace: agent.workspace,
      prompt: message,
      branch: agent.branch,
    });
    const guideAgent = this.agents.get(guideId)!;
    guideAgent.sessionId = agent.sessionId;
    await this.startAgent(guideId);
    return guideId;
  }

  getStatus(id: string): Omit<AgentRecord, "process"> | undefined {
    const agent = this.agents.get(id);
    if (!agent) return undefined;
    const { process: _, ...rest } = agent;
    return rest;
  }

  listAgents(): Omit<AgentRecord, "process">[] {
    return Array.from(this.agents.values()).map(
      ({ process: _, ...rest }) => rest
    );
  }

  cancel(id: string): boolean {
    const agent = this.agents.get(id);
    if (!agent) return false;
    if (agent.status === "running" && agent.process) {
      agent.process.kill("SIGTERM");
    }
    agent.status = "cancelled";
    agent.completedAt = new Date();
    agent.process = undefined;
    return true;
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npx --prefix /home/jeremy/git-personal/orchestragent vitest run src/agent-manager.test.ts`
Expected: 5 tests PASS

**Step 5: Commit**

```bash
git add src/agent-manager.ts src/agent-manager.test.ts
git commit -m "feat: agent manager for spawning and tracking Claude Code CLI processes"
```

---

## Task 5: Plan Manager

**Files:**
- Create: `src/plans.ts`
- Create: `src/plans.test.ts`

**Step 1: Write the failing test**

```typescript
// src/plans.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { PlanManager } from "./plans.js";
import { mkdirSync, rmSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";

describe("PlanManager", () => {
  let tmpDir: string;
  let planManager: PlanManager;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `orchestragent-plans-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
    execFileSync("git", ["init"], { cwd: tmpDir, stdio: "ignore" });
    execFileSync("git", ["config", "user.email", "test@test.com"], {
      cwd: tmpDir,
      stdio: "ignore",
    });
    execFileSync("git", ["config", "user.name", "Test"], {
      cwd: tmpDir,
      stdio: "ignore",
    });
    execFileSync("git", ["commit", "--allow-empty", "-m", "init"], {
      cwd: tmpDir,
      stdio: "ignore",
    });
    planManager = new PlanManager();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("creates a plan file with commitMode=none", async () => {
    await planManager.createPlan({
      workspacePath: tmpDir,
      name: "test-feature",
      content: "# My Plan\n\nDo the thing.",
      commitMode: "none",
    });
    const files = await planManager.listPlans(tmpDir);
    expect(files.length).toBe(1);
    expect(files[0]).toContain("test-feature.md");
  });

  it("creates and commits a plan with commitMode=commit", async () => {
    await planManager.createPlan({
      workspacePath: tmpDir,
      name: "committed-plan",
      content: "# Committed\n\nStuff.",
      commitMode: "commit",
    });
    const log = execFileSync("git", ["log", "--oneline"], {
      cwd: tmpDir,
      encoding: "utf-8",
    });
    expect(log).toContain("committed-plan");
  });

  it("lists plan files", async () => {
    await planManager.createPlan({
      workspacePath: tmpDir,
      name: "plan-a",
      content: "A",
      commitMode: "none",
    });
    await planManager.createPlan({
      workspacePath: tmpDir,
      name: "plan-b",
      content: "B",
      commitMode: "none",
    });
    const plans = await planManager.listPlans(tmpDir);
    expect(plans).toHaveLength(2);
  });

  it("gets a plan by name", async () => {
    await planManager.createPlan({
      workspacePath: tmpDir,
      name: "readable",
      content: "# Read Me",
      commitMode: "none",
    });
    const content = await planManager.getPlan(tmpDir, "readable");
    expect(content).toContain("# Read Me");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx --prefix /home/jeremy/git-personal/orchestragent vitest run src/plans.test.ts`
Expected: FAIL

**Step 3: Write minimal implementation**

```typescript
// src/plans.ts
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import simpleGit from "simple-git";

export type CommitMode = "none" | "commit" | "commit-push";

export interface CreatePlanOptions {
  workspacePath: string;
  name: string;
  content: string;
  branch?: string;
  commitMode: CommitMode;
}

export class PlanManager {
  private getPlansDir(workspacePath: string): string {
    return join(workspacePath, "docs", "plans");
  }

  private getDatePrefix(): string {
    return new Date().toISOString().slice(0, 10);
  }

  async createPlan(options: CreatePlanOptions): Promise<string> {
    const { workspacePath, name, content, commitMode } = options;
    const plansDir = this.getPlansDir(workspacePath);
    mkdirSync(plansDir, { recursive: true });

    const fileName = `${this.getDatePrefix()}-${name}.md`;
    const filePath = join(plansDir, fileName);
    writeFileSync(filePath, content, "utf-8");

    if (commitMode === "none") return filePath;

    const git = simpleGit(workspacePath);
    const relativePath = `docs/plans/${fileName}`;
    await git.add(relativePath);
    await git.commit(`plan: add ${name}`, [relativePath]);

    if (commitMode === "commit-push") {
      await git.push();
    }

    return filePath;
  }

  async listPlans(workspacePath: string): Promise<string[]> {
    const plansDir = this.getPlansDir(workspacePath);
    if (!existsSync(plansDir)) return [];
    return readdirSync(plansDir)
      .filter((f) => f.endsWith(".md"))
      .sort();
  }

  async getPlan(workspacePath: string, name: string): Promise<string | null> {
    const plansDir = this.getPlansDir(workspacePath);
    if (!existsSync(plansDir)) return null;
    const files = readdirSync(plansDir).filter(
      (f) => f.includes(name) && f.endsWith(".md")
    );
    if (files.length === 0) return null;
    return readFileSync(join(plansDir, files[0]), "utf-8");
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npx --prefix /home/jeremy/git-personal/orchestragent vitest run src/plans.test.ts`
Expected: 4 tests PASS

**Step 5: Commit**

```bash
git add src/plans.ts src/plans.test.ts
git commit -m "feat: plan manager for creating, listing, and reading plan markdown files"
```

---

## Task 6: MCP Server with Workspace Tools

**Files:**
- Create: `src/server.ts`
- Create: `src/tools/workspace-tools.ts`

**Step 1: Create the MCP server shell**

```typescript
// src/server.ts
import express from "express";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import type { Config } from "./config.js";
import { type Workspace, getWorkspaceDetails } from "./workspaces.js";
import { AgentManager } from "./agent-manager.js";
import { PlanManager } from "./plans.js";
import { registerWorkspaceTools } from "./tools/workspace-tools.js";
import { registerBranchTools } from "./tools/branch-tools.js";
import { registerPlanTools } from "./tools/plan-tools.js";
import { registerAgentTools } from "./tools/agent-tools.js";

export interface ServerContext {
  config: Config;
  workspaces: Workspace[];
  agentManager: AgentManager;
  planManager: PlanManager;
  refreshWorkspaces: () => Promise<void>;
}

export function createApp(config: Config, ctx: ServerContext) {
  const app = express();
  app.use(express.json());

  // Health check
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", workspaces: ctx.workspaces.length });
  });

  // Session tracking
  const transports: Record<string, StreamableHTTPServerTransport> = {};

  app.post("/mcp", async (req, res) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    let transport: StreamableHTTPServerTransport;

    if (sessionId && transports[sessionId]) {
      transport = transports[sessionId];
    } else if (!sessionId && isInitializeRequest(req.body)) {
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sid) => {
          transports[sid] = transport;
        },
      });

      transport.onclose = () => {
        if (transport.sessionId) delete transports[transport.sessionId];
      };

      const server = createMcpServer(ctx);
      await server.connect(transport);
    } else {
      res.status(400).json({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Bad Request: no valid session" },
        id: null,
      });
      return;
    }

    await transport.handleRequest(req, res, req.body);
  });

  const handleSession = async (
    req: express.Request,
    res: express.Response
  ) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    if (!sessionId || !transports[sessionId]) {
      res.status(400).send("Invalid or missing session ID");
      return;
    }
    await transports[sessionId].handleRequest(req, res);
  };

  app.get("/mcp", handleSession);
  app.delete("/mcp", handleSession);

  return app;
}

function createMcpServer(ctx: ServerContext): McpServer {
  const server = new McpServer({
    name: "orchestragent",
    version: "0.1.0",
  });

  registerWorkspaceTools(server, ctx);
  registerBranchTools(server, ctx);
  registerPlanTools(server, ctx);
  registerAgentTools(server, ctx);

  return server;
}
```

**Step 2: Create workspace tools**

```typescript
// src/tools/workspace-tools.ts
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../server.js";
import { getWorkspaceDetails } from "../workspaces.js";

export function registerWorkspaceTools(server: McpServer, ctx: ServerContext) {
  server.tool(
    "list_workspaces",
    "List all discovered workspaces with current branch and dirty state",
    {},
    async () => {
      await ctx.refreshWorkspaces();
      const details = await Promise.all(
        ctx.workspaces.map((ws) => getWorkspaceDetails(ws))
      );
      return {
        content: [{ type: "text", text: JSON.stringify(details, null, 2) }],
      };
    }
  );

  server.tool(
    "get_workspace",
    "Get detailed information about a specific workspace",
    { workspace: z.string().describe("Workspace ID (directory name)") },
    async ({ workspace }) => {
      const ws = ctx.workspaces.find((w) => w.id === workspace);
      if (!ws) {
        return {
          content: [
            { type: "text", text: `Workspace "${workspace}" not found` },
          ],
          isError: true,
        };
      }
      const details = await getWorkspaceDetails(ws);
      return {
        content: [{ type: "text", text: JSON.stringify(details, null, 2) }],
      };
    }
  );
}
```

**Step 3: Verify typecheck**

Run: `npx --prefix /home/jeremy/git-personal/orchestragent tsc --noEmit`
Expected: No errors (branch-tools, plan-tools, agent-tools don't exist yet — this step is done after Task 7-9, or stub the imports)

Note to implementer: Tasks 6-9 should be committed together since `server.ts` imports all tool files. Either create all tool files first, or stub the imports and uncomment as each tool file is created.

**Step 4: Commit**

```bash
git add src/server.ts src/tools/workspace-tools.ts
git commit -m "feat: MCP server with Streamable HTTP transport and workspace tools"
```

---

## Task 7: Branch Tools

**Files:**
- Create: `src/tools/branch-tools.ts`

**Step 1: Create branch tools**

```typescript
// src/tools/branch-tools.ts
import { z } from "zod";
import simpleGit from "simple-git";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../server.js";

export function registerBranchTools(server: McpServer, ctx: ServerContext) {
  server.tool(
    "list_branches",
    "List all branches and worktrees in a workspace",
    { workspace: z.string().describe("Workspace ID") },
    async ({ workspace }) => {
      const ws = ctx.workspaces.find((w) => w.id === workspace);
      if (!ws) {
        return {
          content: [
            { type: "text", text: `Workspace "${workspace}" not found` },
          ],
          isError: true,
        };
      }
      const git = simpleGit(ws.path);
      const branches = await git.branch();
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { current: branches.current, branches: branches.all },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  server.tool(
    "create_branch",
    "Create a new branch and worktree for isolated work",
    {
      workspace: z.string().describe("Workspace ID"),
      branch: z.string().describe("New branch name"),
      from: z.string().optional().describe("Base branch (default: current)"),
    },
    async ({ workspace, branch, from }) => {
      const ws = ctx.workspaces.find((w) => w.id === workspace);
      if (!ws) {
        return {
          content: [
            { type: "text", text: `Workspace "${workspace}" not found` },
          ],
          isError: true,
        };
      }
      const git = simpleGit(ws.path);
      const worktreePath = `${ws.path}/.claude/worktrees/${branch}`;
      const args = ["worktree", "add", worktreePath, "-b", branch];
      if (from) args.push(from);
      await git.raw(args);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                branch,
                worktreePath,
                message: `Created branch "${branch}" with worktree at ${worktreePath}`,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );
}
```

**Step 2: Verify typecheck**

Run: `npx --prefix /home/jeremy/git-personal/orchestragent tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/tools/branch-tools.ts
git commit -m "feat: branch listing and worktree creation tools"
```

---

## Task 8: Plan Tools

**Files:**
- Create: `src/tools/plan-tools.ts`

**Step 1: Create plan tools**

```typescript
// src/tools/plan-tools.ts
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../server.js";

export function registerPlanTools(server: McpServer, ctx: ServerContext) {
  server.tool(
    "create_plan",
    "Create a plan markdown file in a workspace, optionally committing it",
    {
      workspace: z.string().describe("Workspace ID"),
      name: z
        .string()
        .describe("Plan name (used in filename: YYYY-MM-DD-<name>.md)"),
      content: z.string().describe("Plan content (markdown)"),
      branch: z
        .string()
        .optional()
        .describe("Target branch (default: current)"),
      commitMode: z
        .enum(["none", "commit", "commit-push"])
        .default("none")
        .describe(
          "none=write only, commit=stage+commit, commit-push=commit+push"
        ),
    },
    async ({ workspace, name, content, commitMode }) => {
      const ws = ctx.workspaces.find((w) => w.id === workspace);
      if (!ws) {
        return {
          content: [
            { type: "text", text: `Workspace "${workspace}" not found` },
          ],
          isError: true,
        };
      }
      const filePath = await ctx.planManager.createPlan({
        workspacePath: ws.path,
        name,
        content,
        commitMode,
      });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { filePath, commitMode, message: `Plan "${name}" created` },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  server.tool(
    "get_plan",
    "Read a plan file from a workspace",
    {
      workspace: z.string().describe("Workspace ID"),
      name: z.string().describe("Plan name (partial match)"),
    },
    async ({ workspace, name }) => {
      const ws = ctx.workspaces.find((w) => w.id === workspace);
      if (!ws) {
        return {
          content: [
            { type: "text", text: `Workspace "${workspace}" not found` },
          ],
          isError: true,
        };
      }
      const content = await ctx.planManager.getPlan(ws.path, name);
      if (!content) {
        return {
          content: [{ type: "text", text: `Plan "${name}" not found` }],
          isError: true,
        };
      }
      return { content: [{ type: "text", text: content }] };
    }
  );

  server.tool(
    "list_plans",
    "List all plan files in a workspace",
    { workspace: z.string().describe("Workspace ID") },
    async ({ workspace }) => {
      const ws = ctx.workspaces.find((w) => w.id === workspace);
      if (!ws) {
        return {
          content: [
            { type: "text", text: `Workspace "${workspace}" not found` },
          ],
          isError: true,
        };
      }
      const plans = await ctx.planManager.listPlans(ws.path);
      return {
        content: [{ type: "text", text: JSON.stringify(plans, null, 2) }],
      };
    }
  );
}
```

**Step 2: Verify typecheck**

Run: `npx --prefix /home/jeremy/git-personal/orchestragent tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/tools/plan-tools.ts
git commit -m "feat: plan creation, reading, and listing tools"
```

---

## Task 9: Agent Tools

**Files:**
- Create: `src/tools/agent-tools.ts`

**Step 1: Create agent tools**

```typescript
// src/tools/agent-tools.ts
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../server.js";

export function registerAgentTools(server: McpServer, ctx: ServerContext) {
  server.tool(
    "start_agent",
    "Start a Claude Code agent in a workspace. Returns an agentId for tracking.",
    {
      workspace: z.string().describe("Workspace ID"),
      prompt: z.string().describe("Task prompt for the agent"),
      branch: z
        .string()
        .optional()
        .describe("Branch to work on (creates worktree)"),
      plan: z
        .string()
        .optional()
        .describe(
          "Plan name — agent prompt will include instruction to follow this plan"
        ),
    },
    async ({ workspace, prompt, branch, plan }) => {
      const ws = ctx.workspaces.find((w) => w.id === workspace);
      if (!ws) {
        return {
          content: [
            { type: "text", text: `Workspace "${workspace}" not found` },
          ],
          isError: true,
        };
      }
      const id = ctx.agentManager.registerAgent({
        workspace: ws.path,
        prompt,
        branch,
        plan,
      });
      // Start asynchronously
      ctx.agentManager.startAgent(id).catch((err) => {
        console.error(`Agent ${id} failed to start:`, err);
      });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                agentId: id,
                status: "starting",
                workspace: ws.id,
                message: `Agent ${id} is starting. Use agent_status to check progress.`,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  server.tool(
    "agent_status",
    "Check the status and recent output of an agent",
    { agentId: z.string().describe("Agent ID returned by start_agent") },
    async ({ agentId }) => {
      const status = ctx.agentManager.getStatus(agentId);
      if (!status) {
        return {
          content: [
            { type: "text", text: `Agent "${agentId}" not found` },
          ],
          isError: true,
        };
      }
      const truncatedOutput =
        status.output.length > 2000
          ? "..." + status.output.slice(-2000)
          : status.output;
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ ...status, output: truncatedOutput }, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "guide_agent",
    "Send a follow-up instruction to an agent (resumes its session)",
    {
      agentId: z.string().describe("Agent ID to guide"),
      message: z.string().describe("Follow-up instruction"),
    },
    async ({ agentId, message }) => {
      try {
        const newId = await ctx.agentManager.guideAgent(agentId, message);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  originalAgentId: agentId,
                  newAgentId: newId,
                  message: `Follow-up started as ${newId}. Use agent_status to track.`,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "Unknown error";
        return {
          content: [{ type: "text", text: `Error: ${message}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "cancel_agent",
    "Cancel a running agent",
    { agentId: z.string().describe("Agent ID to cancel") },
    async ({ agentId }) => {
      const result = ctx.agentManager.cancel(agentId);
      return {
        content: [
          {
            type: "text",
            text: result
              ? `Agent ${agentId} cancelled`
              : `Agent ${agentId} not found`,
          },
        ],
        isError: !result,
      };
    }
  );

  server.tool(
    "list_agents",
    "List all active and recent agents with their status",
    {},
    async () => {
      const agents = ctx.agentManager.listAgents().map((a) => ({
        id: a.id,
        workspace: a.workspace,
        status: a.status,
        startedAt: a.startedAt,
        completedAt: a.completedAt,
      }));
      return {
        content: [{ type: "text", text: JSON.stringify(agents, null, 2) }],
      };
    }
  );
}
```

**Step 2: Verify typecheck**

Run: `npx --prefix /home/jeremy/git-personal/orchestragent tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/tools/agent-tools.ts
git commit -m "feat: agent start, status, guide, cancel, and list tools"
```

---

## Task 10: Auth Middleware (Token + OAuth stub)

**Files:**
- Create: `src/auth.ts`
- Create: `src/auth.test.ts`
- Modify: `src/server.ts` — apply auth middleware

**Step 1: Write the failing test**

```typescript
// src/auth.test.ts
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
```

**Step 2: Run test to verify it fails**

Run: `npx --prefix /home/jeremy/git-personal/orchestragent vitest run src/auth.test.ts`
Expected: FAIL

**Step 3: Write implementation**

```typescript
// src/auth.ts
import { timingSafeEqual } from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import type { Config } from "./config.js";

export function validateToken(
  expected: string | undefined,
  provided: string
): boolean {
  if (!expected || !provided) return false;
  if (expected.length !== provided.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
}

export function tokenAuthMiddleware(config: Config) {
  return (req: Request, res: Response, next: NextFunction) => {
    // Skip auth for health check
    if (req.path === "/health") return next();

    // Skip if no auth configured
    if (!config.auth.token.enabled && !config.auth.oauth.enabled) {
      return next();
    }

    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      res.status(401).json({ error: "Missing Bearer token" });
      return;
    }

    const token = authHeader.slice(7);

    // Token auth
    if (
      config.auth.token.enabled &&
      validateToken(config.auth.tokenValue, token)
    ) {
      return next();
    }

    // TODO: OAuth token validation will be added in Task 14

    res.status(403).json({ error: "Invalid token" });
  };
}
```

**Step 4: Run test to verify it passes**

Run: `npx --prefix /home/jeremy/git-personal/orchestragent vitest run src/auth.test.ts`
Expected: 4 tests PASS

**Step 5: Apply middleware in server.ts**

Add to `src/server.ts`, after `app.use(express.json())`:

```typescript
import { tokenAuthMiddleware } from "./auth.js";
// ...
app.use(tokenAuthMiddleware(config));
```

**Step 6: Commit**

```bash
git add src/auth.ts src/auth.test.ts src/server.ts
git commit -m "feat: token-based auth middleware with timing-safe comparison"
```

---

## Task 11: Entry Point (Wire Everything Together)

**Files:**
- Modify: `src/index.ts`

**Step 1: Write the entry point**

```typescript
// src/index.ts
import { resolve } from "node:path";
import { loadConfig } from "./config.js";
import { discoverWorkspaces } from "./workspaces.js";
import { AgentManager } from "./agent-manager.js";
import { PlanManager } from "./plans.js";
import { createApp, type ServerContext } from "./server.js";

async function main() {
  const configPath = resolve(
    process.env.ORCHESTRAGENT_CONFIG ?? "orchestragent.config.yaml"
  );

  console.log(`Loading config from ${configPath}`);
  const config = loadConfig(configPath);

  console.log(
    `Discovering workspaces from ${config.workspacePaths.length} paths...`
  );
  let workspaces = await discoverWorkspaces(config.workspacePaths);
  console.log(
    `Found ${workspaces.length} workspaces: ${workspaces.map((w) => w.id).join(", ")}`
  );

  const agentManager = new AgentManager();
  const planManager = new PlanManager();

  const ctx: ServerContext = {
    config,
    workspaces,
    agentManager,
    planManager,
    refreshWorkspaces: async () => {
      workspaces = await discoverWorkspaces(config.workspacePaths);
      ctx.workspaces = workspaces;
    },
  };

  const app = createApp(config, ctx);

  app.listen(config.server.port, config.server.host, () => {
    console.log(
      `orchestragent listening on ${config.server.host}:${config.server.port}`
    );
    console.log(
      `MCP endpoint: http://${config.server.host}:${config.server.port}/mcp`
    );
    console.log(
      `Health check: http://${config.server.host}:${config.server.port}/health`
    );
    if (config.auth.token.enabled) console.log("Auth: token enabled");
    if (config.auth.oauth.enabled) console.log("Auth: OAuth enabled");
  });
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
```

**Step 2: Create a local config for testing**

Copy `orchestragent.config.example.yaml` to `orchestragent.config.yaml` and set
`workspacePaths` to a real directory (e.g. `/home/jeremy/git-personal`).

**Step 3: Verify it starts**

Run: `npx --prefix /home/jeremy/git-personal/orchestragent tsx src/index.ts`
Expected: "orchestragent listening on 0.0.0.0:3100" + workspace count

**Step 4: Test health endpoint**

Run: `curl http://localhost:3100/health`
Expected: `{"status":"ok","workspaces":N}`

**Step 5: Commit**

```bash
git add src/index.ts
git commit -m "feat: entry point wiring config, workspaces, and MCP server"
```

---

## Task 12: Build, Test, and Package

**Files:**
- Modify: `package.json` — verify scripts
- Create: `CLAUDE.md` — project conventions for Claude Code
- Modify: `.gitignore` — add dist/ and local config

**Step 1: Run all tests**

Run: `npx --prefix /home/jeremy/git-personal/orchestragent vitest run`
Expected: All tests pass (~22 tests)

**Step 2: Run typecheck**

Run: `npx --prefix /home/jeremy/git-personal/orchestragent tsc --noEmit`
Expected: No errors

**Step 3: Build**

Run: `npx --prefix /home/jeremy/git-personal/orchestragent tsup`
Expected: `dist/index.js` created with shebang

**Step 4: Create CLAUDE.md**

```markdown
# orchestragent

Remote MCP server for orchestrating Claude Code agents on a devbox.

## Tech Stack
- TypeScript, Node.js 20+
- MCP SDK: `@modelcontextprotocol/sdk` v1.x
- Build: `tsup` (ESM output)
- Test: `vitest`

## Commands
- `npm run dev` — run with tsx (hot reload)
- `npm run build` — production build
- `npm test` — run tests
- `npm run typecheck` — type check

## Structure
- `src/index.ts` — entry point
- `src/config.ts` — YAML config + env var loading
- `src/server.ts` — Express + MCP server setup
- `src/workspaces.ts` — git repo discovery
- `src/agent-manager.ts` — Claude Code CLI spawning
- `src/plans.ts` — plan file CRUD
- `src/auth.ts` — token auth middleware
- `src/tools/` — MCP tool registrations

## Conventions
- ESM only ("type": "module" in package.json)
- Imports use .js extension (required by MCP SDK)
- Tests co-located: src/foo.test.ts next to src/foo.ts
- No hardcoded paths — all config via YAML + env vars
- Use child_process.spawn (not exec) for subprocess spawning
```

**Step 5: Add dist and local config to .gitignore**

Append to `.gitignore`:
```
dist/
orchestragent.config.yaml
```

**Step 6: Commit**

```bash
git add CLAUDE.md .gitignore package.json
git commit -m "feat: build config, CLAUDE.md conventions, gitignore updates"
```

---

## Task 13: Deploy to Devbox and Test with Cloudflare Tunnel

**Files:**
- Modify (on devbox): `/home/devuser/.cloudflared/config.yml` — add orch.hexapax.com route
- Create (on devbox): `/etc/systemd/system/orchestragent.service`
- Create (on devbox): `/opt/repos/orchestragent/orchestragent.config.yaml`

**Step 1: Push repo to GitHub**

```bash
git -C /home/jeremy/git-personal/orchestragent push origin main
```

**Step 2: Pull on devbox and build**

SSH to devbox and run:
```bash
cd /opt/repos/orchestragent
git pull
npm install
npm run build
```

**Step 3: Create config on devbox**

Write `/opt/repos/orchestragent/orchestragent.config.yaml`:
```yaml
workspacePaths:
  - /opt/repos

server:
  port: 3100
  host: 127.0.0.1

auth:
  token:
    enabled: true
```

Generate a token: `openssl rand -hex 32`
Set it as env var: `ORCHESTRAGENT_AUTH_TOKEN=<generated-token>`

**Step 4: Add Cloudflare Tunnel route**

```bash
cloudflared tunnel route dns devbox-librechat orch.hexapax.com
```

Update `/home/devuser/.cloudflared/config.yml`:
```yaml
tunnel: 48188ce0-25cd-49f0-aae9-e5938d8370f8
credentials-file: /home/devuser/.cloudflared/48188ce0-25cd-49f0-aae9-e5938d8370f8.json

ingress:
  - hostname: devbox.hexapax.com
    service: http://localhost:3080
  - hostname: orch.hexapax.com
    service: http://localhost:3100
  - service: http_status:404
```

**Step 5: Create systemd service**

Write `/etc/systemd/system/orchestragent.service`:
```ini
[Unit]
Description=orchestragent MCP Server
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=devuser
WorkingDirectory=/opt/repos/orchestragent
ExecStart=/usr/bin/node dist/index.js
Restart=on-failure
RestartSec=5
Environment=ORCHESTRAGENT_AUTH_TOKEN=<token-here>
StandardOutput=journal
StandardError=journal
SyslogIdentifier=orchestragent

[Install]
WantedBy=multi-user.target
```

**Step 6: Start and verify**

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now orchestragent
sudo systemctl restart cloudflared-tunnel

# Test locally
curl http://localhost:3100/health

# Test via tunnel
curl https://orch.hexapax.com/health

# Test MCP init with auth
curl -H "Authorization: Bearer <token>" \
     -H "Content-Type: application/json" \
     https://orch.hexapax.com/mcp \
     -d '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}},"id":1}'
```

**Step 7: Commit any deployment tweaks**

```bash
git add -A
git commit -m "docs: deployment instructions and example config"
```

---

## Task 14: Add OAuth 2.1 Support

This task adds the OAuth provider so claude.ai can authenticate via its standard connector flow.
Can be deferred until token-based flow is validated end-to-end.

**Files:**
- Create: `src/oauth-provider.ts`
- Modify: `src/server.ts` — mount auth router when OAuth enabled
- Modify: `src/auth.ts` — add OAuth token validation path

**Step 1: Implement a minimal OAuth provider**

The MCP SDK's `mcpAuthRouter` needs an `OAuthServerProvider`. For a single-user devbox,
implement a minimal provider that:
- Stores client registrations in memory (supports DCR)
- Issues opaque tokens (no JWT needed for single-user)
- Validates tokens against its own store
- Auto-approves the authorize step (single user, no consent screen needed)

Key interfaces to implement from `@modelcontextprotocol/sdk/server/auth/router.js`:
- `OAuthServerProvider.authorize()` — auto-approve and redirect with auth code
- `OAuthServerProvider.exchangeAuthorizationCode()` — return access + refresh tokens
- `OAuthServerProvider.exchangeRefreshToken()` — issue new tokens
- `OAuthServerProvider.verifyAccessToken()` — validate bearer tokens
- `OAuthRegisteredClientsStore` — in-memory client store

Callback URL for claude.ai: `https://claude.ai/api/mcp/auth_callback`

Reference: MCP SDK TypeScript examples at `github.com/modelcontextprotocol/typescript-sdk`

**Step 2: Mount in server.ts**

```typescript
import { mcpAuthRouter } from "@modelcontextprotocol/sdk/server/auth/router.js";

if (config.auth.oauth.enabled) {
  app.use(mcpAuthRouter({
    provider: oauthProvider,
    issuerUrl: new URL(config.auth.oauth.issuer!),
    baseUrl: new URL(config.auth.oauth.issuer!),
    scopesSupported: ["mcp:read", "mcp:write"],
    resourceName: "orchestragent",
  }));
}
```

**Step 3: Update auth middleware to validate OAuth tokens**

In `src/auth.ts`, add a branch that calls the OAuth provider's `verifyAccessToken` method.

**Step 4: Test with claude.ai**

1. Go to claude.ai → Settings → Integrations → Add Custom Connector
2. Enter URL: `https://orch.hexapax.com`
3. Complete OAuth flow
4. In a conversation, test a tool call (e.g., "list my workspaces")

**Step 5: Commit**

```bash
git add src/oauth-provider.ts src/server.ts src/auth.ts
git commit -m "feat: OAuth 2.1 provider for claude.ai custom connector auth"
```

---

## Summary

| Task | Component | Tests | Depends On |
|------|-----------|-------|------------|
| 1 | Project scaffolding | Build check | — |
| 2 | Config loading | 4 unit tests | 1 |
| 3 | Workspace discovery | 5 unit tests | 1 |
| 4 | Agent manager | 5 unit tests | 1 |
| 5 | Plan manager | 4 unit tests | 1 |
| 6 | MCP server + workspace tools | Typecheck | 2, 3, 4, 5 |
| 7 | Branch tools | Typecheck | 6 |
| 8 | Plan tools | Typecheck | 6 |
| 9 | Agent tools | Typecheck | 6 |
| 10 | Auth middleware | 4 unit tests | 6 |
| 11 | Entry point | Manual test | 6-10 |
| 12 | Build and package | Full test suite | 11 |
| 13 | Deploy to devbox | Integration test | 12 |
| 14 | OAuth 2.1 | claude.ai test | 13 |

**Total: 14 tasks, ~22 unit tests, 12 MCP tools**
