import { realpath } from "node:fs/promises";
import path from "node:path";
import type { AppConfig, Capability } from "../config/config-schema.js";

export interface AuthorizedRoot {
  readonly path: string;
  readonly permissions: ReadonlySet<Capability>;
}

export function isPathInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

export class PermissionEngine {
  private constructor(private readonly roots: AuthorizedRoot[]) {}

  static async create(config: AppConfig): Promise<PermissionEngine> {
    const roots: AuthorizedRoot[] = [];
    for (const configuredRoot of config.roots) {
      const canonicalRoot = await realpath(configuredRoot.path);
      if (roots.some((root) => root.path === canonicalRoot)) {
        throw new Error("Duplicate workspace roots are not allowed.");
      }
      roots.push({
        path: canonicalRoot,
        permissions: new Set(configuredRoot.permissions)
      });
    }
    return new PermissionEngine(roots);
  }

  authorize(targetPath: string, capability: Capability): AuthorizedRoot {
    const selectedRoot = this.roots
      .filter((root) => isPathInside(root.path, targetPath))
      .sort((a, b) => b.path.length - a.path.length)[0];

    // The most-specific root wins. Missing capabilities are denied, not inherited.
    if (!selectedRoot || !selectedRoot.permissions.has(capability)) {
      throw new Error("Access denied by workspace policy.");
    }

    return selectedRoot;
  }
}
