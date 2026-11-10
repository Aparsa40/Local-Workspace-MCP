import { fstatSync } from "node:fs";
import { loadConfig } from "../../src/config/config-loader.js";
import { startInheritedPolicyControlChannel } from "../../src/desktop/inherited-control-channel.js";
import { PolicyRuntime } from "../../src/security/policy-runtime.js";

for (const descriptor of [3, 4]) {
  try {
    const stats = fstatSync(descriptor);
    process.stderr.write(`PIPE_DEBUG ${descriptor} fifo=${stats.isFIFO()} socket=${stats.isSocket()} file=${stats.isFile()} char=${stats.isCharacterDevice()}\\n`);
  } catch (error) {
    process.stderr.write(`PIPE_DEBUG ${descriptor} error=${error instanceof Error ? error.message : "unknown"}\\n`);
  }
}
const config = await loadConfig();
const runtime = await PolicyRuntime.create(config);
const controlChannel = startInheritedPolicyControlChannel(runtime);
if (!controlChannel) {
  throw new Error("Managed Core control channel was not enabled.");
}
void controlChannel.catch(() => {
  process.exitCode = 1;
  process.stdin.destroy();
});
process.stdin.resume();
