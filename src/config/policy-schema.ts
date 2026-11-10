import { z } from "zod";
import { appConfigSchema, type AppConfig } from "./config-schema.js";

/**
 * Canonical, versioned policy document persisted by desktop management.
 * Incompatible changes must introduce a new schemaVersion and migration.
 */
export const policyDocumentSchema = z.object({
  schemaVersion: z.literal(1),
  roots: appConfigSchema.shape.roots,
  limits: appConfigSchema.shape.limits
}).strict();

export type PolicyDocument = z.infer<typeof policyDocumentSchema>;

export interface ParsedPolicyDocument {
  readonly document: PolicyDocument;
  readonly migratedFromLegacy: boolean;
}

function formatIssues(issues: readonly z.core.$ZodIssue[]): string {
  return issues.map((issue) => {
    const location = issue.path.length > 0 ? issue.path.join(".") : "policy";
    return `${location}: ${issue.message}`;
  }).join("; ");
}

/**
 * Parse either the current versioned document or the legacy unversioned
 * Core config. Legacy input is normalized in memory to schema version 1.
 * Unknown explicit versions are rejected rather than guessed or downgraded.
 */
export function parsePolicyDocument(input: unknown): ParsedPolicyDocument {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Policy document must be a JSON object.");
  }

  if (Object.hasOwn(input, "schemaVersion")) {
    const version = Reflect.get(input, "schemaVersion");
    if (version !== 1) {
      throw new Error(`Unsupported policy schema version: ${String(version)}.`);
    }

    const result = policyDocumentSchema.safeParse(input);
    if (!result.success) {
      throw new Error(`Policy validation failed: ${formatIssues(result.error.issues)}`);
    }

    return { document: result.data, migratedFromLegacy: false };
  }

  const legacyResult = appConfigSchema.safeParse(input);
  if (!legacyResult.success) {
    throw new Error(`Legacy policy validation failed: ${formatIssues(legacyResult.error.issues)}`);
  }

  return {
    document: {
      schemaVersion: 1,
      roots: legacyResult.data.roots,
      limits: legacyResult.data.limits
    },
    migratedFromLegacy: true
  };
}

/** Serialize only a validated versioned document in a stable readable form. */
export function serializePolicyDocument(input: PolicyDocument): string {
  const validated = policyDocumentSchema.parse(input);
  return `${JSON.stringify(validated, null, 2)}\n`;
}

/** Convert the versioned desktop policy into the Core's runtime config shape. */
export function toAppConfig(document: PolicyDocument): AppConfig {
  const validated = policyDocumentSchema.parse(document);
  return {
    roots: validated.roots,
    limits: validated.limits
  };
}
