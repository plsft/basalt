import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { loadSettings, saveSettings, whoami } from "../api";

export function Settings() {
  const [s, setS] = useState(loadSettings());
  const [me, setMe] = useState<{ email: string; tier: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    let alive = true;
    whoami()
      .then((u) => {
        if (alive) setMe({ email: u.email, tier: u.tier });
      })
      .catch((e: Error) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, []);

  function save() {
    saveSettings(s);
    setError("Saved.");
  }
  function signOut() {
    saveSettings({ ...s, apiToken: "" });
    navigate("/login");
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <section>
        <h2 className="display" style={{ fontSize: "1.4rem", margin: 0 }}>
          Account
        </h2>
        {me ? (
          <p style={{ margin: "0.5rem 0 0" }}>
            <span className="mono muted">{me.email}</span>{" "}
            <span style={{ color: "var(--accent-na)", marginLeft: "0.5rem" }}>{me.tier}</span>
          </p>
        ) : (
          <p className="muted">Not signed in.</p>
        )}
      </section>
      <section>
        <h2 className="display" style={{ fontSize: "1.4rem", margin: 0 }}>
          Connection
        </h2>
        <label style={{ display: "block", marginTop: "1rem" }}>
          <span className="numeral">api url</span>
          <input
            type="url"
            value={s.apiUrl}
            onChange={(e) => setS({ ...s, apiUrl: e.target.value })}
          />
        </label>
        <label style={{ display: "block", marginTop: "1rem" }}>
          <span className="numeral">session token</span>
          <input
            type="password"
            value={s.apiToken}
            onChange={(e) => setS({ ...s, apiToken: e.target.value })}
          />
        </label>
        <div style={{ marginTop: "1rem", display: "flex", gap: "0.5rem" }}>
          <button type="button" className="primary" onClick={save}>
            Save
          </button>
          <button type="button" onClick={signOut}>
            Sign out
          </button>
        </div>
        {error && (
          <p className="muted" style={{ marginTop: "1rem" }}>
            {error}
          </p>
        )}
      </section>
      <section>
        <h2 className="display" style={{ fontSize: "1.4rem", margin: 0 }}>
          About
        </h2>
        <p className="muted" style={{ marginTop: "0.5rem" }}>
          Basalt mobile is a read-only Brief reader. To generate briefs, use the desktop, CLI, or
          Obsidian plugin — push snapshots to the API, then pull them here.
        </p>
        <p className="mono muted" style={{ fontSize: "0.75rem" }}>
          version 1.2.0 · MIT
        </p>
      </section>
    </div>
  );
}
