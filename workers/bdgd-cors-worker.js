/**
 * Cloudflare Worker — CORS proxy para assets BDGD do GitHub Releases.
 *
 * Problema: GitHub Releases retorna um redirect 302 → objects.githubusercontent.com
 * sem header Access-Control-Allow-Origin na resposta 302 inicial, bloqueando
 * fetch() cross-origin (ex.: StackBlitz, qualquer app no browser).
 *
 * Solução: este Worker busca o arquivo do lado do servidor (sem restrição CORS),
 * segue o redirect para o CDN do GitHub e devolve a resposta com CORS headers.
 * Também repassa Range headers, necessários para o PMTiles (range requests).
 *
 * Deploy:
 *   1. Acesse https://workers.cloudflare.com → "Create a Worker"
 *   2. Substitua o código gerado por este arquivo
 *   3. Clique "Save and Deploy"
 *   4. Copie a URL gerada (ex.: https://bdgd-cors.SEU_USUARIO.workers.dev)
 *   5. Atualize WORKER_BASE_URL em src/map/bdgd.ts
 */

const GITHUB_BASE =
  "https://github.com/KogaIgor0/markfield-web/releases/download/bdgd-elektro-2024/";

const ASSETS = {
  "rede-mt.pmtiles": `${GITHUB_BASE}elektro_2024-rede-mt.pmtiles`,
  "trafos.geojson": `${GITHUB_BASE}elektro_2024-trafos.geojson`,
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
    // Preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }

    const url = new URL(request.url);
    // Strip leading slash: "/rede-mt.pmtiles" → "rede-mt.pmtiles"
    const filename = url.pathname.replace(/^\//, "");
    const target = ASSETS[filename];

    if (!target) {
      return new Response(`Asset "${filename}" não encontrado.\nAssets disponíveis: ${Object.keys(ASSETS).join(", ")}`, {
        status: 404,
        headers: { ...CORS, "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    // Repassa Range header (necessário para PMTiles streaming)
    const upstreamHeaders = {};
    const range = request.headers.get("Range");
    if (range) upstreamHeaders["Range"] = range;

    let response;
    try {
      response = await fetch(target, {
        method: request.method,
        headers: upstreamHeaders,
        redirect: "follow",
      });
    } catch (err) {
      return new Response(`Erro ao buscar ${target}: ${err.message}`, {
        status: 502,
        headers: { ...CORS, "Content-Type": "text/plain" },
      });
    }

    // Monta headers da resposta: CORS + headers relevantes do upstream
    const responseHeaders = new Headers(CORS);
    const FORWARD = [
      "content-type",
      "content-length",
      "content-range",
      "accept-ranges",
      "etag",
      "last-modified",
      "cache-control",
    ];
    for (const [k, v] of response.headers) {
      if (FORWARD.includes(k.toLowerCase())) responseHeaders.set(k, v);
    }

    return new Response(response.body, {
      status: response.status,
      headers: responseHeaders,
    });
  },
};
