#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { NE } from './config/netextender.config.js';
import { validateEnv } from './env.js';
import { registerTools } from './tools/index.js';

validateEnv();

const server = new McpServer({
  name: NE.SERVER.NAME,
  version: NE.SERVER.VERSION,
});

registerTools(server);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(NE.SERVER.STARTUP_MESSAGE);
}

main().catch((error) => {
  console.error(NE.SERVER.FATAL_PREFIX, error);
  process.exit(1);
});
