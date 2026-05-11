import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { type ApiError, type BriefRow, listBriefs } from "../api";

export function Home() {
  const [rows, setRows] = useState<BriefRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    let alive = true;
    listBriefs()
      .then((r) => {
        if (alive) setRows(r.briefs);
      })
      .catch((e: ApiError) => {
        if (!alive) return;
        if (e.status === 401) {
          navigate("/login");
          return;
        }
        setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [navigate]);

  if (error) {
    return <p className="empty">{error}</p>;
  }
  if (rows === null) {
    return <p className="empty muted">Loading…</p>;
  }
  if (rows.length === 0) {
    return (
      <div className="empty">
        <p className="muted">No briefs yet.</p>
        <p className="muted">
          Generate one from the desktop, CLI, or plugin — they'll show up here once you've pushed a
          snapshot.
        </p>
      </div>
    );
  }
  return (
    <ul className="brief-list">
      {rows.map((r) => (
        <li key={r.id}>
          <Link to={`/briefs/${r.id}`} className="brief-row" style={{ display: "block" }}>
            <p className="row-date">{r.created_at.slice(0, 10)}</p>
            <p className="row-title">
              {r.section === "all" ? "Full brief" : r.section}{" "}
              <span className="muted" style={{ fontSize: "0.85rem" }}>
                · {r.vault_id.slice(0, 8)}
              </span>
            </p>
          </Link>
        </li>
      ))}
    </ul>
  );
}
