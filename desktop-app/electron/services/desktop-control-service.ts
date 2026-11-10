import { createHash } from "node:crypto";
import type { PolicySnapshot, SavePolicyResult } from "./policy-store.js";
import { toAppConfig, type PolicyDocument } from "../../../src/config/policy-schema.js";
import type { ManagedCoreStatus } from "./core-process-manager.js";

export interface PolicyStorePort {
  hasStoredPolicy(): Promise<boolean>;
  load(): Promise<PolicySnapshot>;
  save(proposal: unknown, expectedRevision: string): Promise<SavePolicyResult>;
}

export interface CoreProcessManagerPort {
  getStatus(): ManagedCoreStatus;
  start(): Promise<ManagedCoreStatus>;
  reloadPolicy(config: unknown): Promise<string>;
  stop(): Promise<void>;
}

export interface DesktopControlServiceOptions {
  readonly policyStore: PolicyStorePort;
  readonly coreManager: CoreProcessManagerPort;
  readonly appVersion: string;
}

export interface PolicyReadResult {
  readonly configured: boolean;
  readonly document?: PolicySnapshot["document"];
  readonly revision?: string;
  readonly recoveredFromBackup?: boolean;
}

export interface DesktopAppStatus {
  readonly appVersion: string;
  readonly policyConfigured: boolean;
  /** Revision of the persisted versioned desktop policy document. */
  readonly policyRevision?: string;
  readonly core: {
    readonly state: ManagedCoreStatus["state"];
    readonly pid?: number;
    /** Revision reported by Core after parsing the runtime AppConfig. */
    readonly activeRevision?: string;
    readonly policyApplied: boolean;
  };
}

export interface PolicySaveResult {
  readonly configured: true;
  readonly savedRevision: string;
  readonly applied: boolean;
  readonly applyError?: "CORE_RELOAD_FAILED";
  readonly coreState: ManagedCoreStatus["state"];
  readonly activeRevision?: string;
}

export class DesktopControlService {
  readonly #policyStore: PolicyStorePort;
  readonly #coreManager: CoreProcessManagerPort;
  readonly #appVersion: string;

  constructor(options: DesktopControlServiceOptions) {
    this.#policyStore = options.policyStore;
    this.#coreManager = options.coreManager;
    this.#appVersion = options.appVersion;
  }

  async getPolicy(): Promise<PolicyReadResult> {
    try {
      const snapshot = await this.#policyStore.load();
      return {
        configured: true,
        document: snapshot.document,
        revision: snapshot.revision,
        recoveredFromBackup: snapshot.recoveredFromBackup
      };
    } catch (error) {
      if (isMissingFile(error) && !(await this.#policyStore.hasStoredPolicy())) {
        return { configured: false };
      }
      throw error;
    }
  }

  async getStatus(): Promise<DesktopAppStatus> {
    const policy = await this.getPolicy();
    const core = this.#coreManager.getStatus();
    const expectedCoreRevision = policy.document
      ? getCorePolicyRevision(policy.document)
      : undefined;
    const policyApplied = core.state === "running" &&
      expectedCoreRevision !== undefined &&
      core.revision === expectedCoreRevision;

    const coreStatus: DesktopAppStatus["core"] = {
      state: core.state,
      policyApplied,
      ...(core.pid !== undefined ? { pid: core.pid } : {}),
      ...(policyApplied && core.revision ? { activeRevision: core.revision } : {})
    };

    return {
      appVersion: this.#appVersion,
      policyConfigured: policy.configured,
      ...(policy.revision ? { policyRevision: policy.revision } : {}),
      core: coreStatus
    };
  }

  async startCore(): Promise<DesktopAppStatus> {
    const policy = await this.#policyStore.load();
    const expectedCoreRevision = getCorePolicyRevision(policy.document);
    const existing = this.#coreManager.getStatus();
    if (existing.state === "running") {
      if (existing.revision !== expectedCoreRevision) {
        throw new Error("The running Core does not enforce the saved policy. Stop it before starting again.");
      }
      return this.getStatus();
    }

    const started = await this.#coreManager.start();
    if (started.revision !== expectedCoreRevision) {
      await this.#coreManager.stop().catch(() => undefined);
      throw new Error("Core startup revision did not match the saved policy; the process was stopped.");
    }
    return this.getStatus();
  }

  async stopCore(): Promise<DesktopAppStatus> {
    await this.#coreManager.stop();
    return this.getStatus();
  }

  async savePolicy(proposal: unknown, expectedRevision: string): Promise<PolicySaveResult> {
    const saved: SavePolicyResult = await this.#policyStore.save(proposal, expectedRevision);
    const expectedCoreRevision = getCorePolicyRevision(saved.document);
    const running = this.#coreManager.getStatus();

    if (running.state !== "running") {
      return {
        configured: true,
        savedRevision: saved.revision,
        applied: false,
        coreState: running.state
      };
    }

    try {
      const activeRevision = await this.#coreManager.reloadPolicy(toAppConfig(saved.document));
      if (activeRevision !== expectedCoreRevision) {
        throw new Error("Core acknowledged a policy revision that differs from the normalized saved policy.");
      }
      return {
        configured: true,
        savedRevision: saved.revision,
        applied: true,
        coreState: this.#coreManager.getStatus().state,
        activeRevision
      };
    } catch {
      // A failed reload must not leave a known-old policy running. Stop the
      // managed process before reporting the saved policy as unapplied.
      await this.#coreManager.stop().catch(() => undefined);
      return {
        configured: true,
        savedRevision: saved.revision,
        applied: false,
        applyError: "CORE_RELOAD_FAILED",
        coreState: this.#coreManager.getStatus().state
      };
    }
  }

  async dispose(): Promise<void> {
    await this.#coreManager.stop();
  }
}

/**
 * Match PolicyRuntime's SHA-256 revision domain exactly: it hashes the
 * normalized, unversioned AppConfig JSON, not the versioned desktop document.
 */
export function getCorePolicyRevision(document: PolicyDocument): string {
  const normalizedConfig = toAppConfig(document);
  return createHash("sha256")
    .update(JSON.stringify(normalizedConfig), "utf8")
    .digest("hex");
}

function isMissingFile(error: unknown): boolean {
  return typeof error === "object" && error !== null &&
    "code" in error && error.code === "ENOENT";
}
