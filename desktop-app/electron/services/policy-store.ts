import { createHash, randomUUID } from "node:crypto";
import {
  copyFile,
  mkdir,
  open,
  readFile,
  realpath,
  rename,
  rm,
  stat
} from "node:fs/promises";
import path from "node:path";
import {
  parsePolicyDocument,
  serializePolicyDocument,
  type PolicyDocument
} from "../../../src/config/policy-schema.js";

export interface PolicySnapshot {
  readonly document: PolicyDocument;
  readonly revision: string;
  readonly recoveredFromBackup: boolean;
}

export interface SavePolicyResult extends PolicySnapshot {
  readonly previousRevision: string;
}

export interface PolicyStoreOptions {
  readonly filePath: string;
  readonly backupPath?: string;
  readonly fileOperations?: Partial<PolicyStoreFileOperations>;
}

/** Narrow filesystem seam used to exercise persistence failures deterministically. */
export interface PolicyStoreFileOperations {
  readonly copyFile: typeof copyFile;
  readonly rename: typeof rename;
}

export class PolicyRevisionConflictError extends Error {
  constructor(readonly expectedRevision: string, readonly actualRevision: string) {
    super("Policy has changed since it was loaded. Reload it before saving.");
    this.name = "PolicyRevisionConflictError";
  }
}

export class PolicyStore {
  readonly #filePath: string;
  readonly #backupPath: string;
  #saveTail: Promise<void> = Promise.resolve();
  readonly #fileOperations: PolicyStoreFileOperations;

  constructor(options: PolicyStoreOptions) {
    if (!path.isAbsolute(options.filePath)) {
      throw new Error("Policy file path must be absolute.");
    }
    this.#filePath = path.resolve(options.filePath);
    this.#fileOperations = {
      copyFile: options.fileOperations?.copyFile ?? copyFile,
      rename: options.fileOperations?.rename ?? rename
    };
    this.#backupPath = path.resolve(options.backupPath ?? `${this.#filePath}.bak`);
    if (this.#backupPath === this.#filePath) {
      throw new Error("Policy backup path must differ from the active policy path.");
    }
  }

  async hasStoredPolicy(): Promise<boolean> {
    for (const filePath of [this.#filePath, this.#backupPath]) {
      try {
        await stat(filePath);
        return true;
      } catch (error) {
        if (!this.#isMissingFileAtPath(error, filePath)) throw error;
      }
    }
    return false;
  }

  async load(): Promise<PolicySnapshot> {
    try {
      const document = await this.#readValidated(this.#filePath);
      return this.#snapshot(document, false);
    } catch (primaryError) {
      // Recover only when the active policy file itself is missing. An ENOENT
      // raised while resolving a workspace root must never select an older
      // backup policy and silently restore stale permissions.
      if (!this.#isMissingFileAtPath(primaryError, this.#filePath)) {
        throw primaryError;
      }
    }

    const backup = await this.#readValidated(this.#backupPath);
    return this.#snapshot(backup, true);
  }

  async save(
    proposal: unknown,
    expectedRevision: string
  ): Promise<SavePolicyResult> {
    // Serialize saves issued through this store instance so two IPC requests
    // cannot both pass the same revision check and overwrite one another.
    const previousSave = this.#saveTail;
    let release!: () => void;
    this.#saveTail = new Promise<void>((resolve) => { release = resolve; });
    await previousSave;
    try {
      return await this.#saveUnlocked(proposal, expectedRevision);
    } finally {
      release();
    }
  }

  async #saveUnlocked(
    proposal: unknown,
    expectedRevision: string
  ): Promise<SavePolicyResult> {
    const validated = await this.#validateWorkspaceRoots(proposal);
    const serialized = serializePolicyDocument(validated);
    const nextRevision = this.#revision(serialized);
    const directory = path.dirname(this.#filePath);
    await mkdir(directory, { recursive: true });

    let currentRevision = "";
    let hasCurrent = false;
    try {
      const currentDocument = await this.#readValidated(this.#filePath);
      currentRevision = this.#revision(serializePolicyDocument(currentDocument));
      hasCurrent = true;
    } catch (error) {
      if (!this.#isMissingFileAtPath(error, this.#filePath)) throw error;
    }

    if (currentRevision !== expectedRevision) {
      throw new PolicyRevisionConflictError(expectedRevision, currentRevision);
    }

    const temporaryPath = path.join(directory, `.${path.basename(this.#filePath)}.${randomUUID()}.tmp`);
    const backupTemporaryPath = `${this.#backupPath}.${randomUUID()}.tmp`;
    let handle: Awaited<ReturnType<typeof open>> | undefined;

    try {
      handle = await open(temporaryPath, "wx", 0o600);
      await handle.writeFile(serialized, "utf8");
      await handle.sync();
      await handle.close();
      handle = undefined;

      if (hasCurrent) {
        await mkdir(path.dirname(this.#backupPath), { recursive: true });
        await this.#fileOperations.copyFile(this.#filePath, backupTemporaryPath);
        const backupHandle = await open(backupTemporaryPath, "r+");
        try {
          await backupHandle.sync();
        } finally {
          await backupHandle.close();
        }
        await this.#fileOperations.rename(backupTemporaryPath, this.#backupPath);
      }

      // Same-directory rename keeps the replacement on the same volume.
      // Node uses the platform's rename primitive; Windows behavior is covered by CI.
      await this.#fileOperations.rename(temporaryPath, this.#filePath);

      const saved = await this.#readValidated(this.#filePath);
      const savedRevision = this.#revision(serializePolicyDocument(saved));
      if (savedRevision !== nextRevision) {
        throw new Error("Saved policy verification failed: revision mismatch.");
      }

      return {
        document: saved,
        revision: savedRevision,
        previousRevision: currentRevision,
        recoveredFromBackup: false
      };
    } finally {
      if (handle) await handle.close().catch(() => undefined);
      await rm(temporaryPath, { force: true }).catch(() => undefined);
      await rm(backupTemporaryPath, { force: true }).catch(() => undefined);
    }
  }

  async #validateWorkspaceRoots(input: unknown): Promise<PolicyDocument> {
    const parsed = parsePolicyDocument(input).document;
    const seen = new Set<string>();
    const roots = [];

    for (const root of parsed.roots) {
      if (!path.isAbsolute(root.path)) {
        throw new Error("Every workspace root must be an absolute path.");
      }

      const canonicalPath = await realpath(root.path);
      const details = await stat(canonicalPath);
      if (!details.isDirectory()) {
        throw new Error(`Workspace root is not a directory: ${root.path}`);
      }

      const identity = process.platform === "win32"
        ? canonicalPath.toLocaleLowerCase("en-US")
        : canonicalPath;
      if (seen.has(identity)) {
        throw new Error(`Duplicate canonical workspace root: ${canonicalPath}`);
      }
      seen.add(identity);
      roots.push({ path: canonicalPath, permissions: root.permissions });
    }

    return parsePolicyDocument({
      schemaVersion: parsed.schemaVersion,
      roots,
      limits: parsed.limits
    }).document;
  }

  async #readValidated(filePath: string): Promise<PolicyDocument> {
    const raw = await readFile(filePath, "utf8");
    const parsed: unknown = JSON.parse(raw);
    return this.#validateWorkspaceRoots(parsePolicyDocument(parsed).document);
  }

  #snapshot(document: PolicyDocument, recoveredFromBackup: boolean): PolicySnapshot {
    return {
      document,
      revision: this.#revision(serializePolicyDocument(document)),
      recoveredFromBackup
    };
  }

  #revision(serialized: string): string {
    return createHash("sha256").update(serialized, "utf8").digest("hex");
  }

  #isMissingFileAtPath(error: unknown, expectedPath: string): boolean {
    return typeof error === "object" && error !== null &&
      "code" in error && error.code === "ENOENT" &&
      "path" in error && typeof error.path === "string" &&
      path.resolve(error.path) === expectedPath;
  }
}
