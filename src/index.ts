import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { loadConfig } from "./config/config-loader.js";
import { createServer } from "./server/create-server.js";
import { PolicyRuntime } from "./security/policy-runtime.js";
import { startInheritedPolicyControlChannel } from "./desktop/inherited-control-channel.js";

async function main(): Promise<void> {
  const config = await loadConfig();
  const runtime = await PolicyRuntime.create(config);
  process.stderr.write("Local-Workspace-MCP starting over stdio.\n");
  await serveStdio(() => createServer(runtime));
}

main().catch((error: unknown) => {
  process.stderr.write(`Local-Workspace-MCP startup failed: ${error instanceof Error ? error.message : "Unknown error"}\n`);
  process.exitCode = 1;
});
