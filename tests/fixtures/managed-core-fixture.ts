import { loadConfig } from "../../src/config/config-loader.js";
import { startInheritedPolicyControlChannel } from "../../src/desktop/inherited-control-channel.js";
import { PolicyRuntime } from "../../src/security/policy-runtime.js";

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
