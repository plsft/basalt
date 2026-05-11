// packages/mcp/src/index.ts
// `basalt-mcp` — MCP server over stdio. Tools mirror PRD §4.3:
//   basalt_brief / basalt_connection / basalt_contradiction /
//   basalt_drift / basalt_audit. Promote-to-note is intentionally NOT
//   exposed — file creation belongs to a surface where the user can see
//   the result, not a tool that returns text to a chat.

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { Command } from "commander";
import { registerTools } from "./tools";
import { resolveVaultContext } from "./vault-context";
import { VERSION } from "./version";

async function main(): Promise<void> {
  const program = new Command();
  program
    .name("basalt-mcp")
    .description("Basalt MCP server — exposes Briefs + verbs as MCP tools.")
    .option("--vault <path>", "Default vault path. Overridable per call.")
    .option("--db <path>", "Index DB path override.")
    .option("--ollama-url <url>", "Ollama HTTP endpoint.")
    .option("--embedding-model <model>", "Embedding model.")
    .option("--allow-write", "Permit `audit` to mutate calibration state.")
    .parse(process.argv);
  const cliOpts = program.opts<{
    vault?: string;
    db?: string;
    ollamaUrl?: string;
    embeddingModel?: string;
    allowWrite?: boolean;
  }>();

  const ctx = await resolveVaultContext({
    vault: cliOpts.vault,
    db: cliOpts.db,
    ollamaUrl: cliOpts.ollamaUrl,
    embeddingModel: cliOpts.embeddingModel,
    allowWrite: cliOpts.allowWrite ?? false,
  });

  const server = new Server({ name: "basalt", version: VERSION }, { capabilities: { tools: {} } });

  const tools = registerTools(ctx);
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
  }));
  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const tool = tools.find((t) => t.name === req.params.name);
    if (!tool) {
      return {
        content: [{ type: "text", text: `unknown tool: ${req.params.name}` }],
        isError: true,
      };
    }
    const args = (req.params.arguments ?? {}) as Record<string, unknown>;
    return await tool.handler(args);
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err: unknown) => {
  console.error(`basalt-mcp: fatal error: ${(err as Error).message}`);
  process.exit(1);
});
