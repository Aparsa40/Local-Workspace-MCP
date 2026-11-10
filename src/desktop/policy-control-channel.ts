import { once } from "node:events";
import type { Readable, Writable } from "node:stream";
import { z } from "zod";
import { appConfigSchema } from "../config/config-schema.js";
import { PolicyRuntime, PolicyRuntimeRevisionConflictError } from "../security/policy-runtime.js";

const MAX_CONTROL_MESSAGE_BYTES = 64 * 1024;

const controlRequestSchema = z.object({
  protocolVersion: z.literal(1),
  requestId: z.string().uuid(),
  method: z.literal("policy.reload"),
  params: z.object({
    expectedRevision: z.string().regex(/^[a-f0-9]{64}$/),
    config: appConfigSchema
  }).strict()
}).strict();

type ControlRequest = z.infer<typeof controlRequestSchema>;

interface ControlResponse {
  readonly protocolVersion: 1;
  readonly requestId: string | null;
  readonly ok: boolean;
  readonly result?: { readonly revision: string };
  readonly error?: {
    readonly code: "INVALID_REQUEST" | "INVALID_POLICY" | "REVISION_CONFLICT" | "INTERNAL_ERROR";
    readonly message: string;
  };
}

export interface PolicyControlChannelOptions {
  /** Private inherited pipe from the trusted desktop main process. */
  readonly input: Readable;
  /** Private inherited pipe back to the trusted desktop main process. */
  readonly output: Writable;
  readonly runtime: PolicyRuntime;
  readonly maxMessageBytes?: number;
}

/**
 * Serve newline-delimited, versioned management messages on dedicated inherited
 * pipes. MCP stdin/stdout are deliberately not used or modified.
 *
 * The caller is responsible for attaching only OS-created private pipes owned
 * by the desktop main process. Never expose these streams to an MCP tool or renderer.
 */
export async function servePolicyControlChannel(
  options: PolicyControlChannelOptions
): Promise<void> {
  const maxMessageBytes = options.maxMessageBytes ?? MAX_CONTROL_MESSAGE_BYTES;
  if (!Number.isInteger(maxMessageBytes) || maxMessageBytes < 1 || maxMessageBytes > MAX_CONTROL_MESSAGE_BYTES) {
    throw new Error("Invalid policy control message limit.");
  }

  let pending = Buffer.alloc(0);

  for await (const chunk of options.input) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
    let offset = 0;

    while (offset < bytes.length) {
      const newline = bytes.indexOf(0x0a, offset);
      const end = newline === -1 ? bytes.length : newline;
      const segment = bytes.subarray(offset, end);

      if (pending.length + segment.length > maxMessageBytes) {
        throw new Error("Policy control message exceeds the configured size limit.");
      }
      pending = pending.length === 0
        ? Buffer.from(segment)
        : Buffer.concat([pending, segment]);

      if (newline === -1) break;

      const frame = pending;
      pending = Buffer.alloc(0);
      await handleFrame(frame, options.runtime, options.output);
      offset = newline + 1;
    }
  }

  // A final unterminated frame is intentionally discarded. A request is valid
  // only when the sender completes its newline-delimited frame.
}

async function handleFrame(
  frame: Buffer,
  runtime: PolicyRuntime,
  output: Writable
): Promise<void> {
  const content = frame.length > 0 && frame[frame.length - 1] === 0x0d
    ? frame.subarray(0, frame.length - 1)
    : frame;

  let parsed: unknown;
  try {
    parsed = JSON.parse(content.toString("utf8")) as unknown;
  } catch {
    await writeResponse(output, {
      protocolVersion: 1,
      requestId: null,
      ok: false,
      error: { code: "INVALID_REQUEST", message: "Control request must be valid JSON." }
    });
    return;
  }

  const requestId = typeof parsed === "object" && parsed !== null &&
    "requestId" in parsed && typeof parsed.requestId === "string" &&
    z.string().uuid().safeParse(parsed.requestId).success
    ? parsed.requestId
    : null;

  const validation = controlRequestSchema.safeParse(parsed);
  if (!validation.success) {
    await writeResponse(output, {
      protocolVersion: 1,
      requestId,
      ok: false,
      error: { code: "INVALID_REQUEST", message: "Control request does not match the supported protocol." }
    });
    return;
  }

  await applyRequest(validation.data, runtime, output);
}

async function applyRequest(
  request: ControlRequest,
  runtime: PolicyRuntime,
  output: Writable
): Promise<void> {
  try {
    const snapshot = await runtime.reload(request.params.config, request.params.expectedRevision);
    await writeResponse(output, {
      protocolVersion: 1,
      requestId: request.requestId,
      ok: true,
      result: { revision: snapshot.revision }
    });
  } catch (error) {
    if (error instanceof PolicyRuntimeRevisionConflictError) {
      await writeResponse(output, {
        protocolVersion: 1,
        requestId: request.requestId,
        ok: false,
        error: {
          code: "REVISION_CONFLICT",
          message: "The active Core policy changed. Read the current revision before retrying."
        }
      });
      return;
    }

    const isPolicyError = error instanceof z.ZodError ||
      (error instanceof Error && /policy|root|directory|path|permission/i.test(error.message));
    await writeResponse(output, {
      protocolVersion: 1,
      requestId: request.requestId,
      ok: false,
      error: isPolicyError
        ? { code: "INVALID_POLICY", message: "The proposed policy could not be validated." }
        : { code: "INTERNAL_ERROR", message: "The Core could not apply the policy update." }
    });
  }
}

async function writeResponse(output: Writable, response: ControlResponse): Promise<void> {
  const frame = `${JSON.stringify(response)}\n`;
  if (!output.write(frame, "utf8")) {
    await once(output, "drain");
  }
}
