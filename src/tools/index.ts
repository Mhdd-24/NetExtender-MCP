import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { registerConnectTool } from './connectTool.js';
import { registerDisconnectTool } from './disconnectTool.js';
import { registerListProfilesTool } from './listProfilesTool.js';
import { registerStatusTool } from './statusTool.js';

export function registerTools(server: McpServer): void {
  registerStatusTool(server);
  registerListProfilesTool(server);
  registerConnectTool(server);
  registerDisconnectTool(server);
}
