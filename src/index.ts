import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { loadConfig } from "./config/config-loader.js";
import { createServer } from "./server/create-server.js";

async function main(): Promise<void> {
  const config = await loadConfig();
  await serveStdio(() => createServer(config));
  process.stderr.write("Local-Workspace-MCP started over stdio.\n");
}

main().catch((error: unknown) => {
  process.stderr.write(`Local-Workspace-MCP startup failed: ${error instanceof Error ? error.message : "Unknown error"}\n`);
  process.exitCode = 1;
});
