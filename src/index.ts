import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { loadConfig } from "./config/config-loader.js";
import { createServer } from "./server/create-server.js";
import { PolicyRuntime } from "./security/policy-runtime.js";

async function main(): Promise<void> {
  const config = await loadConfig();
  process.stderr.write("Local-Workspace-MCP starting over stdio.\n");
  await serveStdio(() => createServer(config));
}

main().catch((error: unknown) => {
  process.stderr.write(`Local-Workspace-MCP startup failed: ${error instanceof Error ? error.message : "Unknown error"}\n`);
  process.exitCode = 1;
});
