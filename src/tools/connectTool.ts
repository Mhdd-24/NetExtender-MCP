import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { NE } from '../config/netextender.config.js';
import {
  connectVpn,
  formatStatusText,
  getVpnStatus,
  maskSecrets,
} from '../services/netextenderCliService.js';

export function registerConnectTool(server: McpServer): void {
  const cfg = NE.TOOLS.CONNECT;
  server.tool(
    cfg.NAME,
    cfg.DESCRIPTION,
    {
      profileName: z.string().optional().describe(cfg.PROFILE_DESCRIPTION),
      server: z.string().optional().describe(cfg.SERVER_DESCRIPTION),
      domain: z.string().optional().describe(cfg.DOMAIN_DESCRIPTION),
      username: z.string().optional().describe(cfg.USERNAME_DESCRIPTION),
      password: z.string().optional().describe(cfg.PASSWORD_DESCRIPTION),
      otp: z.string().optional().describe(cfg.OTP_DESCRIPTION),
      alwaysTrust: z.boolean().optional().describe(cfg.ALWAYS_TRUST_DESCRIPTION),
    },
    async (input) => {
      try {
        const before = await getVpnStatus();
        if (before.connected) {
          return {
            content: [{
              type: 'text',
              text: `${cfg.ALREADY_CONNECTED}\n\n${formatStatusText(before)}`,
            }],
          };
        }

        const raw = await connectVpn(input);
        const after = await getVpnStatus();
        const secrets = [input.password, input.otp].filter((value): value is string => !!value);
        if (!after.connected) {
          throw new Error(`${cfg.FAILURE}: ${maskSecrets(raw, secrets)}`);
        }
        return {
          content: [{
            type: 'text',
            text: `${cfg.SUCCESS}\n\n${maskSecrets(formatStatusText(after), secrets)}`,
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
    },
  );
}
