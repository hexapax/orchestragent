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
