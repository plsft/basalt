import type { APIRoute } from "astro";

const pages = ["/", "/install", "/pricing", "/privacy", "/changelog"];

export const GET: APIRoute = ({ site }) => {
  const base = site?.toString().replace(/\/$/, "") ?? "https://basalt.dev";
  const urls = pages
    .map(
      (p) => `  <url>
    <loc>${base}${p}</loc>
    <changefreq>weekly</changefreq>
  </url>`,
    )
    .join("\n");
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
  return new Response(body, { headers: { "Content-Type": "application/xml" } });
};
