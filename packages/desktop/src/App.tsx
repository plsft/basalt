import { useMutation } from "@tanstack/react-query";
import { open } from "@tauri-apps/plugin-dialog";
import { useState } from "react";
import { type DesktopBrief, pushSnapshotForVault, runBriefForVault } from "./engine-bridge";
import { SettingsPanel } from "./SettingsPanel";
import { type DesktopSettings, loadSettings } from "./settings";

export function App() {
  const [vault, setVault] = useState<string | null>(null);
  const [brief, setBrief] = useState<DesktopBrief | null>(null);
  const [progress, setProgress] = useState<string>("");
  const [settings, setSettings] = useState<DesktopSettings>(() => loadSettings());
  const [settingsOpen, setSettingsOpen] = useState(false);

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
          </div>
        )}
        {brief && (
          <div className="space-y-4">
            {brief.llm_used && (
              <p className="mono text-xs text-basalt-accent-na">
                LLM-augmented via {brief.llm_used}
              </p>
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
