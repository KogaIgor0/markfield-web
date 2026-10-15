/**
 * Cloudflare Worker v2 — CORS proxy para assets BDGD do GitHub Releases.
 *
 * Roteamento dinâmico multi-distribuidora:
 *   /{dist}/{file}  →  releases/download/bdgd-{dist}-2024/{file}
 *   /{file}         →  backward compat (elektro, mapeamento legado)
 *   /               →  lista distribuidoras disponíveis
 *
 * Deploy: cole este código no Cloudflare Workers dashboard e salve.
 */

const GITHUB_TMPL = (dist, file) =>
  `https://github.com/KogaIgor0/markfield-web/releases/download/bdgd-${dist}-2024/${file}`;

// Allowlist — adicione novas distribuidoras aqui
const DISTRIBUIDORAS = new Set(["elektro"]);

// Backward compat: paths legados sem prefixo de distribuidora
const LEGACY = {
  "rede-mt.pmtiles": GITHUB_TMPL("elektro", "elektro_2024-rede-mt.pmtiles"),
  "trafos.geojson":  GITHUB_TMPL("elektro", "elektro_2024-trafos.geojson"),
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "Range, Content-Type, Accept",
  "Access-Control-Expose-Headers": "Content-Range, Content-Length, Accept-Ranges",
  "Access-Control-Max-Age": "86400",
};

export default {
  async fetch(request) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }

    const { pathname } = new URL(request.url);
    const parts = pathname.replace(/^\//, "").split("/").filter(Boolean);

    let target;

    if (parts.length === 0) {
      return new Response(
        `BDGD CORS Worker v2\nDistribuidoras: ${[...DISTRIBUIDORAS].join(", ")}\nUso: /{distribuidora}/{arquivo}`,
        { status: 200, headers: { ...CORS, "Content-Type": "text/plain; charset=utf-8" } }
      );
    }

    if (parts.length >= 2) {
      // Novo formato: /{dist}/{file}
      const dist = parts[0];
      const file = parts.slice(1).join("/");
      if (!DISTRIBUIDORAS.has(dist)) {
        return new Response(
          `Distribuidora "${dist}" não disponível.\nDisponíveis: ${[...DISTRIBUIDORAS].join(", ")}`,
          { status: 404, headers: { ...CORS, "Content-Type": "text/plain; charset=utf-8" } }
        );
      }
      target = GITHUB_TMPL(dist, file);
    } else {
      // Formato legado: /{file}
      const file = parts[0];
      target = LEGACY[file];
      if (!target) {
        return new Response(
          `"${file}" não encontrado. Use /{distribuidora}/{arquivo}.`,
          { status: 404, headers: { ...CORS, "Content-Type": "text/plain; charset=utf-8" } }
        );
      }
    }

    const upstreamHeaders = {};
    const range = request.headers.get("Range");
    if (range) upstreamHeaders["Range"] = range;

    let response;
    try {
      response = await fetch(target, { method: request.method, headers: upstreamHeaders, redirect: "follow" });
    } catch (err) {
      return new Response(`Erro ao buscar ${target}: ${err.message}`, {
        status: 502, headers: { ...CORS, "Content-Type": "text/plain" },
      });
    }

    const out = new Headers(CORS);
    for (const h of ["content-type","content-length","content-range","accept-ranges","etag","last-modified","cache-control"]) {
      const v = response.headers.get(h);
      if (v) out.set(h, v);
    }

    return new Response(response.body, { status: response.status, headers: out });
  },
};

