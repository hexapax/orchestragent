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
