import type { Finding } from "basalted-core";
import { useMutation } from "@tanstack/react-query";
import { open } from "@tauri-apps/plugin-dialog";
import { useState } from "react";
import {
  type DesktopBrief,
  promoteFindingFromBrief,
  pushSnapshotForVault,
  runBriefForVault,
} from "./engine-bridge";
import { SettingsPanel } from "./SettingsPanel";
import { type DesktopSettings, loadSettings } from "./settings";

export function App() {
  const [vault, setVault] = useState<string | null>(null);
  const [brief, setBrief] = useState<DesktopBrief | null>(null);
  const [progress, setProgress] = useState<string>("");
  const [settings, setSettings] = useState<DesktopSettings>(() => loadSettings());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [promoteFeedback, setPromoteFeedback] = useState<string | null>(null);

  const generate = useMutation({
    mutationFn: async (vaultPath: string) => {
      setProgress("Walking vault…");
      const b = await runBriefForVault(vaultPath, settings, (msg) => setProgress(msg));
      setProgress("");
      return b;
    },
    onSuccess: (b) => setBrief(b),
  });

  const push = useMutation({
    mutationFn: async (vaultPath: string) => {
      setProgress("Snapshot push…");
      const r = await pushSnapshotForVault(vaultPath, settings, (msg) => setProgress(msg));
      setProgress("");
      return r;
    },
  });

  async function promote(findingIndex: number) {
    if (!vault || !brief) return;
    setPromoteFeedback(null);
    try {
      const relPath = await promoteFindingFromBrief(
        vault,
        brief.brief,
        findingIndex,
        settings.promoteFolder || "Basalt",
      );
      if (relPath) setPromoteFeedback(`✓ wrote ${relPath}`);
      else setPromoteFeedback("✗ file already exists (or no finding)");
    } catch (e) {
      setPromoteFeedback(`✗ ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const flatFindings = brief ? collectFindings(brief.brief) : [];

  return (
    <div className="h-screen flex flex-col bg-basalt-bg text-basalt-ink">
      <header className="border-b border-basalt-rule px-6 py-3 flex items-center justify-between">
        <span className="font-display text-lg">Basalt</span>
        <div className="flex items-center gap-4">
          <span className="mono text-sm text-basalt-ink-dim">{vault ?? "no vault"}</span>
          <button
            type="button"
            className="mono text-sm text-basalt-ink-dim hover:text-basalt-ink"
            onClick={() => setSettingsOpen(true)}
          >
            settings
          </button>
        </div>
      </header>
      <main className="flex-1 overflow-auto px-6 py-8 max-w-3xl mx-auto w-full">
        {!vault && (
          <div className="text-center py-24">
            <h1 className="font-display text-4xl mb-4">Welcome to Basalt.</h1>
            <p className="text-basalt-ink-dim mb-8">
              Pick a vault folder to start. Basalt is read-only by default; we never modify your
              existing .md files.
            </p>
            <button
              type="button"
              className="mono bg-basalt-accent-na text-basalt-bg px-4 py-2"
              onClick={async () => {
                const picked = await open({
                  directory: true,
                  multiple: false,
                  title: "Choose your vault folder",
                });
                if (typeof picked === "string") setVault(picked);
              }}
            >
              Pick vault…
            </button>
          </div>
        )}
        {vault && (
          <div className="space-y-6 py-8">
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                className="mono bg-basalt-accent-na text-basalt-bg px-4 py-2"
                disabled={generate.isPending}
                onClick={() => generate.mutate(vault)}
              >
                {generate.isPending ? "Generating…" : "Generate Brief"}
              </button>
              <button
                type="button"
                className="mono border border-basalt-rule text-basalt-ink px-4 py-2 hover:border-basalt-accent-na"
                onClick={async () => {
                  const picked = await open({
                    directory: true,
                    multiple: false,
                    title: "Choose a different vault folder",
                  });
                  if (typeof picked === "string") {
                    setVault(picked);
                    setBrief(null);
                  }
                }}
              >
                Switch vault
              </button>
              {settings.apiToken && settings.apiVaultId && (
                <button
                  type="button"
                  className="mono border border-basalt-rule text-basalt-ink px-4 py-2 hover:border-basalt-accent-na"
                  disabled={push.isPending}
                  onClick={() => push.mutate(vault)}
                >
                  {push.isPending ? "Pushing…" : "Push snapshot to API"}
                </button>
              )}
            </div>
            {progress && <p className="text-basalt-ink-dim">{progress}</p>}
            {generate.error && (
              <p className="text-basalt-danger">{(generate.error as Error).message}</p>
            )}
            {push.error && <p className="text-basalt-danger">{(push.error as Error).message}</p>}
            {push.data && (
              <p className="text-basalt-accent-cl mono text-sm">
                ✓ pushed {push.data.note_count} notes / {push.data.embedding_count} embeddings (
                {push.data.bytes.toLocaleString()} bytes)
              </p>
            )}
            {promoteFeedback && (
              <p className="text-basalt-accent-cl mono text-sm">{promoteFeedback}</p>
            )}
          </div>
        )}
        {brief && (
          <div className="space-y-4">
            {brief.llm_used && (
              <p className="mono text-xs text-basalt-accent-na">
                LLM-augmented via {brief.llm_used}
              </p>
            )}
            {flatFindings.length > 0 && (
              <details className="border border-basalt-rule">
                <summary className="mono text-sm cursor-pointer px-4 py-2 hover:bg-basalt-bg-raised">
                  Promote a finding to a new note ({flatFindings.length} available)
                </summary>
                <ul className="divide-y divide-basalt-rule">
                  {flatFindings.map((f, i) => (
                    <li
                      key={findingKey(f, i)}
                      className="flex items-center justify-between px-4 py-2"
                    >
                      <span className="mono text-xs text-basalt-ink-dim truncate mr-2">
                        {labelFor(f)}
                      </span>
                      <button
                        type="button"
                        className="mono text-xs border border-basalt-rule px-2 py-1 hover:border-basalt-accent-na"
                        onClick={() => promote(i)}
                      >
                        promote
                      </button>
                    </li>
                  ))}
                </ul>
              </details>
            )}
            <pre className="mono text-xs whitespace-pre-wrap bg-basalt-bg-raised p-6">
              {brief.rendered_markdown}
            </pre>
          </div>
        )}
      </main>
      {settingsOpen && (
        <SettingsPanel
          initial={settings}
          onClose={() => setSettingsOpen(false)}
          onChange={setSettings}
        />
      )}
    </div>
  );
}

function collectFindings(brief: DesktopBrief["brief"]): Finding[] {
  const out: Finding[] = [];
  for (const arr of Object.values(brief.findings)) if (arr) out.push(...arr);
  return out;
}

function findingKey(f: Finding, idx: number): string {
  const verb = f.verb;
  if ("note_a" in f && f.note_a) return `${verb}:${f.note_a.rel_path}:${idx}`;
  if ("rel_path" in f && typeof f.rel_path === "string") return `${verb}:${f.rel_path}:${idx}`;
  if ("centroid" in f && f.centroid) return `${verb}:${f.centroid.rel_path}:${idx}`;
  return `${verb}:${idx}`;
}

function labelFor(f: Finding): string {
  const verb = f.verb;
  if ("note_a" in f && "note_b" in f && f.note_a && f.note_b) {
    return `${verb}: ${f.note_a.rel_path} ↔ ${f.note_b.rel_path}`;
  }
  if ("rel_path" in f && typeof f.rel_path === "string") return `${verb}: ${f.rel_path}`;
  if ("centroid" in f && f.centroid) return `${verb}: ${f.centroid.rel_path}`;
  if (f.verb === "drift") return "drift";
  return verb;
}
