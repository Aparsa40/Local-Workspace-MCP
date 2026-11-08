import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import type { AppConfig } from "../config/config-schema.js";
import { audit } from "../audit/audit-logger.js";
import { FilesystemService } from "../modules/filesystem/filesystem-service.js";
import { PermissionEngine } from "../security/permission-engine.js";

export async function createServer(config: AppConfig): Promise<McpServer> {
  const policy = await PermissionEngine.create(config);
  const filesystem = new FilesystemService(policy, config);
  const server = new McpServer({ name: "local-workspace-mcp", version: "0.1.0" });

  server.registerTool("list_files", {
    description: "List entries in a directory relative to an explicitly authorized workspace root.",
    inputSchema: z.object({ path: z.string().default("") })
  }, async ({ path: relativePath }) => {
    try {
      const entries = await filesystem.listFiles(relativePath);
      audit({ operation: "list_files", outcome: "allowed" });
      return { content: [{ type: "text", text: JSON.stringify(entries, null, 2) }] };
    } catch (error) {
      audit({ operation: "list_files", outcome: "denied" });
      return { isError: true, content: [{ type: "text", text: error instanceof Error ? error.message : "Request failed." }] };
    }
  });

  server.registerTool("read_file", {
    description: "Read a UTF-8 text file from an explicitly authorized workspace root. File size is bounded by policy.",
    inputSchema: z.object({ path: z.string().min(1) })
  }, async ({ path: relativePath }) => {
    try {
      const content = await filesystem.readTextFile(relativePath);
      audit({ operation: "read_file", outcome: "allowed" });
      return { content: [{ type: "text", text: content }] };
    } catch (error) {
      audit({ operation: "read_file", outcome: "denied" });
      return { isError: true, content: [{ type: "text", text: error instanceof Error ? error.message : "Request failed." }] };
    }
  });

  server.registerTool("get_file_info", {
    description: "Return limited metadata for a file or directory inside an authorized root.",
    inputSchema: { path: z.string().min(1) }
  }, async ({ path: relativePath }) => {
    try {
      const info = await filesystem.getFileInfo(relativePath);
      audit({ operation: "get_file_info", outcome: "allowed" });
      return { content: [{ type: "text", text: JSON.stringify(info, null, 2) }] };
    } catch (error) {
      audit({ operation: "get_file_info", outcome: "denied" });
      return { isError: true, content: [{ type: "text", text: error instanceof Error ? error.message : "Request failed." }] };
    }
  });

  server.registerTool("search_files", {
    description: "Find file names matching a query inside an authorized directory. Traversal depth and result count are bounded.",
    inputSchema: z.object({ path: z.string().default(""), query: z.string().min(1).max(200) })
  }, async ({ path: relativePath, query }) => {
    try {
      const matches = await filesystem.searchFiles(relativePath, query);
      audit({ operation: "search_files", outcome: "allowed" });
      return { content: [{ type: "text", text: JSON.stringify(matches, null, 2) }] };
    } catch (error) {
      audit({ operation: "search_files", outcome: "denied" });
      return { isError: true, content: [{ type: "text", text: error instanceof Error ? error.message : "Request failed." }] };
    }
  });

  return server;
}
