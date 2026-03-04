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
