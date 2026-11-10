import { createReadStream, createWriteStream, fstatSync } from "node:fs";
import { servePolicyControlChannel } from "./policy-control-channel.js";
import type { PolicyRuntime } from "../security/policy-runtime.js";

const CONTROL_INPUT_FD = 3;
const CONTROL_OUTPUT_FD = 4;

export type PipeInspector = (descriptor: number) => boolean;

/** Enable the management channel only when the trusted launcher opts in. */
export function isControlChannelEnabled(
  env: NodeJS.ProcessEnv = process.env,
  isPipe: PipeInspector = (descriptor) => {
    const details = fstatSync(descriptor);
    // Windows may report anonymous inherited pipe handles with mode 0 rather
    // than classifying them as FIFO/socket. A successful fstat that is not a
    // regular file, directory, character device, or block device is accepted.
    return details.isFIFO() || details.isSocket() ||
      (!details.isFile() && !details.isDirectory() &&
       !details.isCharacterDevice() && !details.isBlockDevice());
  }
): boolean {
  if (env.LWMCP_CONTROL_CHANNEL !== "1") return false;

  for (const descriptor of [CONTROL_INPUT_FD, CONTROL_OUTPUT_FD]) {
    let validPipe = false;
    try {
      validPipe = isPipe(descriptor);
    } catch {
      validPipe = false;
    }
    if (!validPipe) {
      throw new Error("Managed Core startup requires valid inherited policy-control pipes.");
    }
  }
  return true;
}

/**
 * Attach the Core-side management protocol to dedicated inherited descriptors.
 * The MCP transport continues to own process.stdin and process.stdout.
 */
export function startInheritedPolicyControlChannel(
  runtime: PolicyRuntime,
  env: NodeJS.ProcessEnv = process.env
): Promise<void> | undefined {
  if (!isControlChannelEnabled(env)) return undefined;

  const input = createReadStream(process.execPath, {
    fd: CONTROL_INPUT_FD,
    autoClose: false,
    highWaterMark: 16 * 1024
  });
  const output = createWriteStream(process.execPath, {
    fd: CONTROL_OUTPUT_FD,
    autoClose: false
  });

  return servePolicyControlChannel({ input, output, runtime });
}
