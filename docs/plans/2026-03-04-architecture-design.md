# orchestragent — Architecture Design

## Overview

orchestragent is a remote MCP server that lets AI clients (claude.ai, Claude Desktop, etc.) orchestrate Claude Code agents on a devbox server. It enables voice-driven development workflows: speak to claude.ai on your phone, and it starts, monitors, and guides coding agents running on your remote machine.

## Primary Use Case

```
iPhone (voice) → claude.ai → orchestragent (remote MCP) → Claude Code CLI (devbox)
```

- User speaks to claude.ai using voice (driving, exercising, no glasses)
- claude.ai calls orchestragent tools via MCP to manage coding work
- orchestragent spawns and manages Claude Code CLI processes on the devbox
- Plans are stored as markdown files in git for durability

## Architecture

```
┌─────────────┐     HTTPS/MCP      ┌──────────────────┐      CLI      ┌─────────────┐
│  claude.ai  │ ──────────────────► │  orchestragent   │ ────────────► │ Claude Code  │
│  (iPhone)   │  Streamable HTTP    │  (devbox:3100)   │   spawn/mgmt  │   (agents)   │
└─────────────┘                     └──────────────────┘               └─────────────┘
                                           │
                                    Cloudflare Tunnel
                                    (e.g. orch.hexapax.com)
```

## Protocol & Transport

- **Protocol**: Model Context Protocol (MCP)
- **Transport**: Streamable HTTP (future-proof; SSE support being deprecated by Anthropic)
- **Server SDK**: `@modelcontextprotocol/sdk` (TypeScript)
- **Hosting**: Any machine with Node.js and Claude Code CLI installed
- **Tunnel**: Exposed via Cloudflare Tunnel (or any HTTPS reverse proxy)

## Authentication (dual mode)

| Mode | Mechanism | Use Case |
|------|-----------|----------|
| **OAuth 2.1** | Authorization code flow with DCR, callback to `claude.ai/api/mcp/auth_callback` | Production — claude.ai custom connector |
| **Pre-shared token** | `Authorization: Bearer <token>` header | Testing, scripts, Claude Desktop |

Both modes can be enabled simultaneously. Configured via environment variables.

## Configuration

```yaml
# orchestragent.config.yaml

workspacePaths:
  - /opt/repos              # auto-discovers child git repos
  - /home/user/solo-project # direct repo path

server:
  port: 3100
  host: 0.0.0.0

auth:
  oauth:
    enabled: true
    issuer: https://orch.hexapax.com  # or your tunnel URL
  token:
    enabled: true
    # actual value in env: ORCHESTRAGENT_AUTH_TOKEN
```

### Workspace Discovery

Each entry in `workspacePaths` is checked:
- If it's a git repo (contains `.git`): it becomes a workspace directly
- If it's a directory containing subdirectories: each child that is a git repo becomes a workspace
- Workspace ID is derived from directory name (e.g., `scout-quest`)
- Discovery runs at startup and is refreshable via `list_workspaces`

## MCP Tools

### Workspace Tools

| Tool | Input | Output |
|------|-------|--------|
| `list_workspaces` | — | Array of discovered workspaces with path, current branch, dirty state |
| `get_workspace` | `workspace` | Detailed workspace info: branches, worktrees, recent commits |

### Branch Tools

| Tool | Input | Output |
|------|-------|--------|
| `list_branches` | `workspace` | All branches + active worktrees |
| `create_branch` | `workspace`, `branch`, `from?` | Creates branch + worktree for isolation |

### Plan Tools

| Tool | Input | Output |
|------|-------|--------|
| `create_plan` | `workspace`, `name`, `content`, `branch?`, `commitMode?` | Writes plan markdown, optionally commits/pushes |
| `get_plan` | `workspace`, `name` | Returns plan file content |
| `list_plans` | `workspace` | Lists plan files in `docs/plans/` |

#### `commitMode` values for `create_plan`

| Value | Behavior |
|-------|----------|
| `none` | Write file only, don't stage (default) |
| `commit` | Stage + commit locally |
| `commit-push` | Stage + commit + push to remote |

### Agent Tools

| Tool | Input | Output |
|------|-------|--------|
| `start_agent` | `workspace`, `prompt`, `branch?`, `plan?` | Spawns Claude Code CLI, returns `agentId` |
| `agent_status` | `agentId` | Status (running/completed/failed), recent output |
| `guide_agent` | `agentId`, `message` | Sends follow-up instruction via session resume |
| `cancel_agent` | `agentId` | Stops the agent process |
| `list_agents` | — | All active/recent agents with status |

## Plan File Flow

1. `create_plan` writes `docs/plans/YYYY-MM-DD-<name>.md` in the workspace
2. If `commitMode` is `commit` or `commit-push`, the file is committed (via worktree or direct)
3. `start_agent` prompt includes context: *"A plan has been committed to `docs/plans/<name>.md` on branch `<branch>`. Pull latest and follow the plan."*
4. Plans persist in git — durable across agent restarts and server reboots

## Agent Management

- Agents are spawned as Claude Code CLI child processes
- Each agent runs in its own git worktree (prevents concurrent agents from conflicting)
- `guide_agent` uses Claude Code's `--session-id` / `--resume` for session continuity
- Agent state (PID, status, output tail, session ID) stored in memory
- On server restart, running agents are orphaned (future: reconnect or clean up)

### Agent Lifecycle

```
start_agent → spawned (worktree created, CLI started)
    │
    ├── agent_status → "running", partial output
    ├── guide_agent → send follow-up instruction
    │
    ├── completed → output captured, exit code 0
    ├── failed → output captured, non-zero exit
    └── cancel_agent → SIGTERM sent, marked cancelled
```

## Tech Stack

| Component | Package |
|-----------|---------|
| MCP server | `@modelcontextprotocol/sdk` |
| Transport | Streamable HTTP (built into SDK) |
| Git operations | `simple-git` |
| Agent spawning | Node.js `child_process.spawn` |
| Config | `js-yaml` + env vars |
| Build | `tsup` (bundle) or `tsc` (compile) |
| Runtime | Node.js 20+ |

## Package Distribution

- Published to npm as `orchestragent`
- Install: `npm install -g orchestragent` or `npx orchestragent`
- No hardcoded paths, project names, or domain-specific configuration
- All customization via config file + environment variables

## Future Ideas

- **Agent SDK engine**: Add Anthropic Agent SDK as an alternative to CLI spawning. Config option `engine: "cli" | "sdk"`. SDK engine gives fine-grained control over each tool call but requires providing file/bash/git tools manually.
- **Agent event streaming**: Real-time tool call observation (what file is being edited, which tests are running)
- **Multi-agent coordination**: Agents that hand off work or collaborate on subtasks
- **Web dashboard**: Status UI for active agents (could be another Cloudflare Tunnel route)
- **Agent reconnection**: On server restart, reconnect to orphaned Claude Code sessions
- **REST convenience layer**: Optional REST endpoints for non-MCP consumers (curl, webhooks, CI/CD)
