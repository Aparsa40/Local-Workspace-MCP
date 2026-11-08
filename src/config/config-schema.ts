import { z } from "zod";

export const capabilitySchema = z.enum(["list", "read", "search", "metadata"]);

export const appConfigSchema = z.object({
  roots: z.array(z.object({
    path: z.string().min(1),
    permissions: z.array(capabilitySchema)
  }).strict()).min(1),
  limits: z.object({
    maxFileBytes: z.number().int().positive().max(10_485_760).default(1_048_576),
    maxListEntries: z.number().int().positive().max(2_000).default(500),
    maxSearchResults: z.number().int().positive().max(500).default(100),
    maxSearchDepth: z.number().int().min(0).max(10).default(5)
  }).prefault({})
}).strict();

export type AppConfig = z.infer<typeof appConfigSchema>;
export type Capability = z.infer<typeof capabilitySchema>;
