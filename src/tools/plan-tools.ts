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
