import { open, opendir, stat } from "node:fs/promises";
import path from "node:path";
import type { AppConfig, Capability } from "../../config/config-schema.js";
import type { PermissionEngine } from "../../security/permission-engine.js";
import { resolveExistingPath } from "../../security/path-validator.js";

export class FilesystemService {
  constructor(
    private readonly policy: PermissionEngine,
    private readonly config: AppConfig
  ) {}

  private async resolve(relativePath: string, capability: Capability): Promise<{ target: string; root: string }> {
    for (const configuredRoot of this.config.roots) {
      try {
        const target = await resolveExistingPath(configuredRoot.path, relativePath);
        const authorized = this.policy.authorize(target, capability);
        return { target, root: authorized.path };
      } catch (error) {
        if (error instanceof Error && error.message === "Access denied by workspace policy.") {
          throw error;
        }
        // The requested relative path may not exist under this configured root.
      }
    }
    throw new Error("Requested resource is unavailable or not authorized.");
  }

  private async isChildAllowed(root: string, absolutePath: string, capability: Capability): Promise<boolean> {
    try {
      const relative = path.relative(root, absolutePath);
      const canonical = await resolveExistingPath(root, relative);
      this.policy.authorize(canonical, capability);
      return true;
    } catch {
      // Do not disclose entries belonging to a more-restricted root or outside the workspace.
      return false;
    }
  }

  async listFiles(relativePath: string): Promise<Array<{ name: string; type: "file" | "directory" | "other" }>> {
    const { target, root } = await this.resolve(relativePath, "list");
    const visible: Array<{ name: string; type: "file" | "directory" | "other" }> = [];
    const directory = await opendir(target);

    for await (const entry of directory) {
      if (visible.length >= this.config.limits.maxListEntries) break;
      if (entry.isSymbolicLink()) continue;
      const absolute = path.join(target, entry.name);
      if (!(await this.isChildAllowed(root, absolute, "list"))) continue;
      visible.push({
        name: entry.name,
        type: entry.isFile() ? "file" : entry.isDirectory() ? "directory" : "other"
      });
    }

    return visible;
  }

  async readTextFile(relativePath: string): Promise<string> {
    const { target } = await this.resolve(relativePath, "read");
    const handle = await open(target, "r");
    try {
      const details = await handle.stat();
      if (!details.isFile()) throw new Error("Requested resource is not a regular file.");
      if (details.size > this.config.limits.maxFileBytes) throw new Error("File exceeds the configured size limit.");

      const chunks: Buffer[] = [];
      let totalBytes = 0;
      const maxBytes = this.config.limits.maxFileBytes;

      // Enforce the limit while reading too, in case the file grows after stat().
      while (true) {
        const remaining = maxBytes + 1 - totalBytes;
        const buffer = Buffer.alloc(Math.min(64 * 1024, remaining));
        const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);
        if (bytesRead === 0) break;
        totalBytes += bytesRead;
        if (totalBytes > maxBytes) throw new Error("File exceeds the configured size limit.");
        chunks.push(buffer.subarray(0, bytesRead));
      }

      return Buffer.concat(chunks, totalBytes).toString("utf8");
    } finally {
      await handle.close();
    }
  }

  async getFileInfo(relativePath: string): Promise<{ name: string; type: string; size: number; modifiedAt: string }> {
    const { target } = await this.resolve(relativePath, "metadata");
    const details = await stat(target);
    return {
      name: path.basename(target),
      type: details.isDirectory() ? "directory" : details.isFile() ? "file" : "other",
      size: details.size,
      modifiedAt: details.mtime.toISOString()
    };
  }

  async searchFiles(relativePath: string, query: string): Promise<string[]> {
    if (!query.trim() || query.length > 200) throw new Error("Search query must contain 1–200 characters.");
    const { target, root } = await this.resolve(relativePath, "search");
    const results: string[] = [];

    const walk = async (directoryPath: string, depth: number): Promise<void> => {
      if (depth > this.config.limits.maxSearchDepth || results.length >= this.config.limits.maxSearchResults) return;
      const directory = await opendir(directoryPath);

      for await (const entry of directory) {
        if (results.length >= this.config.limits.maxSearchResults) break;
        if (entry.isSymbolicLink()) continue;
        const absolute = path.join(directoryPath, entry.name);
        if (!(await this.isChildAllowed(root, absolute, "search"))) continue;

        if (entry.isDirectory()) {
          await walk(absolute, depth + 1);
        } else if (entry.isFile() && entry.name.toLocaleLowerCase().includes(query.toLocaleLowerCase())) {
          results.push(path.relative(root, absolute));
        }
      }
    };

    await walk(target, 0);
    return results;
  }
}
