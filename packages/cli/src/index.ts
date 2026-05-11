// packages/cli/src/index.ts
// `basalt` CLI entry. Wires Commander; each command lives in its own
// src/commands/ module.

import { Command } from "commander";
import kleur from "kleur";
import { aboutCommand } from "./commands/about";
import { auditCommand } from "./commands/audit";
import { briefCommand } from "./commands/brief";
import { demoCommand } from "./commands/demo";
import { indexCommand } from "./commands/index_";
import { initCommand } from "./commands/init";
import { promoteCommand } from "./commands/promote";
import { VERSION } from "./version";

const program = new Command();

program
  .name("basalt")
  .description("Reads your vault and surfaces what you believe but never wrote down.")
  .version(VERSION);

program
  .command("init")
  .description("Interactive setup — writes ~/.basalt/config.toml")
  .option("--vault <path>", "Vault path override")
  .action(async (opts) => {
    await initCommand(opts as { vault?: string });
  });

program
  .command("index")
  .description("Walk the vault, parse frontmatter, build link graph, embed.")
  .option("--vault <path>", "Vault path override")
  .option("--db <path>", "Index DB path override")
  .option("--force", "Re-embed every note regardless of cache.")
  .option("--skip-embed", "Skip Ollama embedding step.")
  .action(async (opts) => {
    await indexCommand(
      opts as { vault?: string; db?: string; force?: boolean; skipEmbed?: boolean },
    );
  });

program
  .command("brief")
  .description("Generate the Brief.")
  .option("--vault <path>", "Vault path override")
  .option("--db <path>", "Index DB path override")
  .option("-s, --section <name>", "Section to compute. Default 'all'.", "all")
  .option("--top <n>", "Top N findings per verb (1-10). Default 3.", "3")
  .option(
    "-f, --format <fmt>",
    "Output format: markdown | html | json. Default 'markdown'.",
    "markdown",
  )
  .action(async (opts) => {
    await briefCommand(
      opts as { vault?: string; db?: string; section?: string; top?: string; format?: string },
    );
  });

// Convenience aliases — same as `brief --section <name>`.
for (const verb of ["thesis", "drift", "connection", "contradiction", "buried"]) {
  const section =
    verb === "thesis" ? "implicit-thesis" : verb === "buried" ? "buried-insight" : verb;
  program
    .command(verb)
    .description(`Shortcut for 'brief --section ${section}'.`)
    .option("--vault <path>", "Vault path override")
    .option("--db <path>", "Index DB path override")
    .option("--top <n>", "Top N findings. Default 3.", "3")
    .option("-f, --format <fmt>", "Output format. Default 'markdown'.", "markdown")
    .action(async (opts) => {
      await briefCommand({
        ...(opts as { vault?: string; db?: string; top?: string; format?: string }),
        section,
      });
    });
}

program
  .command("promote <findingId>")
  .description("Promote a finding to a new vault note.")
  .option("--vault <path>", "Vault path override")
  .option("--db <path>", "Index DB path override")
  .option("--out <path>", "Override the output path")
  .action(async (findingId: string, opts) => {
    await promoteCommand(findingId, opts as { vault?: string; db?: string; out?: string });
  });

program
  .command("audit")
  .description("Re-evaluate pending Brief findings against the current vault state.")
  .option("--vault <path>", "Vault path override")
  .option("--db <path>", "Index DB path override")
  .action(async (opts) => {
    await auditCommand(opts as { vault?: string; db?: string });
  });

program
  .command("search <query>")
  .description("Cross-vault semantic search against the hosted API.")
  .option("--vault-id <id...>", "Scope to specific vault id(s). Repeatable.")
  .option("--top <n>", "Top N hits. Default 10.", "10")
  .option("--api-url <url>", "API base URL")
  .option("--api-token <token>", "API session token (or BASALT_API_TOKEN env)")
  .option("--json", "Emit raw JSON.")
  .action(async (query: string, opts) => {
    const o = opts as {
      vaultId?: string[];
      top?: string;
      apiUrl?: string;
      apiToken?: string;
      json?: boolean;
    };
    const { searchCommand } = await import("./commands/search");
    await searchCommand({
      query,
      ...(o.vaultId ? { vaultIds: o.vaultId } : {}),
      top: o.top ? Number.parseInt(o.top, 10) : 10,
      ...(o.apiUrl ? { apiUrl: o.apiUrl } : {}),
      ...(o.apiToken ? { apiToken: o.apiToken } : {}),
      ...(o.json ? { json: true } : {}),
    });
  });

program
  .command("demo")
  .description("Run an offline demo against the bundled sample vault.")
  .action(async () => {
    await demoCommand();
  });

program
  .command("about")
  .description("Show version, schema, and the Basalt mark.")
  .action(() => {
    aboutCommand();
  });

await program.parseAsync(process.argv).catch((err: unknown) => {
  console.error(kleur.red(`✗ ${(err as Error).message}`));
  process.exitCode = 1;
});
