import { createHash } from "node:crypto";
import { appConfigSchema, type AppConfig } from "../config/config-schema.js";
import { PermissionEngine } from "./permission-engine.js";

export interface PolicyRuntimeSnapshot {
  readonly config: AppConfig;
  readonly permissions: PermissionEngine;
  readonly revision: string;
}

export class PolicyRuntimeRevisionConflictError extends Error {
  constructor(readonly expectedRevision: string, readonly actualRevision: string) {
    super("Active policy changed since it was read. Reload the current snapshot before retrying.");
    this.name = "PolicyRuntimeRevisionConflictError";
  }
}

/**
 * Owns the immutable policy snapshot used by a Core process.
 *
 * Reload builds and validates a complete replacement before publishing it.
 * Readers therefore observe either the previous or the next snapshot, never
 * a partially updated combination of permissions and limits.
 */
export class PolicyRuntime {
  #snapshot: PolicyRuntimeSnapshot;
  #reloadTail: Promise<void> = Promise.resolve();

  private constructor(snapshot: PolicyRuntimeSnapshot) {
    this.#snapshot = snapshot;
  }

  static async create(input: unknown): Promise<PolicyRuntime> {
    return new PolicyRuntime(await PolicyRuntime.#buildSnapshot(input));
  }

  getSnapshot(): PolicyRuntimeSnapshot {
    return this.#snapshot;
  }

  async reload(input: unknown, expectedRevision: string): Promise<PolicyRuntimeSnapshot> {
    const previousReload = this.#reloadTail;
    let release!: () => void;
    this.#reloadTail = new Promise<void>((resolve) => { release = resolve; });
    await previousReload;

    try {
      const current = this.#snapshot;
      if (current.revision !== expectedRevision) {
        throw new PolicyRuntimeRevisionConflictError(expectedRevision, current.revision);
      }

      // Do all asynchronous validation before publishing the replacement.
      const next = await PolicyRuntime.#buildSnapshot(input);
      this.#snapshot = next;
      return next;
    } finally {
      release();
    }
  }

  static async #buildSnapshot(input: unknown): Promise<PolicyRuntimeSnapshot> {
    const config = appConfigSchema.parse(input);
    const immutableConfig = Object.freeze({
      roots: Object.freeze(config.roots.map((root) => Object.freeze({
        path: root.path,
        permissions: Object.freeze([...root.permissions])
      }))),
      limits: Object.freeze({ ...config.limits })
    }) as unknown as AppConfig;
    const permissions = await PermissionEngine.create(immutableConfig);
    const revision = createHash("sha256")
      .update(JSON.stringify(immutableConfig), "utf8")
      .digest("hex");

    return Object.freeze({ config: immutableConfig, permissions, revision });
  }
}
