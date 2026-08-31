import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { NE } from '../config/netextender.config.js';
import { disconnectVpn, formatStatusText, getVpnStatus } from '../services/netextenderCliService.js';

export function registerDisconnectTool(server: McpServer): void {
  const cfg = NE.TOOLS.DISCONNECT;
  server.tool(cfg.NAME, cfg.DESCRIPTION, {}, async () => {
    try {
      const before = await getVpnStatus();
      if (!before.connected) {
        return {
          content: [{
            type: 'text',
            text: `${cfg.NOT_CONNECTED}\n\n${formatStatusText(before)}`,
          }],
        };
      }

      const output = await disconnectVpn();
      const after = await getVpnStatus();
      return {
        content: [{
          type: 'text',
          text: `${cfg.SUCCESS}\n\n${output}\n\n${formatStatusText(after)}`,
        }],
      };
    } catch (error) {
      return {
        isError: true,
        content: [{
          type: 'text',
          text: `${NE.MESSAGES.GENERIC_ERROR_PREFIX} ${error instanceof Error ? error.message : cfg.FAILURE}`,
        }],
      };
    }
  });
}
