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
