import { useState } from "react";
import { type DesktopSettings, saveSettings } from "./settings";

interface Props {
  initial: DesktopSettings;
  onClose: () => void;
  onChange: (s: DesktopSettings) => void;
}

export function SettingsPanel({ initial, onClose, onChange }: Props) {
  const [s, setS] = useState<DesktopSettings>(initial);
  function update<K extends keyof DesktopSettings>(k: K, v: DesktopSettings[K]) {
    const next = { ...s, [k]: v };
    setS(next);
    saveSettings(next);
    onChange(next);
  }
  return (
    <div className="fixed inset-0 bg-basalt-bg/95 z-10 overflow-auto">
      <div className="max-w-2xl mx-auto px-6 py-12">
        <div className="flex items-center justify-between mb-8">
          <h2 className="font-display text-3xl">Settings</h2>
          <button
            type="button"
            className="mono text-basalt-ink-dim hover:text-basalt-ink"
            onClick={onClose}
          >
            close
          </button>
        </div>

        <Section title="Embeddings">
          <Field label="Ollama URL">
            <input
              className="bg-basalt-bg-raised border border-basalt-rule px-3 py-2 mono text-sm w-full"
              value={s.ollamaUrl}
              onChange={(e) => update("ollamaUrl", e.target.value)}
            />
          </Field>
          <Field label="Embedding model">
            <input
              className="bg-basalt-bg-raised border border-basalt-rule px-3 py-2 mono text-sm w-full"
              value={s.embeddingModel}
              onChange={(e) => update("embeddingModel", e.target.value)}
            />
          </Field>
        </Section>

        <Section title="LLM (v1 verbs)">
          <Field label="Provider">
            <select
              className="bg-basalt-bg-raised border border-basalt-rule px-3 py-2 mono text-sm w-full"
              value={s.llmProvider}
              onChange={(e) =>
                update("llmProvider", e.target.value as DesktopSettings["llmProvider"])
              }
            >
              <option value="none">None — v0 only</option>
              <option value="ollama">Ollama (local)</option>
              <option value="openai">OpenAI (BYOK)</option>
              <option value="anthropic">Anthropic (BYOK)</option>
            </select>
          </Field>
          {s.llmProvider !== "none" && (
            <Field label="Model override">
              <input
                placeholder="default per provider"
                className="bg-basalt-bg-raised border border-basalt-rule px-3 py-2 mono text-sm w-full"
                value={s.llmModel}
                onChange={(e) => update("llmModel", e.target.value)}
              />
            </Field>
          )}
          {(s.llmProvider === "openai" || s.llmProvider === "anthropic") && (
            <Field label={`${s.llmProvider} API key`}>
              <input
                type="password"
                placeholder="sk-…"
                className="bg-basalt-bg-raised border border-basalt-rule px-3 py-2 mono text-sm w-full"
                value={s.llmApiKey}
                onChange={(e) => update("llmApiKey", e.target.value)}
              />
              <p className="text-xs text-basalt-ink-dim mt-1">
                Stored locally in this app's data directory. Never sent anywhere except the provider
                you selected.
              </p>
            </Field>
          )}
        </Section>

        <Section title="API (Pro tier)">
          <Field label="API URL">
            <input
              className="bg-basalt-bg-raised border border-basalt-rule px-3 py-2 mono text-sm w-full"
              value={s.apiUrl}
              onChange={(e) => update("apiUrl", e.target.value)}
            />
          </Field>
          <Field label="Session token (from web cockpit cookie)">
            <input
              type="password"
              className="bg-basalt-bg-raised border border-basalt-rule px-3 py-2 mono text-sm w-full"
              value={s.apiToken}
              onChange={(e) => update("apiToken", e.target.value)}
            />
          </Field>
          <Field label="Vault ID">
            <input
              placeholder="01H… (from /v1/vaults)"
              className="bg-basalt-bg-raised border border-basalt-rule px-3 py-2 mono text-sm w-full"
              value={s.apiVaultId}
              onChange={(e) => update("apiVaultId", e.target.value)}
            />
          </Field>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h3 className="font-display text-xl mb-4 text-basalt-accent-na">{title}</h3>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: the input is passed in via children; biome can't see through.
    <label className="block">
      <span className="block text-xs text-basalt-ink-dim uppercase tracking-widest mb-2 mono">
        {label}
      </span>
      {children}
    </label>
  );
}
