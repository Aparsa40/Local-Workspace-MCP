import { readFile } from "node:fs/promises";
import path from "node:path";
import { parsePolicyDocument, toAppConfig } from "./policy-schema.js";
import type { AppConfig } from "./config-schema.js";

export async function loadConfig(configPath = process.env.LWMCP_CONFIG ?? path.resolve("config/permissions.json")): Promise<AppConfig> {
  let raw: string;
  try {
    raw = await readFile(configPath, "utf8");
  } catch {
    throw new Error("Configuration file not found. Copy config/permissions.example.json to config/permissions.json and configure an explicit workspace root.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new Error("Configuration file contains invalid JSON.");
  }

  const { document } = parsePolicyDocument(parsed);
  const config = toAppConfig(document);

  for (const root of config.roots) {
    if (!path.isAbsolute(root.path)) {
      throw new Error("Every configured workspace root must be an absolute path.");
    }
  }

  return config;
}
