import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { PlanManager } from "./plans.js";
import { mkdirSync, rmSync } from "node:fs";
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
