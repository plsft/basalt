// packages/mcp/src/tools.ts
// MCP tool definitions. Each tool: name + description + JSON Schema + handler.

import type { Verb } from "@basalt/core";
import { renderBrief } from "@basalt/core";
import { z } from "zod";
import type { VaultContext } from "./vault-context";

export interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (args: Record<string, unknown>) => Promise<{
    content: Array<{ type: "text"; text: string }>;
    isError?: boolean;
  }>;
}

const BriefInput = z.object({
  vault: z.string().optional(),
  section: z
    .enum(["all", "buried-insight", "connection", "contradiction", "implicit-thesis", "drift"])
    .optional(),
  top: z.number().int().min(1).max(10).optional(),
  format: z.enum(["json", "markdown"]).optional(),
});

const SectionOnlyInput = z.object({
  vault: z.string().optional(),
  top: z.number().int().min(1).max(10).optional(),
});

const AuditInput = z.object({
  vault: z.string().optional(),
});

function ok(text: string): { content: Array<{ type: "text"; text: string }> } {
  return { content: [{ type: "text", text }] };
}

function bad(message: string): { content: Array<{ type: "text"; text: string }>; isError: true } {
  return { content: [{ type: "text", text: message }], isError: true };
}

async function runBrief(
  ctx: VaultContext,
  section: Verb | "all",
  top: number,
  format: "json" | "markdown",
  vault?: string,
): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }> {
  const override = vault === undefined ? undefined : { vault };
  const engine = await ctx.buildEngine(override);
  try {
    const brief = await engine.brief({ section, top });
    return ok(renderBrief(brief, format));
  } finally {
    await engine.close();
  }
}

export function registerTools(ctx: VaultContext): McpTool[] {
  return [
    {
      name: "basalt_brief",
      description:
        "Generate the Basalt Brief. Runs all five verbs and returns a Brief object with citations. Output defaults to JSON for chat-tool consumption.",
      inputSchema: {
        type: "object",
        properties: {
          vault: { type: "string", description: "Override the default vault path." },
          section: {
            type: "string",
            enum: [
              "all",
              "buried-insight",
              "connection",
              "contradiction",
              "implicit-thesis",
              "drift",
            ],
            description: "Which section to compute. Default 'all'.",
          },
          top: {
            type: "integer",
            minimum: 1,
            maximum: 10,
            description: "Top N findings per verb.",
          },
          format: { type: "string", enum: ["json", "markdown"], description: "Output format." },
        },
      },
      async handler(args) {
        const parsed = BriefInput.safeParse(args);
        if (!parsed.success) return bad(`invalid input: ${parsed.error.message}`);
        const v = parsed.data;
        return await runBrief(ctx, v.section ?? "all", v.top ?? 3, v.format ?? "json", v.vault);
      },
    },
    sectionTool("basalt_connection", "connection", ctx),
    sectionTool("basalt_contradiction", "contradiction", ctx),
    sectionTool("basalt_drift", "drift", ctx),
    sectionTool("basalt_buried_insight", "buried-insight", ctx),
    sectionTool("basalt_implicit_thesis", "implicit-thesis", ctx),
    {
      name: "basalt_audit",
      description:
        "Re-evaluate pending Brief findings against current vault state. Requires the server to be started with --allow-write.",
      inputSchema: {
        type: "object",
        properties: {
          vault: { type: "string", description: "Override the default vault path." },
        },
      },
      async handler(args) {
        const parsed = AuditInput.safeParse(args);
        if (!parsed.success) return bad(`invalid input: ${parsed.error.message}`);
        if (!ctx.allowWrite) {
          return bad(
            "basalt_audit requires --allow-write at server startup (audit mutates finding state).",
          );
        }
        const auditOverride =
          parsed.data.vault === undefined ? undefined : { vault: parsed.data.vault };
        const engine = await ctx.buildEngine(auditOverride);
        try {
          const results = await engine.audit();
          return ok(JSON.stringify(results, null, 2));
        } finally {
          await engine.close();
        }
      },
    },
  ];
}

function sectionTool(name: string, section: Verb, ctx: VaultContext): McpTool {
  return {
    name,
    description: `Generate the ${section} section of the Basalt Brief.`,
    inputSchema: {
      type: "object",
      properties: {
        vault: { type: "string" },
        top: { type: "integer", minimum: 1, maximum: 10 },
      },
    },
    async handler(args) {
      const parsed = SectionOnlyInput.safeParse(args);
      if (!parsed.success) return bad(`invalid input: ${parsed.error.message}`);
      return await runBrief(ctx, section, parsed.data.top ?? 3, "json", parsed.data.vault);
    },
  };
}
