# orchestragent

Remote MCP server for orchestrating Claude Code agents on a devbox.

## Tech Stack
- TypeScript, Node.js 20+
- MCP SDK: `@modelcontextprotocol/sdk` v1.x
- Build: `tsup` (ESM output)
- Test: `vitest`

## Commands
- `npm run dev` — run with tsx (hot reload)
- `npm run build` — production build
- `npm test` — run tests
- `npm run typecheck` — type check

## Structure
- `src/index.ts` — entry point
- `src/config.ts` — YAML config + env var loading
- `src/server.ts` — Express + MCP server setup
- `src/workspaces.ts` — git repo discovery
- `src/agent-manager.ts` — Claude Code CLI spawning
- `src/plans.ts` — plan file CRUD
- `src/auth.ts` — token auth middleware
- `src/tools/` — MCP tool registrations

## Conventions
- ESM only ("type": "module" in package.json)
- Imports use .js extension (required by MCP SDK)
- Tests co-located: src/foo.test.ts next to src/foo.ts
- No hardcoded paths — all config via YAML + env vars
- Use child_process.spawn (not exec) for subprocess spawning
