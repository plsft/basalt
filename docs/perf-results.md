# Performance — measured results

Per PRD §6.4, the bench scripts in `bench/` verify that engine performance
fits within the budgets the product depends on. Run them with:

```sh
bun run bench:index
bun run bench:cold-start
bun run bench:idle-memory
bun run bench         # all three
```

The numbers below are baselines captured on the development machine; the
release runbook updates them per tagged release.

## 2026-05-11 — pre-v1.0 baseline

**Platform:** Windows 11 (win32 x64), Bun 1.3.13.

### Index throughput

`bun bench/index-throughput.ts`

| Vault size | Time   | Throughput      | Budget (PRD §6.4) |
| ---------: | -----: | --------------: | ----------------: |
| 100 notes  | 48 ms  | 2,075 notes/sec | < 3,000 ms        |
| 1,000 notes | 244 ms | 4,099 notes/sec | < 30,000 ms       |

`headroom: ~120× under budget on 1k notes.`

### Cold start

`bun bench/cold-start.ts` (5 iterations, median reported)

| Target                          | Median  | Min     | Max     | Budget |
| ------------------------------- | ------: | ------: | ------: | ----: |
| `basalted-core` import + create  |   36 ms |   34 ms |   37 ms |   N/A |
| `basalt about` (CLI)            |  334 ms |  324 ms |  345 ms | 1,500 ms |

The PRD §6.4 desktop cold-start budget (< 800 ms median) is measured
separately by the Tauri release pipeline against signed builds; the CLI
above is a proxy for the engine-side portion of that budget.

### Idle memory

`bun bench/idle-memory.ts`

| Phase                  | RSS (MB) | Heap (MB) |
| ---------------------- | -------: | --------: |
| baseline (post-import) |    141.9 |       0.3 |
| engine created         |    142.7 |       0.3 |
| 100 notes indexed      |    160.4 |       0.8 |
| post-GC, idle          |    160.5 |       0.8 |

Most of the 142 MB baseline is the Bun runtime itself; the engine layers
adds < 1 MB heap. The PRD §6.4 < 100 MB *desktop* budget is measured against
the Tauri bundle (which does not embed Bun); the desktop runtime sits on the
system WebView + a thin Rust shell.

## Methodology

- `bench/index-throughput.ts` builds a synthetic vault of N notes, each with
  frontmatter + body + a couple of wikilinks, runs `Engine.index({ vault })`
  in-process, and reports notes/sec.
- `bench/cold-start.ts` spawns a fresh Bun child process for each iteration
  so module-import cost is counted; medians smooth out file-system jitter.
- `bench/idle-memory.ts` snapshots `process.memoryUsage().rss` between
  phases, runs `Bun.gc(true)` twice to let the GC settle, and reports the
  steady-state idle value.

## CI integration

The full bench suite runs locally before each release tag via
`scripts/release.sh`. We do not run benches in CI on every PR — bench
results are noisy on shared CI runners and would produce false negatives.
Release-time bench runs are recorded here.

## Regressions

If a PR touches `parser/`, `graph/`, `math/`, or any verb, run
`bun run bench:index` locally and report the delta in the PR description.
A > 10 % regression on any tracked metric blocks merge per CLAUDE.md §4.
