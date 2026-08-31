import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { NE } from '../config/netextender.config.js';
import { formatStatusText, getVpnStatus } from '../services/netextenderCliService.js';

export function registerStatusTool(server: McpServer): void {
  const cfg = NE.TOOLS.STATUS;
  server.tool(cfg.NAME, cfg.DESCRIPTION, {}, async () => {
    try {
      const status = await getVpnStatus();
      return { content: [{ type: 'text', text: formatStatusText(status) }] };
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
