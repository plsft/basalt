import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { type Brief, getBrief } from "../api";

interface RenderedBrief {
  raw: Brief;
  markdown: string;
  v1Banner: string[];
}

export function BriefView() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<RenderedBrief | null>(null);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!id) return;
    let alive = true;
    getBrief(id)
      .then((b) => {
        if (alive) setData({ raw: b, markdown: extractMarkdown(b), v1Banner: extractV1Banner(b) });
      })
      .catch((e: Error & { status?: number }) => {
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
  }, [id, navigate]);

  if (error) return <p className="empty">{error}</p>;
  if (!data) return <p className="empty muted">Loading…</p>;

  return (
    <article>
      <p className="numeral">brief · {data.raw.created_at.slice(0, 10)}</p>
      {data.v1Banner.length > 0 && (
        <div className="banner-v1">
          {data.v1Banner.map((line, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: lines are display-only, no reordering.
            <p key={i}>{line}</p>
          ))}
        </div>
      )}
      <pre className="brief-body">{data.markdown}</pre>
    </article>
  );
}

/** Try to extract a `rendered_markdown` field if the API ever ships one;
 *  otherwise pretty-print the JSON. The Workers API today returns the
 *  raw Brief object — we render it as-is for now. */
function extractMarkdown(brief: Brief): string {
  if (brief.brief && typeof brief.brief === "object") {
    const b = brief.brief as { rendered_markdown?: string };
    if (typeof b.rendered_markdown === "string") return b.rendered_markdown;
    return JSON.stringify(brief.brief, null, 2);
  }
  return JSON.stringify(brief, null, 2);
}

function extractV1Banner(brief: Brief): string[] {
  const lines: string[] = [];
  if (!brief.brief || typeof brief.brief !== "object") return lines;
  const findings = (brief.brief as { findings?: Record<string, unknown> }).findings;
  if (!findings || typeof findings !== "object") return lines;
  const thesis = findings.implicit_thesis;
  if (Array.isArray(thesis)) {
    for (const f of thesis as Array<{
      named_thesis?: string | null;
      named_thesis_model?: string | null;
    }>) {
      if (f.named_thesis) {
        lines.push(`💡 ${f.named_thesis}`);
        if (f.named_thesis_model) lines.push(`   model: ${f.named_thesis_model}`);
      }
    }
  }
  const contradiction = findings.contradiction;
  if (Array.isArray(contradiction)) {
    for (const f of contradiction as Array<{ verdict?: string; verdict_reason?: string }>) {
      if (f.verdict && f.verdict !== "undetermined") {
        lines.push(`⚖️ ${f.verdict} — ${f.verdict_reason ?? ""}`);
      }
    }
  }
  return lines;
}
