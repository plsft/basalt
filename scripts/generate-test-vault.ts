#!/usr/bin/env bun
// scripts/generate-test-vault.ts
//
// Deterministic synthetic vault generator. Same seed → same files (byte-for-byte),
// so the parity baseline is reproducible across machines. Default 200 notes.
//
// Usage:
//   bun run scripts/generate-test-vault.ts            # default seed=1556, dest=tests/parity/fixtures/test-vault-large
//   bun run scripts/generate-test-vault.ts --seed 42 --dest /tmp/v --count 100
//
// Layout — built so each of the 5 verbs has signal to find:
//   01-Daily/        45 daily notes spanning ~9 months (drift's lived-priority axis)
//   02-Projects/     4 projects, varying note counts (drift's stated-priority axis)
//   03-People/       10 people notes (used as wikilink targets)
//   04-Reading/      20 reading notes
//   05-References/   30 reference notes
//   06-MOCs/         6 high-link-density notes (hub-filter targets)
//   07-Insights/     remainder — old prose notes for Buried Insight / Implicit Thesis

import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import process from "node:process";

interface Args {
  seed: number;
  dest: string;
  count: number;
  today: string;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    seed: 1556,
    dest: "tests/parity/fixtures/test-vault-large",
    count: 200,
    today: "2026-05-09",
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = argv[i + 1];
    if (a === "--seed" && next) {
      args.seed = Number.parseInt(next, 10);
      i++;
    } else if (a === "--dest" && next) {
      args.dest = next;
      i++;
    } else if (a === "--count" && next) {
      args.count = Number.parseInt(next, 10);
      i++;
    } else if (a === "--today" && next) {
      args.today = next;
      i++;
    }
  }
  return args;
}

// mulberry32 — small, fast, deterministic PRNG. Seeded uint32 → uint32 stream.
function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: () => number, arr: readonly T[]): T {
  const v = arr[Math.floor(rng() * arr.length)];
  if (v === undefined) {
    throw new Error("pick: empty array");
  }
  return v;
}

function chance(rng: () => number, p: number): boolean {
  return rng() < p;
}

function range(rng: () => number, lo: number, hi: number): number {
  return Math.floor(rng() * (hi - lo + 1)) + lo;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, days: number): Date {
  const out = new Date(d);
  out.setUTCDate(out.getUTCDate() + days);
  return out;
}

const PROJECTS = ["Atlas", "Beacon", "Crucible", "Driftwood"] as const;

const PROJECT_NOTE_COUNTS: Record<(typeof PROJECTS)[number], number> = {
  Atlas: 22,
  Beacon: 14,
  Crucible: 9,
  Driftwood: 5,
};

const PEOPLE = [
  "Ada",
  "Bram",
  "Camille",
  "Dimitri",
  "Elena",
  "Felix",
  "Greta",
  "Hiro",
  "Ines",
  "Jonas",
] as const;

const READING_TITLES = [
  "Carse-1986",
  "Hofstadter-1979",
  "Polya-1945",
  "Kahneman-2011",
  "Stigler-1971",
  "Shannon-1948",
  "Lyotard-1979",
  "Berger-1972",
  "Sapolsky-2004",
  "Calvino-1972",
  "Kuhn-1962",
  "Mandelbrot-1982",
  "Hayek-1945",
  "Hardy-1940",
  "Knuth-1973",
  "Brooks-1975",
  "Wittgenstein-1953",
  "Bachelard-1938",
  "Feynman-1965",
  "Dijkstra-1972",
] as const;

const REFERENCE_TITLES = [
  "RAG-Patterns",
  "Microstructure-Primer",
  "Compounding-Patterns",
  "OFI-Validation",
  "Kalman-Filter",
  "Vector-DB-Choices",
  "Embedding-Stability",
  "Chunking-Strategies",
  "Schema-Evolution",
  "Cold-Start-Latency",
  "Distributed-Tracing",
  "Idempotent-Workers",
  "Retry-Backoff",
  "Eventual-Consistency",
  "Sharding-Choices",
  "Capacity-Planning",
  "Backpressure-Notes",
  "Failure-Modes",
  "P99-Discipline",
  "Cost-Modeling",
  "Privacy-Threat-Model",
  "Auth-Patterns",
  "Token-Lifetimes",
  "Webhook-Design",
  "Idempotency-Keys",
  "Migration-Playbook",
  "Sunset-Patterns",
  "Observability-Levels",
  "SLA-Negotiation",
  "On-Call-Rotation",
] as const;

// Re-used phrase fragments for prose generation. Different mixes per category.
const TOPICAL_OPENERS = [
  "The thing that keeps coming up is",
  "What I keep noticing in my own work is",
  "If you take the long view,",
  "When the tooling stops getting in the way,",
  "The bit I keep forgetting and re-deriving is",
  "Re-reading my old notes,",
] as const;

const CLAIM_LINES = [
  "the moat isn't speed alone — it's the user's willingness to keep coming back.",
  "the right abstraction is the one you can throw away in six months without panic.",
  "you can't fix a culture problem with tooling, but the wrong tooling rots a healthy one.",
  "compounding only happens to people who don't optimize for the next quarter.",
  "the index is the product. The interface is editorial.",
  "every system that survives a decade survived a dozen would-be replacements.",
  "what you measure is what you incentivize. What you publicize is what you actually value.",
  "trust is not a metric. It's a side effect of doing the boring thing for years.",
  "the cheapest correction happens when the constraint is still legible.",
  "I keep being wrong about how long the patient version takes — usually longer than I think, and worth it.",
] as const;

const REVERSAL_LINES = [
  "Actually, I was wrong about that.",
  "On reflection, the opposite is closer to true.",
  "Turns out the simple version doesn't scale the way I assumed.",
  "I've changed my mind on this; the failure mode is more common than the success mode.",
] as const;

const MOC_LINES = [
  "## Index",
  "",
  "Active threads — the through-lines I'm carrying right now.",
  "",
] as const;

interface NotePlan {
  relPath: string;
  body: string;
  frontmatter: {
    title: string;
    created: string;
    updated: string;
    tags?: readonly string[];
  };
}

function paragraph(rng: () => number, lines: number): string {
  const out: string[] = [];
  for (let i = 0; i < lines; i++) {
    const opener = pick(rng, TOPICAL_OPENERS);
    const claim = pick(rng, CLAIM_LINES);
    out.push(`${opener} ${claim}`);
    if (chance(rng, 0.25)) {
      out.push(pick(rng, REVERSAL_LINES));
    }
  }
  return out.join(" ");
}

function callout(rng: () => number): string {
  const claim = pick(rng, CLAIM_LINES);
  return ["> [!note] Worth pinning", `> ${claim}`].join("\n");
}

function wikilinks(rng: () => number, pool: readonly string[], count: number): string[] {
  const used = new Set<string>();
  const out: string[] = [];
  while (out.length < count && used.size < pool.length) {
    const target = pick(rng, pool);
    if (used.has(target)) continue;
    used.add(target);
    out.push(`[[${target}]]`);
  }
  return out;
}

function frontmatterBlock(fm: NotePlan["frontmatter"]): string {
  const lines = ["---", `title: "${fm.title}"`, `created: ${fm.created}`, `updated: ${fm.updated}`];
  if (fm.tags && fm.tags.length > 0) {
    lines.push(`tags: [${fm.tags.map((t) => `"${t}"`).join(", ")}]`);
  }
  lines.push("---", "");
  return lines.join("\n");
}

function buildPlans(args: Args): NotePlan[] {
  const rng = makeRng(args.seed);
  const today = new Date(`${args.today}T00:00:00Z`);
  const plans: NotePlan[] = [];

  const allTitles: string[] = [];

  // ── 02-Projects/<Name>/<Note>.md
  for (const project of PROJECTS) {
    const count = PROJECT_NOTE_COUNTS[project];
    for (let i = 0; i < count; i++) {
      const ageDays = range(rng, 30, 270);
      const created = addDays(today, -ageDays);
      const updated = addDays(created, range(rng, 0, 14));
      const stem =
        i === 0
          ? project
          : i === 1
            ? "HYPOTHESIS"
            : `${project}-Note-${String(i).padStart(2, "0")}`;
      const title = stem.replace(/-/g, " ");
      const body = [
        paragraph(rng, range(rng, 2, 4)),
        "",
        callout(rng),
        "",
        paragraph(rng, range(rng, 1, 3)),
      ].join("\n");
      plans.push({
        relPath: `02-Projects/${project}/${stem}.md`,
        body,
        frontmatter: {
          title,
          created: isoDate(created),
          updated: isoDate(updated),
          tags: [`project/${project.toLowerCase()}`],
        },
      });
      allTitles.push(stem);
    }
  }

  // ── 03-People/<Name>.md (short notes, low word counts to hit MIN_WORD_COUNT edges)
  for (const name of PEOPLE) {
    const ageDays = range(rng, 60, 540);
    const created = addDays(today, -ageDays);
    const updated = addDays(created, range(rng, 0, 30));
    const body = [`Notes on ${name}.`, "", paragraph(rng, range(rng, 1, 2))].join("\n");
    plans.push({
      relPath: `03-People/${name}.md`,
      body,
      frontmatter: {
        title: name,
        created: isoDate(created),
        updated: isoDate(updated),
        tags: ["people"],
      },
    });
    allTitles.push(name);
  }

  // ── 04-Reading/<Author-Year>.md
  for (const ref of READING_TITLES) {
    const ageDays = range(rng, 90, 720);
    const created = addDays(today, -ageDays);
    const updated = addDays(created, range(rng, 0, 60));
    const body = [
      paragraph(rng, range(rng, 2, 3)),
      "",
      callout(rng),
      "",
      paragraph(rng, range(rng, 1, 2)),
    ].join("\n");
    plans.push({
      relPath: `04-Reading/${ref}.md`,
      body,
      frontmatter: {
        title: ref,
        created: isoDate(created),
        updated: isoDate(updated),
        tags: ["reading"],
      },
    });
    allTitles.push(ref);
  }

  // ── 05-References/<Slug>.md
  for (const slug of REFERENCE_TITLES) {
    const ageDays = range(rng, 60, 480);
    const created = addDays(today, -ageDays);
    const updated = addDays(created, range(rng, 0, 90));
    const linkPool = allTitles.slice();
    const links = wikilinks(rng, linkPool, range(rng, 1, 3));
    const body = [
      paragraph(rng, range(rng, 2, 4)),
      "",
      `Related: ${links.join(", ")}.`,
      "",
      paragraph(rng, range(rng, 1, 2)),
    ].join("\n");
    plans.push({
      relPath: `05-References/${slug}.md`,
      body,
      frontmatter: {
        title: slug.replace(/-/g, " "),
        created: isoDate(created),
        updated: isoDate(updated),
        tags: ["reference"],
      },
    });
    allTitles.push(slug);
  }

  // ── 06-MOCs/<Slug>.md — high outgoing-link density (hub filter targets)
  const mocSlugs = [
    "MOC-Active",
    "MOC-Reading",
    "MOC-People",
    "MOC-Projects",
    "MOC-Trading",
    "MOC-Inbox",
  ];
  for (const slug of mocSlugs) {
    const ageDays = range(rng, 30, 365);
    const created = addDays(today, -ageDays);
    const updated = addDays(created, range(rng, 0, 30));
    const links = wikilinks(rng, allTitles, range(rng, 12, 20));
    const body = [...MOC_LINES, ...links.map((l) => `- ${l}`)].join("\n");
    plans.push({
      relPath: `06-MOCs/${slug}.md`,
      body,
      frontmatter: {
        title: slug.replace(/-/g, " "),
        created: isoDate(created),
        updated: isoDate(updated),
        tags: ["moc"],
      },
    });
  }

  // ── 01-Daily/YYYY-MM-DD.md — last 45 days, every 1–2 days
  let dailyDate = addDays(today, -1);
  for (let n = 0; n < 45; n++) {
    const stem = isoDate(dailyDate);
    // Deliberate drift signal: mention a few projects with skewed frequency.
    // Beacon (stated rank #2 by note count) gets the most lived mentions.
    const mentions: string[] = [];
    const heavyProject = pick(rng, PROJECTS);
    for (let m = 0; m < range(rng, 1, 5); m++) {
      mentions.push(chance(rng, 0.6) ? heavyProject : pick(rng, PROJECTS));
    }
    const body = [
      paragraph(rng, range(rng, 1, 2)),
      "",
      `Spent the morning on ${mentions.join(", ")}.`,
      "",
      callout(rng),
    ].join("\n");
    plans.push({
      relPath: `01-Daily/${stem}.md`,
      body,
      frontmatter: {
        title: stem,
        created: stem,
        updated: stem,
        tags: ["daily"],
      },
    });
    dailyDate = addDays(dailyDate, -range(rng, 1, 2));
  }

  // ── 07-Insights/<n>.md — buried-insight candidates: old, dormant, prose-shaped
  let insightIdx = 0;
  while (plans.length < args.count) {
    const ageDays = range(rng, 200, 720); // older than vault-aware min_age floor
    const created = addDays(today, -ageDays);
    const updated = addDays(created, range(rng, 0, 60)); // long-dormant
    const stem = `Insight-${String(++insightIdx).padStart(3, "0")}`;
    const body = [
      paragraph(rng, range(rng, 2, 4)),
      "",
      callout(rng),
      "",
      paragraph(rng, range(rng, 1, 3)),
    ].join("\n");
    plans.push({
      relPath: `07-Insights/${stem}.md`,
      body,
      frontmatter: {
        title: stem.replace(/-/g, " "),
        created: isoDate(created),
        updated: isoDate(updated),
        tags: ["insight"],
      },
    });
    allTitles.push(stem);
  }

  return plans.slice(0, args.count);
}

function emit(plans: NotePlan[], dest: string): void {
  if (existsSync(dest)) {
    rmSync(dest, { recursive: true, force: true });
  }
  mkdirSync(dest, { recursive: true });
  for (const plan of plans) {
    const full = join(dest, plan.relPath);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, frontmatterBlock(plan.frontmatter) + plan.body + "\n", "utf8");
  }
}

function listFiles(dir: string): string[] {
  const out: string[] = [];
  function walk(d: string) {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, entry.name);
      if (entry.isDirectory()) walk(p);
      else out.push(p);
    }
  }
  walk(dir);
  return out.sort();
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const plans = buildPlans(args);
  emit(plans, args.dest);
  const files = listFiles(args.dest);
  console.log(`generate-test-vault: wrote ${files.length} files to ${args.dest}`);
  console.log(`  seed=${args.seed} count=${args.count} today=${args.today}`);
}

main();
