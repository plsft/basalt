# Show HN — author comment

I built Basalt because I have a 2,400-note vault that I cannot keep in my head
anymore, and I don't trust retrieval to tell me what I think.

Most "second brain" tools index your notes so you can search them. That's
useful, but it doesn't solve the actual problem: you already wrote the thing
once, you've been re-writing it every six months, and you can't see the pattern
from inside.

Basalt's bet is that the structure of a vault — link graph, sentence-level
embeddings, recency, the way certain notes get re-touched while others don't —
contains a *thesis* that the author didn't explicitly write. The job of the
tool is to surface that thesis as plain English, not as a cluster diagram.

The original Python prototype proved the verbs worked on my own vault. It also
shipped enough rough edges (slow indexing on 1k+ note vaults, fragile parsing,
no good interactive surface) that I decided to do a TS rewrite for v1.

What's deliberately *not* in here:

- **Chat with your notes.** Plenty of other tools do this. The bar Basalt
  holds is higher: the output has to be a *finding*, not a paraphrase.
- **Methodology enforcement.** Zettelkasten, PARA, LATCH — none of these are
  prerequisites. Basalt treats your vault as it finds it.
- **Cloud-first.** Open tier never phones home. Pro tier is a layer for
  people who want hosted compute and vault sync; it's not required, and the
  CLI works identically with or without it.
- **Mobile editing.** Out of scope for v1. Read-only mobile companion is in
  the post-launch roadmap.

The two design choices that bit me hardest during build-out:

1. **Hub-penalty smoothing.** Daily-notes are dense link hubs by accident.
   Without down-weighting them, every verb produces "your daily-note is
   important" findings, which is uninteresting. The penalty math is in
   `SPEC.md §9.2`.

2. **Promote-to-note as a pure function.** Multiple surfaces (CLI, plugin,
   desktop) all need it; they each have a different filesystem story. The
   only way I could prove read-only-on-vault was an architectural test that
   greps every adapter for `write`/`overwrite` reachable from a non-create
   path. It's ugly but it's the contract.

Things I'd love feedback on:
- **Does the brief format work?** Mine reads like a personal essay. I want
  to know if it reads the same way on your vault.
- **Pricing.** Open is free forever. Pro is $12/mo. Founder is $240 lifetime.
  Is the gap right?
- **What's the next verb?** I have rough sketches for Tension (an
  unresolved-question verb) and Resolved (a "you used to ask X, you stopped
  asking X" verb). What would *you* want?

Source: https://github.com/plsft/basalt — MIT.

Thanks for reading. — George
