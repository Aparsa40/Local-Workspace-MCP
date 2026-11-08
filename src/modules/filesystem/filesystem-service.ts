import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import type { AppConfig, Capability } from "../../config/config-schema.js";
import { PermissionEngine } from "../../security/permission-engine.js";
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

  async listFiles(relativePath: string): Promise<Array<{ name: string; type: "file" | "directory" | "other" }>> {
    const { target } = await this.resolve(relativePath, "list");
    const entries = await readdir(target, { withFileTypes: true });
    return entries.map((entry) => ({
      name: entry.name,
      type: entry.isFile() ? "file" : entry.isDirectory() ? "directory" : "other"
    }));
  }

  async readTextFile(relativePath: string): Promise<string> {
    const { target } = await this.resolve(relativePath, "read");
    const details = await stat(target);
    if (!details.isFile()) throw new Error("Requested resource is not a regular file.");
    if (details.size > this.config.limits.maxFileBytes) throw new Error("File exceeds the configured size limit.");
    return readFile(target, "utf8");
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

    const walk = async (directory: string, depth: number): Promise<void> => {
      if (depth > this.config.limits.maxSearchDepth || results.length >= this.config.limits.maxSearchResults) return;
      const entries = await readdir(directory, { withFileTypes: true });
      for (const entry of entries) {
        if (results.length >= this.config.limits.maxSearchResults) break;
        if (entry.isSymbolicLink()) continue;
        const absolute = path.join(directory, entry.name);
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
