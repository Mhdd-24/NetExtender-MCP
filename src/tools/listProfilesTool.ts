import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { NE } from '../config/netextender.config.js';
import { listVpnProfiles } from '../services/netextenderCliService.js';

export function registerListProfilesTool(server: McpServer): void {
  const cfg = NE.TOOLS.LIST_PROFILES;
  server.tool(
    cfg.NAME,
    cfg.DESCRIPTION,
    { profileName: z.string().optional().describe(cfg.PROFILE_DESCRIPTION) },
    async ({ profileName }) => {
      try {
        const output = await listVpnProfiles(profileName);
        return { content: [{ type: 'text', text: output || '(no profiles found)' }] };
      } catch (error) {
        return {
          isError: true,
          content: [{
            type: 'text',
            text: `${NE.MESSAGES.GENERIC_ERROR_PREFIX} ${error instanceof Error ? error.message : cfg.FAILURE}`,
          }],
        };
      }
    },
  );
}
