import { realpath } from "node:fs/promises";
import path from "node:path";
import { isPathInside } from "./permission-engine.js";

const SENSITIVE_NAMES = new Set([
  ".env", "id_rsa", "id_ed25519", "credentials.json", "secrets.json"
]);
const WINDOWS_RESERVED_NAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;

function validateRelativePath(input: string): void {
  if (input === "" || input === ".") return;

  if (path.isAbsolute(input) || /^[a-zA-Z]:/.test(input) ||
      input.startsWith("\\\\?\\") || input.startsWith("\\\\.\\") ||
      input.startsWith("\\\\") || input.includes(":")) {
    throw new Error("Only relative paths without drive, UNC, or alternate-stream syntax are accepted.");
  }

  const segments = input.split(/[\\/]+/);
  if (segments.some((segment) =>
    segment === ".." || segment === "." || segment.endsWith(".") || segment.endsWith(" ")
  )) {
    throw new Error("Path traversal and ambiguous Windows path segments are not allowed.");
  }
  if (input.includes("\0")) throw new Error("Invalid path.");

  const lowerSegments = segments.map((segment) => segment.toLocaleLowerCase());
  if (lowerSegments.some((segment) =>
    SENSITIVE_NAMES.has(segment) ||
    segment.startsWith(".env.") ||
    WINDOWS_RESERVED_NAME.test(segment) ||
    segment.endsWith(".pem") ||
    segment.endsWith(".key") ||
    segment.endsWith(".p12") ||
    segment.endsWith(".pfx")
  )) {
    throw new Error("Access to sensitive credential files or reserved Windows names is blocked by default.");
  }
}

export async function resolveExistingPath(rootPath: string, relativePath: string): Promise<string> {
  validateRelativePath(relativePath);
  const root = await realpath(rootPath);
  const lexicalTarget = path.resolve(root, relativePath || ".");
  if (!isPathInside(root, lexicalTarget)) {
    throw new Error("Requested path is outside the authorized workspace.");
  }

  // realpath resolves symlinks/junctions before the final boundary check.
  const canonicalTarget = await realpath(lexicalTarget);
  if (!isPathInside(root, canonicalTarget)) {
    throw new Error("Resolved path escapes the authorized workspace.");
  }

  return canonicalTarget;
}
