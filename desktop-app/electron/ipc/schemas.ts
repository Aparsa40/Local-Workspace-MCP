import { z } from "zod";
import { policyDocumentSchema } from "../../../src/config/policy-schema.js";

const revisionSchema = z.string().regex(/^(?:[a-f0-9]{64})?$/);

export const emptyPayloadSchema = z.object({}).strict();
export const savePolicyPayloadSchema = z.object({
  proposal: policyDocumentSchema,
  expectedRevision: revisionSchema
}).strict();

export type SavePolicyPayload = z.infer<typeof savePolicyPayloadSchema>;

export const IPC_CHANNELS = {
  appStatus: "lwmcp:app:get-status",
  policyGet: "lwmcp:policy:get",
  policySave: "lwmcp:policy:save",
  coreStart: "lwmcp:core:start",
  coreStop: "lwmcp:core:stop",
  workspacePickDirectory: "lwmcp:workspace:pick-directory"
} as const;
