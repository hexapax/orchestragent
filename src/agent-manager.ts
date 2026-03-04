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
