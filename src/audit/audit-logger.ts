export type AuditOutcome = "allowed" | "denied" | "error";

export function audit(event: {
  operation: string;
  outcome: AuditOutcome;
}): void {
  // stdout is reserved for MCP JSON-RPC. Never log resource paths or file contents.
  process.stderr.write(`${JSON.stringify({ timestamp: new Date().toISOString(), ...event })}\n`);
}
