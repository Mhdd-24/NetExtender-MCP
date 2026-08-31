# NetExtender MCP — Project Wiki

Complete guide for **@mhdd_24/netextender-mcp**: what it does, how it works, setup from scratch, daily usage in Cursor, and maintainer workflow after npm publish.

**Project path:** `C:\workspace\netextender-mcp`

---

## Table of contents

1. [What this project does](#1-what-this-project-does)
2. [High-level architecture](#2-high-level-architecture)
3. [How nxcli and profiles work](#3-how-nxcli-and-profiles-work)
4. [Complete setup for a new user](#4-complete-setup-for-a-new-user)
5. [What happens after installing the package](#5-what-happens-after-installing-the-package)
6. [Configuration reference](#6-configuration-reference)
7. [Using the MCP tools](#7-using-the-mcp-tools)
8. [Request flow (end to end)](#8-request-flow-end-to-end)
9. [Project folder structure](#9-project-folder-structure)
10. [Source code reference](#10-source-code-reference)
11. [Environment variables](#11-environment-variables)
12. [Credentials and security](#12-credentials-and-security)
13. [Local development](#13-local-development)
14. [Connecting MCP clients](#14-connecting-mcp-clients)
15. [Extending the project](#15-extending-the-project)
16. [Troubleshooting](#16-troubleshooting)
17. [Publishing and post-release](#17-publishing-and-post-release)

---

## 1. What this project does

**netextender-mcp** is a [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server. It lets AI assistants (Cursor, Claude, Copilot, etc.) control **SonicWall NetExtender VPN** on Windows using natural language.

Example prompts:

> Run **vpn_status** on the netextender MCP.

> **vpn_connect** — I need VPN for DEV database access.

> **vpn_disconnect** when I'm done.

The server exposes four tools:

| Tool | Role | timelog-mcp equivalent |
|------|------|------------------------|
| `vpn_status` | Check if VPN is connected and show session details | `whoami` |
| `list_vpn_profiles` | List saved connection profiles | `list_time_types` |
| `vpn_connect` | Connect to VPN (profile or server credentials) | `log_time` |
| `vpn_disconnect` | Disconnect active VPN session | — |

**Important:** This MCP server does not talk to SonicWall over the network directly. It shells out to **`nxcli.exe`** (NetExtender CLI) installed locally on Windows.

---

## 2. High-level architecture

```
┌──────────────────────────────────────────────────────────────────┐
│  MCP client (Cursor, Claude Desktop, VS Code, …)                 │
│  stdio JSON-RPC — tools/list, tools/call                         │
└────────────────────────────┬─────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│  src/index.ts                                                    │
│  McpServer + StdioServerTransport                                │
│  registerTools() → vpn_status | list_vpn_profiles |              │
│                    vpn_connect | vpn_disconnect                  │
└────────────────────────────┬─────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│  src/services/netextenderCliService.ts                           │
│  spawn(nxcli.exe, args) → parse stdout/stderr                    │
└────────────────────────────┬─────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│  SonicWall NetExtender CLI (nxcli.exe)                           │
│  C:\Program Files\SonicWall\SSL-VPN\NetExtender\nxcli.exe        │
└────────────────────────────┬─────────────────────────────────────┘
                             │
                             ▼
                    VPN tunnel (SSL VPN)
```

### Layer responsibilities

| Layer | Location | Purpose |
|-------|----------|---------|
| **Entry** | `src/index.ts` | Boot MCP server, validate env, register tools |
| **Config** | `src/config/netextender.config.ts` | All constants (`NE`) — paths, messages, tool metadata |
| **Interfaces** | `src/interfaces/netextender.ts` | TypeScript contracts (status, connect input, CLI result) |
| **Tools** | `src/tools/` | MCP tool schemas + handlers (Zod + `server.tool`) |
| **Services** | `src/services/netextenderCliService.ts` | Run `nxcli`, parse output, connect/disconnect logic |
| **Env** | `src/env.ts` | Read `process.env` with aliases and CLI auto-detect |

---

## 3. How nxcli and profiles work

### CLI executable

NetExtender **10.3+** ships `nxcli.exe` (not legacy `necli.exe`).

Default install path:

```
C:\Program Files\SonicWall\SSL-VPN\NetExtender\nxcli.exe
```

The MCP server auto-detects this path unless `NETEXTENDER_CLI` is set.

### Key nxcli commands used by this MCP

| MCP tool | nxcli command |
|----------|-----------------|
| `vpn_status` | `nxcli status` |
| `list_vpn_profiles` | `nxcli connection list` |
| `vpn_connect` | `nxcli connection add …` (if server provided) then `nxcli connect <profile>` |
| `vpn_disconnect` | `nxcli disconnect` |

### Connected vs disconnected detection

`vpn_status` parses output for the marker:

```
NetExtender has been connected
```

When connected, the CLI also returns session fields (username, server, IPv4, routes, connected time).

### Profile upsert on connect

When `vpn_connect` receives a **server** (from tool args or `NETEXTENDER_SERVER` env), the service runs:

```
nxcli connection add <profileName> -s <host:port> -d <domain> -u <user> -p <pass> --force [--always-trust]
nxcli connect <profileName> [--always-trust]
```

`--force` updates an existing profile. `--always-trust` skips certificate verification prompts (useful for automation).

If only a **profile name** is provided (no server), connect uses:

```
nxcli connect <profileName>
```

---

## 4. Complete setup for a new user

Follow these steps in order.

### Step 1 — Install Node.js

Install **Node.js 18 or later** from [nodejs.org](https://nodejs.org/).

```bash
node --version   # v18.x or higher
```

### Step 2 — Install SonicWall NetExtender

Install NetExtender **10.3+** on Windows. Confirm `nxcli.exe` exists:

```powershell
Test-Path "C:\Program Files\SonicWall\SSL-VPN\NetExtender\nxcli.exe"
```

Manual test:

```powershell
& "C:\Program Files\SonicWall\SSL-VPN\NetExtender\nxcli.exe" status
```

### Step 3 — Gather VPN connection details

From your IT / VPN admin or existing NetExtender GUI profile:

| Setting | Example |
|---------|---------|
| Profile name | `<your-profile>` |
| Server | `host:port` |
| Domain | `<your-domain>` |
| Username | `<your-username>` |
| Password | *(your VPN password)* |

### Step 4 — Build from source (this repo)

```bash
cd C:\workspace\netextender-mcp
npm install
npm run build
```

### Step 5 — Configure Cursor MCP

Edit `%USERPROFILE%\.cursor\mcp.json`:

```json
{
  "mcpServers": {
    "netextender": {
      "command": "node",
      "args": ["C:/workspace/netextender-mcp/dist/index.js"],
      "env": {
        "NETEXTENDER_CLI": "C:/Program Files/SonicWall/SSL-VPN/NetExtender/nxcli.exe",
        "NETEXTENDER_PROFILE": "<your-profile>",
        "NETEXTENDER_SERVER": "host:port",
        "NETEXTENDER_DOMAIN": "<your-domain>",
        "NETEXTENDER_USERNAME": "<your-username>",
        "NETEXTENDER_PASSWORD": "<your-password>",
        "NETEXTENDER_ALWAYS_TRUST": "true"
      }
    }
  }
}
```

### Step 6 — Restart MCP

- **Cursor:** Settings → MCP → toggle netextender off/on, or restart Cursor.
- Check stderr for: `NetExtender MCP Server Started`

### Step 7 — Verify with `vpn_status`

In chat:

> Run **vpn_status** on netextender MCP.

Expected when connected:

```
VPN status: connected
- Username: ...
- Server: ...
- IPv4: ...
```

### Step 8 — Test connect / disconnect (optional)

> **vpn_disconnect**

> **vpn_connect**

---

## 5. What happens after installing the package

### npm install / npx

| Step | What happens |
|------|----------------|
| Download | Package `@mhdd_24/netextender-mcp` fetched from npm registry |
| Contents | `dist/` (compiled JS), `README.md`, `docs/WIKI.md`, `package.json` |
| Bin | `netextender-mcp` → `dist/index.js` |
| Dependencies | `@modelcontextprotocol/sdk`, `zod`, `dotenv` installed |

### MCP client starts the server

```
command: npx -y @mhdd_24/netextender-mcp
   or: netextender-mcp
   or: node C:/workspace/netextender-mcp/dist/index.js
```

1. Node executes `dist/index.js`.
2. `dotenv.config()` loads optional local `.env`.
3. `validateEnv()` — **fails fast** if `nxcli.exe` path does not exist.
4. `McpServer` created with name/version from `NE.SERVER`.
5. `registerTools()` wires all four VPN tools.
6. `StdioServerTransport` connects — **stdout = MCP**; logs use **stderr**.
7. Server waits for JSON-RPC messages.

### When you ask the AI to connect VPN

1. Client sends `tools/call` with `name: "vpn_connect"`.
2. Tool handler checks current status via `nxcli status`.
3. If disconnected, upserts profile (when server configured) and runs `nxcli connect`.
4. Re-checks status and returns formatted summary (password masked in output).
5. Result text returned to the AI → shown in chat.

---

## 6. Configuration reference

### Three ways to supply config

| Method | When to use |
|--------|-------------|
| **MCP `env` block** | Production — Cursor, Claude, etc. (recommended) |
| **`.env` file** | Local `npm run dev` |
| **Tool arguments** | Override profile/server/user/pass per call |

Copy `.env.example` to `.env` for local development:

```bash
cp .env.example .env
# Edit .env — never commit it
```

### Config constants vs secrets

| Type | Location | Examples |
|------|----------|----------|
| **Constants** | `src/config/netextender.config.ts` (`NE`) | CLI paths, timeouts, tool names, messages |
| **Secrets** | MCP env or `.env` | VPN username, password |

---

## 7. Using the MCP tools

### `vpn_status`

**Purpose:** Check VPN connection state and session details.

**Parameters:** none

**Example prompt:** *Run vpn_status on netextender MCP.*

---

### `list_vpn_profiles`

**Purpose:** List saved NetExtender connection profiles.

**Parameters:**

| Name | Required | Description |
|------|----------|-------------|
| `profileName` | No | Filter to a specific profile |

**Note:** While VPN is connected, SonicWall CLI may return session status instead of a profile list.

**Example prompt:** *List vpn profiles on netextender MCP.*

---

### `vpn_connect`

**Purpose:** Connect to VPN.

**Parameters:**

| Name | Required | Description |
|------|----------|-------------|
| `profileName` | No | Profile name; defaults to `NETEXTENDER_PROFILE` |
| `server` | No* | `host:port`; defaults to `NETEXTENDER_SERVER` |
| `domain` | No* | VPN domain; defaults to `NETEXTENDER_DOMAIN` |
| `username` | No* | Defaults to `NETEXTENDER_USERNAME` |
| `password` | No* | Defaults to `NETEXTENDER_PASSWORD` |
| `alwaysTrust` | No | Pass `--always-trust` to nxcli |

\* Required when creating/updating a profile from server credentials.

**Example prompts:**

> vpn_connect

> vpn_connect using profile `<your-profile>`

**Success response:**

```
VPN connected

VPN status: connected
- Username: ...
- Server: ...
...
```

---

### `vpn_disconnect`

**Purpose:** Disconnect active VPN session.

**Parameters:** none

**Example prompt:** *vpn_disconnect on netextender MCP.*

---

## 8. Request flow (end to end)

### `vpn_connect` sequence

```
1. MCP client → tools/call vpn_connect { profileName?, server?, ... }
2. connectTool.ts
   a. getVpnStatus() → already connected? return early
   b. Resolve profileName, server, domain, username, password from args + env
   c. If server set → upsertProfile() via nxcli connection add --force
   d. runNxcli(['connect', profileName, '--always-trust'?])
   e. getVpnStatus() → formatStatusText()
   f. maskSecrets() on password in output
3. Tool returns text summary → MCP client → AI → user
```

### `vpn_status` sequence

```
1. MCP client → tools/call vpn_status {}
2. statusTool.ts → getVpnStatus()
3. runNxcli(['status'])
4. parseVpnStatus() — looks for "NetExtender has been connected"
5. formatStatusText() → return to client
```

---

## 9. Project folder structure

```
netextender-mcp/
├── docs/
│   └── WIKI.md                 ← this file
├── src/
│   ├── index.ts                ← MCP entry point
│   ├── env.ts                  ← env resolution + validateEnv()
│   ├── config/
│   │   └── netextender.config.ts
│   ├── interfaces/
│   │   └── netextender.ts
│   ├── services/
│   │   └── netextenderCliService.ts
│   └── tools/
│       ├── index.ts
│       ├── statusTool.ts
│       ├── listProfilesTool.ts
│       ├── connectTool.ts
│       └── disconnectTool.ts
├── dist/                       ← compiled output (after npm run build)
├── package.json
├── tsconfig.json
├── .env.example
├── .gitignore
├── .npmignore
└── README.md
```

---

## 10. Source code reference

| File | Responsibility |
|------|----------------|
| `src/index.ts` | `McpServer` bootstrap, `validateEnv()`, stdio transport |
| `src/env.ts` | Read env vars with aliases; auto-detect `nxcli.exe` |
| `src/config/netextender.config.ts` | `NE` constant object — single source of tool names and messages |
| `src/services/netextenderCliService.ts` | `spawn` nxcli, parse status, connect/disconnect orchestration |
| `src/tools/statusTool.ts` | Registers `vpn_status` |
| `src/tools/listProfilesTool.ts` | Registers `list_vpn_profiles` |
| `src/tools/connectTool.ts` | Registers `vpn_connect` |
| `src/tools/disconnectTool.ts` | Registers `vpn_disconnect` |

---

## 11. Environment variables

| Variable | Aliases | Required | Default | Purpose |
|----------|---------|----------|---------|---------|
| `NETEXTENDER_CLI` | `NETEXTENDER_EXE`, `NXCLI_EXE` | No* | Auto-detect | Path to `nxcli.exe` |
| `NETEXTENDER_PROFILE` | `NETEXTENDER_CONNECTION`, `VPN_PROFILE` | No | — | Default profile name |
| `NETEXTENDER_SERVER` | `VPN_SERVER` | No | — | Default `host:port` |
| `NETEXTENDER_DOMAIN` | `VPN_DOMAIN` | No | — | Default VPN domain |
| `NETEXTENDER_USERNAME` | `VPN_USERNAME` | No | — | Default username |
| `NETEXTENDER_PASSWORD` | `VPN_PASSWORD` | No | — | Default password |
| `NETEXTENDER_ALWAYS_TRUST` | `VPN_ALWAYS_TRUST` | No | `false` | `true` / `1` / `yes` → `--always-trust` |

\* Required if NetExtender is not installed in the default path.

---

## 12. Credentials and security

- **Never commit** VPN passwords to git.
- Store credentials only in MCP `env` or local `.env` (gitignored).
- `vpn_connect` masks the password in tool output via `maskSecrets()`.
- MCP stdio does not encrypt secrets in transit on your machine — same as other local MCP servers.
- Prefer a dedicated VPN account with least privilege if your org allows it.

---

## 13. Local development

```bash
cd C:\workspace\netextender-mcp
cp .env.example .env
# Edit .env with your VPN settings

npm install
npm run dev          # tsx src/index.ts — for quick iteration
npm run build        # tsc → dist/
node dist/index.js   # test compiled entry
```

Smoke test without MCP client:

```bash
node -e "import('./dist/services/netextenderCliService.js').then(m => m.getVpnStatus().then(s => console.log(m.formatStatusText(s))))"
```

---

## 14. Connecting MCP clients

### Cursor (recommended)

`%USERPROFILE%\.cursor\mcp.json`:

```json
"netextender": {
  "command": "node",
  "args": ["C:/workspace/netextender-mcp/dist/index.js"],
  "env": {
    "NETEXTENDER_CLI": "C:/Program Files/SonicWall/SSL-VPN/NetExtender/nxcli.exe",
    "NETEXTENDER_PROFILE": "<your-profile>",
    "NETEXTENDER_SERVER": "host:port",
    "NETEXTENDER_DOMAIN": "<your-domain>",
    "NETEXTENDER_USERNAME": "<username>",
    "NETEXTENDER_PASSWORD": "<password>",
    "NETEXTENDER_ALWAYS_TRUST": "true"
  }
}
```

**After npm publish:**

```json
"command": "npx",
"args": ["-y", "@mhdd_24/netextender-mcp"]
```

### Claude Desktop

`%APPDATA%\Claude\claude_desktop_config.json` — same `env` block under `mcpServers.netextender`.

---

## 15. Extending the project

### Add a new tool

1. Add tool metadata to `NE.TOOLS` in `src/config/netextender.config.ts`.
2. Create `src/tools/myTool.ts` with `registerMyTool(server)`.
3. Export from `src/tools/index.ts` and call in `registerTools()`.
4. Add nxcli wrapper logic in `netextenderCliService.ts` if needed.
5. Bump `NE.SERVER.VERSION` and `package.json` version.
6. Update this wiki and `README.md`.

### Possible future tools

| Tool idea | nxcli basis |
|-----------|-------------|
| `vpn_cancel` | `nxcli cancel` |
| `vpn_export_log` | `nxcli log export` |
| `vpn_add_profile` | `nxcli connection add` (without connect) |
| `vpn_delete_profile` | `nxcli connection delete` |

---

## 16. Troubleshooting

| Problem | Fix |
|---------|-----|
| MCP server won't start | Verify `NETEXTENDER_CLI` path exists; run `nxcli status` manually |
| `NetExtender CLI not found` | Install NetExtender 10.3+ or set `NETEXTENDER_CLI` |
| `username is required` | Set `NETEXTENDER_USERNAME` or pass `username` on `vpn_connect` |
| `password is required` | Set `NETEXTENDER_PASSWORD` in MCP env |
| Connect hangs / times out | OTP, Duo, or SAML may need manual GUI approval — not supported headless |
| Certificate errors | Set `NETEXTENDER_ALWAYS_TRUST=true` |
| `list_vpn_profiles` shows session info | Normal SonicWall behavior while connected — disconnect first or use `vpn_status` |
| Stale MCP after code change | Rebuild (`npm run build`) and restart MCP server |
| Wrong nxcli version | Use `nxcli.exe` from NetExtender 10.3+, not legacy `necli.exe` |

### Manual CLI debugging

```powershell
cd "C:\Program Files\SonicWall\SSL-VPN\NetExtender"
.\nxcli.exe status
.\nxcli.exe connection list
.\nxcli.exe disconnect
```

---

## 17. Publishing and post-release

### Maintainer checklist

1. Bump version in `package.json` and `NE.SERVER.VERSION` in `netextender.config.ts`.
2. Run `npm run build` and smoke-test with local `mcp.json`.
3. `npm publish --access public` (logged in as package owner).
4. Users on `npx` pick up latest after MCP restart.

### Version alignment

Keep these in sync on each release:

- `package.json` → `"version"`
- `src/config/netextender.config.ts` → `NE.SERVER.VERSION`

---

## Related projects (same MCP family)

| Package | Path | Purpose |
|---------|------|---------|
| `@mhdd_24/timelog-mcp` | `C:\workspace\timelog-mcp` | Log time to Azure DevOps |
| `@mhdd_24/flyway-mcp` | `C:\workspace\flyway-mcp` | Run Flyway migrations |
| `@mhdd_24/notepadpp-mcp` | `C:\workspace\notepadpp-mcp` | Open files in Notepad++ |

---

## License

ISC
