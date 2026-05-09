<!--
Pull request template — Basalt

PR title format: [TASK-X.Y] <imperative verb> <object>
e.g. [TASK-1.6] Port Implicit Thesis verb to TypeScript
-->

## Summary

<!-- 1–3 sentences. What changed and why. Reference the task spec, not the diff. -->

## Refs

- **Task:** TASK-X.Y in [`PHASE-N.md`](../blob/main/PHASE-N.md)
- **PRD sections:** §X.Y (architecture/principle this commits to)
- **Decisions:** `docs/decisions/...` (if any non-trivial decision was recorded)

## Definition of Done

- [ ] Code implements the task's *Spec*
- [ ] Tests in the *Tests* section are written and passing
- [ ] `bun run typecheck` (`tsc --noEmit -p tsconfig.base.json`) passes
- [ ] `bun run lint` (`biome check .`) passes — zero violations
- [ ] `bunx biome ci .` passes — format clean, lint clean
- [ ] `bun run test` passes
- [ ] No new dependency added without justification below
- [ ] CHANGELOG updated under `## Unreleased`
- [ ] Self-review of the diff completed
- [ ] CI green on this PR

### Verb-touching changes only

- [ ] Parity tests (`tests/parity/`) pass on **both** fixtures (`sample-vault-14`, `test-vault-large`)
- [ ] If TS diverged from Python, divergence is recorded in `docs/parsing-decisions.md` with line refs

### Performance-touching changes only

- [ ] Relevant benchmark run and numbers within budget (see PRD §6.4)
- [ ] No regression > 10 % on any tracked metric

### Schema-touching changes only

- [ ] Migration written and applied to staging without errors

## New dependencies (if any)

<!-- Three sentences minimum: why we need it, what was evaluated, why this one. -->

## Test results

<!-- Paste the relevant green output (compact, last few lines is fine). -->

```
$ bun run lint
$ bun run typecheck
$ bun run test
```

## Notes for reviewer

<!-- Anything that wasn't obvious from the diff. -->
