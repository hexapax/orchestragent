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
