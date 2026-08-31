# @mhdd_24/netextender-mcp

MCP server for **SonicWall NetExtender** on Windows. Use it from [Cursor](https://cursor.com) or any MCP client to check VPN status, list profiles, connect, and disconnect via `nxcli.exe`.

Same layout as `@mhdd_24/timelog-mcp`: config-driven tools, env defaults, stdio MCP server.

**Full documentation:** [docs/WIKI.md](./docs/WIKI.md)

---

## Tools

| Tool | Purpose (timelog equivalent) |
|------|------------------------------|
| `vpn_status` | Check connection (`whoami`) |
| `list_vpn_profiles` | List saved profiles (`list_time_types`) |
| `vpn_connect` | Connect VPN (`log_time`) |
| `vpn_disconnect` | Disconnect VPN |

---

## Prerequisites

| Requirement | Notes |
|-------------|--------|
| **Windows** | Uses SonicWall `nxcli.exe` (NetExtender 10.3+) |
| **NetExtender installed** | Default path: `C:\Program Files\SonicWall\SSL-VPN\NetExtender\nxcli.exe` |
| **VPN credentials** | Set in MCP `env` or pass per tool call |

---

## Project layout

```
netextender-mcp/
  src/
    index.ts
    env.ts
    config/netextender.config.ts
    interfaces/netextender.ts
    services/netextenderCliService.ts
    tools/
      index.ts
      statusTool.ts
      listProfilesTool.ts
      connectTool.ts
      disconnectTool.ts
  package.json
  tsconfig.json
  README.md
```

---

## Local development

```bash
cd netextender-mcp
npm install
npm run build
npm run dev
```

Copy `.env.example` to `.env` for local testing.

---

## Configure Cursor

Add to `~/.cursor/mcp.json`:

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
        "NETEXTENDER_USERNAME": "<your-vpn-username>",
        "NETEXTENDER_PASSWORD": "<your-vpn-password>",
        "NETEXTENDER_ALWAYS_TRUST": "true"
      }
    }
  }
}
```

After publishing to npm:

```json
"netextender": {
  "command": "npx",
  "args": ["-y", "@mhdd_24/netextender-mcp"],
  "env": { ... }
}
```

Restart Cursor after saving.

---

## Environment variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `NETEXTENDER_CLI` | No* | Path to `nxcli.exe` (auto-detected) |
| `NETEXTENDER_PROFILE` | No | Default connection profile name |
| `NETEXTENDER_SERVER` | No | Default `host:port` |
| `NETEXTENDER_DOMAIN` | No | Default VPN domain |
| `NETEXTENDER_USERNAME` | No | Default username |
| `NETEXTENDER_PASSWORD` | No | Default password |
| `NETEXTENDER_ALWAYS_TRUST` | No | `true` to pass `--always-trust` |

\* Required if NetExtender is not in the default install path.

**Never commit** VPN passwords. Keep them in MCP `env` only.

---

## Usage in chat

> Run **vpn_status** on the netextender MCP.

> **vpn_connect** using profile `<your-profile>`.

> **vpn_disconnect**

> **list_vpn_profiles**

---

## Notes

- `nxcli connection list` may return current session status while connected (SonicWall CLI behavior).
- OTP / Duo / SAML flows may need interactive approval outside MCP.
- Uses `nxcli` from NetExtender **10.3+** (not legacy `necli.exe`).

---

## License

ISC
