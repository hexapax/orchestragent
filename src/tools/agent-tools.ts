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
