import { Link } from "react-router-dom";

export function LandingPage() {
  return (
    <section className="max-w-3xl mx-auto px-6 py-16 prose">
      <p className="mono text-basalt-ink-dim uppercase tracking-widest text-xs">I</p>
      <h1 className="text-5xl font-display mt-2 mb-6">Latest Brief</h1>
      <p className="text-basalt-ink-dim text-lg leading-relaxed">
        Reads your vault, surfaces what you believe but never wrote down. Five named verbs run
        weekly — Implicit Thesis, Contradiction, Drift, Connection, Buried Insight — and produce a
        Brief.
      </p>
      <div className="mt-12 flex gap-4">
        <Link
          to="/briefs"
          className="mono bg-basalt-accent-na text-basalt-bg px-4 py-2 hover:opacity-90"
        >
          View briefs
        </Link>
        <Link to="/vaults" className="mono text-basalt-ink underline">
          Manage vaults
        </Link>
      </div>
    </section>
  );
}
