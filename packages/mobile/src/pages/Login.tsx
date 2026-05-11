import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { loadSettings, saveSettings } from "../api";

export function Login() {
  const initial = loadSettings();
  const [apiUrl, setApiUrl] = useState(initial.apiUrl);
  const [apiToken, setApiToken] = useState(initial.apiToken);
  const navigate = useNavigate();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    saveSettings({ apiUrl: apiUrl.trim(), apiToken: apiToken.trim() });
    navigate("/");
  }

  return (
    <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <h2 className="display" style={{ fontSize: "1.4rem", margin: 0 }}>
        Sign in
      </h2>
      <p className="muted" style={{ margin: 0 }}>
        Paste your session token from the web cockpit. We can't read cookies cross-origin from a
        PWA, so this is a one-time copy-paste.
      </p>
      <label style={{ display: "block" }}>
        <span className="numeral">api url</span>
        <input
          type="url"
          value={apiUrl}
          onChange={(e) => setApiUrl(e.target.value)}
          placeholder="https://api.basalt.dev"
        />
      </label>
      <label style={{ display: "block" }}>
        <span className="numeral">session token</span>
        <input
          type="password"
          value={apiToken}
          onChange={(e) => setApiToken(e.target.value)}
          placeholder="basalt_session value"
        />
      </label>
      <button type="submit" className="primary">
        Save & continue
      </button>
      <p className="muted" style={{ fontSize: "0.85rem", margin: 0 }}>
        Find the token: open <span className="mono">app.basalt.dev</span> in a desktop browser →
        DevTools → Application → Cookies → copy the value of{" "}
        <span className="mono">basalt_session</span>.
      </p>
    </form>
  );
}
