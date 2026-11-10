import path from "node:path";
import { z } from "zod";
import { PolicyStore } from "./services/policy-store.js";
import { CoreProcessManager } from "./services/core-process-manager.js";
import { DesktopControlService } from "./services/desktop-control-service.js";
import {
  emptyPayloadSchema,
  IPC_CHANNELS,
  savePolicyPayloadSchema
} from "./ipc/schemas.js";

interface IpcEventLike {
  readonly sender: unknown;
}

interface IpcMainLike {
  handle(
    channel: string,
    listener: (event: IpcEventLike, payload?: unknown) => Promise<unknown>
  ): void;
  removeHandler(channel: string): void;
}

export interface ElectronMainRuntimeOptions {
  readonly appDataPath: string;
  readonly coreEntryPath: string;
  readonly electronExecutablePath: string;
  readonly appVersion: string;
  readonly ipcMain: IpcMainLike;
  readonly isTrustedSender: (event: IpcEventLike) => boolean;
}

interface IpcFailure {
  readonly ok: false;
  readonly error: {
    readonly code: string;
    readonly message: string;
  };
}

interface IpcSuccess<T> {
  readonly ok: true;
  readonly value: T;
}

type IpcResult<T> = IpcSuccess<T> | IpcFailure;

const channels = Object.values(IPC_CHANNELS);

export class ElectronMainRuntime {
  readonly #ipcMain: IpcMainLike;
  readonly #service: DesktopControlService;
  readonly #isTrustedSender: (sender: unknown) => boolean;

  constructor(options: ElectronMainRuntimeOptions) {
    if (!path.isAbsolute(options.appDataPath) || !path.isAbsolute(options.coreEntryPath) ||
        !path.isAbsolute(options.electronExecutablePath)) {
      throw new Error("Electron runtime paths must be absolute.");
    }

    this.#ipcMain = options.ipcMain;
    this.#isTrustedSender = options.isTrustedSender;

    const policyPath = path.join(options.appDataPath, "policy.json");
    const policyStore = new PolicyStore({ filePath: policyPath });
    const coreManager = new CoreProcessManager({
      executablePath: options.electronExecutablePath,
      args: [options.coreEntryPath],
      cwd: path.dirname(options.coreEntryPath),
      configPath: policyPath,
      env: { ELECTRON_RUN_AS_NODE: "1" }
    });

    this.#service = new DesktopControlService({
      policyStore,
      coreManager,
      appVersion: options.appVersion
    });

    this.#register(IPC_CHANNELS.appStatus, emptyPayloadSchema, () => this.#service.getStatus());
    this.#register(IPC_CHANNELS.policyGet, emptyPayloadSchema, () => this.#service.getPolicy());
    this.#register(IPC_CHANNELS.policySave, savePolicyPayloadSchema, (payload) =>
      this.#service.savePolicy(payload.proposal, payload.expectedRevision));
    this.#register(IPC_CHANNELS.coreStart, emptyPayloadSchema, () => this.#service.startCore());
    this.#register(IPC_CHANNELS.coreStop, emptyPayloadSchema, () => this.#service.stopCore());
  }

  async dispose(): Promise<void> {
    for (const channel of channels) this.#ipcMain.removeHandler(channel);
    await this.#service.dispose();
  }

  #register<T>(
    channel: string,
    schema: z.ZodType<T>,
    action: (payload: T) => Promise<unknown>
  ): void {
    this.#ipcMain.handle(channel, async (event, payload) => {
      if (!this.#isTrustedSender(event)) {
        return failure("UNTRUSTED_SENDER", "This window is not allowed to call the desktop API.");
      }

      const parsed = schema.safeParse(payload ?? {});
      if (!parsed.success) {
        return failure("INVALID_ARGUMENT", "The request payload is invalid.");
      }

      try {
        return success(await action(parsed.data));
      } catch (error) {
        return failure(
          getErrorCode(error),
          getSafeErrorMessage(error)
        );
      }
    });
  }
}

function success<T>(value: T): IpcSuccess<T> {
  return { ok: true, value };
}

function failure(code: string, message: string): IpcFailure {
  return { ok: false, error: { code, message } };
}

function getErrorCode(error: unknown): string {
  if (typeof error === "object" && error !== null && "code" in error &&
      typeof error.code === "string" && /^[A-Z0-9_]{1,64}$/.test(error.code)) {
    return error.code;
  }
  return "REQUEST_FAILED";
}

function getSafeErrorMessage(error: unknown): string {
  if (error instanceof Error && error.name === "PolicyRevisionConflictError") {
    return "The policy changed in another operation. Reload it before saving.";
  }
  if (error instanceof Error && error.name === "CoreProcessManagerError") {
    return error.message.slice(0, 240);
  }
  return "The requested desktop operation could not be completed.";
}
