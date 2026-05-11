import { useMutation } from "@tanstack/react-query";
import { open } from "@tauri-apps/plugin-dialog";
import { useState } from "react";
import { type DesktopBrief, runBriefForVault } from "./engine-bridge";

export function App() {
  const [vault, setVault] = useState<string | null>(null);
  const [brief, setBrief] = useState<DesktopBrief | null>(null);
  const [progress, setProgress] = useState<string>("");

  const generate = useMutation({
    mutationFn: async (vaultPath: string) => {
      setProgress("Walking vault…");
      const b = await runBriefForVault(vaultPath, (msg) => setProgress(msg));
      setProgress("");
      return b;
    },
    onSuccess: (b) => setBrief(b),
  });

  return (
    <div className="h-screen flex flex-col bg-basalt-bg text-basalt-ink">
      <header className="border-b border-basalt-rule px-6 py-3 flex items-center justify-between">
        <span className="font-display text-lg">Basalt</span>
        <span className="mono text-sm text-basalt-ink-dim">{vault ?? "no vault"}</span>
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
        {vault && !brief && (
          <div className="space-y-4 py-12">
            <button
              type="button"
              className="mono bg-basalt-accent-na text-basalt-bg px-4 py-2"
              disabled={generate.isPending}
              onClick={() => generate.mutate(vault)}
            >
              {generate.isPending ? "Generating…" : "Generate Brief"}
            </button>
            {progress && <p className="text-basalt-ink-dim">{progress}</p>}
            {generate.error && (
              <p className="text-basalt-danger">{(generate.error as Error).message}</p>
            )}
          </div>
        )}
        {brief && (
          <pre className="mono text-xs whitespace-pre-wrap bg-basalt-bg-raised p-6">
            {JSON.stringify(brief, null, 2)}
          </pre>
        )}
      </main>
    </div>
  );
}
