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
