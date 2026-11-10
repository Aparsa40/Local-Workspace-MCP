import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { z } from "zod";
import type { Duplex } from "node:stream";

const MAX_CONTROL_MESSAGE_BYTES = 64 * 1024;

const controlResponseSchema = z.discriminatedUnion("ok", [
  z.object({
    protocolVersion: z.literal(1),
    requestId: z.string().uuid(),
    ok: z.literal(true),
    result: z.object({ revision: z.string().regex(/^[a-f0-9]{64}$/) }).strict()
  }).strict(),
  z.object({
    protocolVersion: z.literal(1),
    requestId: z.string().uuid(),
    ok: z.literal(false),
    error: z.object({
      code: z.enum(["INVALID_REQUEST", "INVALID_POLICY", "REVISION_CONFLICT", "INTERNAL_ERROR"]),
      message: z.string().max(256)
    }).strict()
  }).strict()
]);

type ControlResponse = z.infer<typeof controlResponseSchema>;
type ManagerState = "stopped" | "starting" | "running" | "stopping" | "failed";

interface PendingRequest {
  readonly resolve: (revision: string) => void;
  readonly reject: (error: Error) => void;
  readonly timer: ReturnType<typeof setTimeout>;
}

export interface CoreProcessManagerOptions {
  readonly executablePath: string;
  readonly args?: readonly string[];
  readonly cwd: string;
  readonly configPath: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly startupTimeoutMs?: number;
  readonly requestTimeoutMs?: number;
  readonly stopTimeoutMs?: number;
  readonly maxStderrBytes?: number;
}

export interface ManagedCoreStatus {
  readonly state: ManagerState;
  readonly pid?: number;
  readonly revision?: string;
  readonly exitCode?: number | null;
  readonly signal?: NodeJS.Signals | null;
  readonly stderrTail: string;
}

export class CoreProcessManagerError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "CoreProcessManagerError";
  }
}

/**
 * Owns one Electron-managed Core child. MCP stdio is drained privately while
 * policy management uses only inherited descriptors 3/4.
 */
export class CoreProcessManager {
  readonly #options: {
    readonly executablePath: string;
    readonly args: readonly string[];
    readonly cwd: string;
    readonly configPath: string;
    readonly env: NodeJS.ProcessEnv;
    readonly startupTimeoutMs: number;
    readonly requestTimeoutMs: number;
    readonly stopTimeoutMs: number;
    readonly maxStderrBytes: number;
  };
  #child: ChildProcess | undefined;
  #controlInput: Duplex | undefined;
  #controlOutput: Duplex | undefined;
  #state: ManagerState = "stopped";
  #revision: string | undefined;
  #responseBuffer = Buffer.alloc(0);
  #stderrTail = Buffer.alloc(0);
  #pending = new Map<string, PendingRequest>();
  #reloadTail: Promise<void> = Promise.resolve();

  constructor(options: CoreProcessManagerOptions) {
    if (!path.isAbsolute(options.executablePath) ||
        !path.isAbsolute(options.cwd) ||
        !path.isAbsolute(options.configPath)) {
      throw new Error("Core executable, working directory, and config paths must be absolute.");
    }

    this.#options = {
      executablePath: options.executablePath,
      cwd: options.cwd,
      configPath: options.configPath,
      args: options.args,
      env: options.env,
      startupTimeoutMs: options.startupTimeoutMs ?? 10_000,
      requestTimeoutMs: options.requestTimeoutMs ?? 5_000,
      stopTimeoutMs: options.stopTimeoutMs ?? 3_000,
      maxStderrBytes: options.maxStderrBytes ?? 16 * 1024
    };

    for (const value of [
      this.#options.startupTimeoutMs,
      this.#options.requestTimeoutMs,
      this.#options.stopTimeoutMs,
      this.#options.maxStderrBytes
    ]) {
      if (!Number.isInteger(value) || value < 1) {
        throw new Error("Core process manager limits must be positive integers.");
      }
    }
    if (this.#options.maxStderrBytes > 256 * 1024) {
      throw new Error("Core stderr capture limit cannot exceed 256 KiB.");
    }
  }

  async start(): Promise<ManagedCoreStatus> {
    if (this.#state === "starting" || this.#state === "running" || this.#state === "stopping") {
      throw new CoreProcessManagerError("ALREADY_RUNNING", "The managed Core process is already active.");
    }

    this.#state = "starting";
    this.#revision = undefined;
    this.#responseBuffer = Buffer.alloc(0);
    this.#stderrTail = Buffer.alloc(0);
    this.#pending.clear();

    const child = spawn(
      this.#options.executablePath,
      [...this.#options.args],
      {
        cwd: this.#options.cwd,
        env: {
          ...process.env,
          ...this.#options.env,
          LWMCP_CONFIG: this.#options.configPath,
          LWMCP_CONTROL_CHANNEL: "1"
        },
        stdio: ["pipe", "pipe", "pipe", "pipe", "pipe"],
        windowsHide: true
      }
    );
    this.#child = child;

    const controlInput = child.stdio[3];
    const controlOutput = child.stdio[4];
    if (!controlInput || !("write" in controlInput) || !controlOutput || !("on" in controlOutput)) {
      child.kill();
      this.#state = "failed";
      throw new CoreProcessManagerError("CONTROL_PIPE_UNAVAILABLE", "The managed Core did not expose its required control pipes.");
    }

    this.#controlInput = controlInput as Duplex;
    this.#controlOutput = controlOutput as Duplex;
    child.stdout?.on("data", () => undefined);
    child.stderr?.on("data", (chunk: Buffer) => this.#captureStderr(chunk));
    this.#controlOutput.on("data", (chunk: Buffer) => this.#consumeControlData(chunk));
    this.#controlOutput.on("error", () => this.#failControlChannel());
    this.#controlOutput.on("end", () => {
      if (this.#state === "starting" || this.#state === "running") this.#failControlChannel();
    });
    this.#controlInput.on("error", () => this.#failControlChannel());

    child.once("exit", (code, signal) => {
      this.#state = this.#state === "stopping" ? "stopped" : "failed";
      this.#rejectPending(new CoreProcessManagerError(
        "PROCESS_EXITED",
        `Managed Core exited before completing the requested operation (code: ${String(code)}, signal: ${String(signal)}).`
      ));
    });
    child.once("error", () => {
      this.#state = "failed";
      this.#rejectPending(new CoreProcessManagerError("SPAWN_FAILED", "The managed Core process could not be started."));
    });

    try {
      await this.#waitForSpawn(child);
      this.#revision = await this.#sendRequest("policy.getRevision", {});
      this.#state = "running";
      return this.getStatus();
    } catch (error) {
      this.#state = "failed";
      child.kill();
      this.#rejectPending(error instanceof Error ? error : new Error("Managed Core startup failed."));
      throw error;
    }
  }

  getStatus(): ManagedCoreStatus {
    const status: {
      state: ManagerState;
      stderrTail: string;
      pid?: number;
      revision?: string;
      exitCode?: number | null;
      signal?: NodeJS.Signals | null;
    } = {
      state: this.#state,
      stderrTail: this.#stderrTail.toString("utf8")
    };
    if (this.#child?.pid !== undefined) status.pid = this.#child.pid;
    if (this.#revision !== undefined) status.revision = this.#revision;
    if (this.#child) {
      status.exitCode = this.#child.exitCode;
      status.signal = this.#child.signalCode;
    }
    return status;
  }

  async reloadPolicy(config: unknown): Promise<string> {
    const task = this.#reloadTail.then(async () => {
      if (this.#state !== "running" || !this.#revision) {
        throw new CoreProcessManagerError("NOT_RUNNING", "No active managed Core process is available for policy reload.");
      }
      const revision = await this.#sendRequest("policy.reload", {
        expectedRevision: this.#revision,
        config
      });
      this.#revision = revision;
      return revision;
    });
    this.#reloadTail = task.then(() => undefined, () => undefined);
    return task;
  }

  async stop(): Promise<void> {
    const child = this.#child;
    if (!child || child.exitCode !== null || child.signalCode !== null) {
      this.#state = "stopped";
      return;
    }

    this.#state = "stopping";
    this.#controlInput?.end();
    child.stdin?.end();

    const exited = await this.#waitForExit(child, this.#options.stopTimeoutMs);
    if (!exited) {
      child.kill();
      const killed = await this.#waitForExit(child, this.#options.stopTimeoutMs);
      if (!killed) {
        this.#state = "failed";
        throw new CoreProcessManagerError("STOP_TIMEOUT", "The managed Core process did not exit after termination.");
      }
    }
    this.#rejectPending(new CoreProcessManagerError("PROCESS_STOPPED", "The managed Core process was stopped."));
    this.#state = "stopped";
    this.#revision = undefined;
  }

  async #waitForSpawn(child: ChildProcess): Promise<void> {
    if (child.pid !== undefined) return;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        child.kill();
        reject(new CoreProcessManagerError("STARTUP_TIMEOUT", "The managed Core process did not start in time."));
      }, this.#options.startupTimeoutMs);
      child.once("spawn", () => {
        clearTimeout(timer);
        resolve();
      });
      child.once("error", () => {
        clearTimeout(timer);
        reject(new CoreProcessManagerError("SPAWN_FAILED", "The managed Core process could not be started."));
      });
    });
  }

  async #waitForExit(child: ChildProcess, timeoutMs: number): Promise<boolean> {
    if (child.exitCode !== null || child.signalCode !== null) return true;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        child.off("exit", onExit);
        resolve(false);
      }, timeoutMs);
      const onExit = () => {
        clearTimeout(timer);
        resolve(true);
      };
      child.once("exit", onExit);
    });
  }

  #sendRequest(method: "policy.getRevision", params: Record<string, never>): Promise<string>;
  #sendRequest(method: "policy.reload", params: { expectedRevision: string; config: unknown }): Promise<string>;
  #sendRequest(method: string, params: object): Promise<string> {
    if (!this.#controlInput || !this.#child || this.#child.exitCode !== null) {
      return Promise.reject(new CoreProcessManagerError("NOT_RUNNING", "The managed Core control channel is unavailable."));
    }

    const requestId = randomUUID();
    const frame = `${JSON.stringify({ protocolVersion: 1, requestId, method, params })}\n`;
    if (Buffer.byteLength(frame, "utf8") > MAX_CONTROL_MESSAGE_BYTES) {
      return Promise.reject(new CoreProcessManagerError("REQUEST_TOO_LARGE", "The policy control request exceeds 64 KiB."));
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(requestId);
        reject(new CoreProcessManagerError("CONTROL_TIMEOUT", "The Core did not respond to the management request in time."));
      }, this.#options.requestTimeoutMs);
      this.#pending.set(requestId, { resolve, reject, timer });
      this.#controlInput?.write(frame, "utf8", (error?: Error | null) => {
        if (error) {
          const pending = this.#pending.get(requestId);
          if (pending) {
            clearTimeout(pending.timer);
            this.#pending.delete(requestId);
            reject(new CoreProcessManagerError("CONTROL_WRITE_FAILED", "The policy control request could not be delivered."));
          }
        }
      });
    });
  }

  #consumeControlData(chunk: Buffer): void {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    this.#responseBuffer = Buffer.concat([this.#responseBuffer, bytes]);

    while (true) {
      const newline = this.#responseBuffer.indexOf(0x0a);
      if (newline === -1) break;
      if (newline > MAX_CONTROL_MESSAGE_BYTES) {
        this.#failControlChannel();
        return;
      }

      const frame = this.#responseBuffer.subarray(0, newline);
      this.#responseBuffer = this.#responseBuffer.subarray(newline + 1);
      let response: ControlResponse;
      try {
        response = controlResponseSchema.parse(JSON.parse(frame.toString("utf8")) as unknown);
      } catch {
        this.#failControlChannel();
        return;
      }

      const pending = this.#pending.get(response.requestId);
      if (!pending) {
        this.#failControlChannel();
        return;
      }
      clearTimeout(pending.timer);
      this.#pending.delete(response.requestId);
      if (response.ok) pending.resolve(response.result.revision);
      else pending.reject(new CoreProcessManagerError(response.error.code, response.error.message));
    }

    if (this.#responseBuffer.length > MAX_CONTROL_MESSAGE_BYTES) {
      this.#failControlChannel();
    }
  }

  #captureStderr(chunk: Buffer): void {
    const combined = Buffer.concat([this.#stderrTail, chunk]);
    this.#stderrTail = combined.subarray(Math.max(0, combined.length - this.#options.maxStderrBytes));
  }

  #failControlChannel(): void {
    this.#state = "failed";
    this.#rejectPending(new CoreProcessManagerError("CONTROL_PROTOCOL_FAILED", "The managed Core control channel failed."));
    this.#child?.kill();
  }

  #rejectPending(error: Error): void {
    for (const pending of this.#pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.#pending.clear();
  }
}
