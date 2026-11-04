/**
 * Cloudflare Worker v8 -- CORS proxy para assets BDGD do GitHub Releases.
 *
 * Estratégia: resolve o CDN real do GitHub (objects.githubusercontent.com)
 * via HEAD e então PROXIA a resposta com CORS headers próprios.
 * O redirect (v7) não funciona porque objects.githubusercontent.com não
 * serve Access-Control-Allow-Origin em todos os contextos — Range requests
 * cross-origin pelo browser são bloqueadas sem o proxy.
 *
 * Range requests (PMTiles): o Worker passa o header Range para o CDN e
 * retorna a resposta parcial (206). Cada chunk do PMTiles é ~16–512 KB,
 * dentro dos limites do plano free do Cloudflare.
 *
 * Roteamento:
 *   /{dist}/{file}  ->  proxy do CDN do releases/download/bdgd-{dist}-2024/{file}
 *                       (trafos-* -> bdgd-{dist}-2024-trafos/{file})
 *                       (linhas-* -> tenta main, -b, -c em sequência)
 *                       (outros   -> tenta {dist}_2024-{file} e depois {file} sem prefixo)
 *   /{file}         ->  backward compat (elektro, mapeamento legado)
 *   /               ->  lista distribuidoras disponíveis
 *
 * Naming convention nas releases: {dist}_2024-{file}
 *   Ex: elektro_2024-rede-mt.pmtiles, cpfl-paulista_2024-trafos.geojson
 *   Arquivos per-CTMT (linhas-*, trafos-*) não têm prefixo.
 *   index.json não tem prefixo.
 *
 * Deploy: npx wrangler deploy workers/bdgd-cors-worker.js --name bdgd-cors --compatibility-date 2024-01-01
 */

/** Retorna lista de URLs candidatas em ordem de tentativa. */
const GITHUB_CANDIDATES = (dist, file) => {
  if (file.startsWith("trafos-")) {
    // Arquivos per-CTMT: bdgd-{dist}-2024-trafos/{file}
    return [`https://github.com/KogaIgor0/markfield-web/releases/download/bdgd-${dist}-2024-trafos/${file}`];
  }
  if (file.startsWith("linhas-")) {
    // Arquivos linhas-* podem estar espalhados em até 3 releases de overflow
    return [
      `https://github.com/KogaIgor0/markfield-web/releases/download/bdgd-${dist}-2024/${file}`,
      `https://github.com/KogaIgor0/markfield-web/releases/download/bdgd-${dist}-2024-b/${file}`,
      `https://github.com/KogaIgor0/markfield-web/releases/download/bdgd-${dist}-2024-c/${file}`,
    ];
  }
  // Arquivos principais (rede-mt.pmtiles, trafos.geojson, index.json):
  // Naming atual nas releases: {dist}_2024-{file} (ex: elektro_2024-rede-mt.pmtiles)
  // Fallback para naming futuro sem prefixo.
  return [
    `https://github.com/KogaIgor0/markfield-web/releases/download/bdgd-${dist}-2024/${dist}_2024-${file}`,
    `https://github.com/KogaIgor0/markfield-web/releases/download/bdgd-${dist}-2024/${file}`,
  ];
};

const DISTRIBUIDORAS = new Set([
  "elektro",
  "cemig",
  "cpfl-paulista",
  "cpfl-piratininga",
  "enel-sp",
  "copel",
  "coelba",
  "equatorial-pa",
  "equatorial-ma",
  "equatorial-pi",
  "equatorial-al",
  "equatorial-go",
  "ceee",
  "cea",
  "energisa-mt",
  "energisa-ms",
  "energisa-to",
  "energisa-pb",
  "energisa-se",
  "energisa-mg-rio",
  "energisa-sul",
  "energisa-ro",
  "energisa-ac",
]);

const LEGACY = {
  "rede-mt.pmtiles": `https://github.com/KogaIgor0/markfield-web/releases/download/bdgd-elektro-2024/elektro_2024-rede-mt.pmtiles`,
  "trafos.geojson":  `https://github.com/KogaIgor0/markfield-web/releases/download/bdgd-elektro-2024/elektro_2024-trafos.geojson`,
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "Range, Content-Type, Accept",
  "Access-Control-Expose-Headers": "Content-Range, Content-Length, Accept-Ranges",
  "Access-Control-Max-Age": "86400",
};

/** Resolve uma URL do GitHub Releases para o CDN real (objects.githubusercontent.com).
 *  Retorna { cdnUrl } se encontrado, ou null se 404. */
async function resolveGitHub(url) {
  try {
    const probe = await fetch(url, { method: "HEAD", redirect: "manual" });
    const location = probe.headers.get("location");
    if (location) return location;
    if (probe.status >= 200 && probe.status < 300) return url;
    return null; // 404 ou outro erro
  } catch {
    return null;
  }
}

export default {
  async fetch(request) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }

    const { pathname } = new URL(request.url);
    const parts = pathname.replace(/^\//, "").split("/").filter(Boolean);

    let candidates;

    if (parts.length === 0) {
      return new Response(
        `BDGD CORS Worker v5\nDistribuidoras: ${[...DISTRIBUIDORAS].join(", ")}\nUso: /{distribuidora}/{arquivo}`,
        { status: 200, headers: { ...CORS, "Content-Type": "text/plain; charset=utf-8" } }
      );
    }

    if (parts.length >= 2) {
      const dist = parts[0];
      const file = parts.slice(1).join("/");
      if (!DISTRIBUIDORAS.has(dist)) {
        return new Response(
          `Distribuidora "${dist}" não disponível.\nDisponíveis: ${[...DISTRIBUIDORAS].join(", ")}`,
          { status: 404, headers: { ...CORS, "Content-Type": "text/plain; charset=utf-8" } }
        );
      }
      candidates = GITHUB_CANDIDATES(dist, file);
    } else {
      const file = parts[0];
      const legacy = LEGACY[file];
      if (!legacy) {
        return new Response(
          `"${file}" não encontrado. Use /{distribuidora}/{arquivo}.`,
          { status: 404, headers: { ...CORS, "Content-Type": "text/plain; charset=utf-8" } }
        );
      }
      candidates = [legacy];
    }

    // Resolve o redirect do GitHub -- tenta cada candidato em sequência
    let cdnUrl = null;
    let resolvedTarget = null;
    for (const url of candidates) {
      const resolved = await resolveGitHub(url);
      if (resolved) {
        cdnUrl = resolved;
        resolvedTarget = url;
        break;
      }
    }

    if (!cdnUrl) {
      return new Response(
        `Arquivo não encontrado nas releases disponíveis.`,
        { status: 404, headers: { ...CORS, "Content-Type": "text/plain" } }
      );
    }

    // Proxia a resposta do CDN com CORS headers.
    // objects.githubusercontent.com não serve CORS headers de forma confiável em
    // requests cross-origin com Range — o Worker precisa proxiar para adicionar os headers.
    // PMTiles faz Range requests pequenos (~16 KB por chunk), então não há risco de timeout.
    const rangeHeader = request.headers.get("Range");
    const fetchHeaders = {};
    if (rangeHeader) fetchHeaders["Range"] = rangeHeader;

    let upstream;
    try {
      upstream = await fetch(cdnUrl, { headers: fetchHeaders });
    } catch (e) {
      return new Response(`Erro ao buscar asset: ${e.message}`, {
        status: 502,
        headers: { ...CORS, "Content-Type": "text/plain" },
      });
    }

    // Propagar headers úteis do CDN
    const responseHeaders = new Headers(CORS);
    for (const h of ["Content-Type", "Content-Length", "Content-Range", "Accept-Ranges", "ETag", "Last-Modified", "Cache-Control"]) {
      const v = upstream.headers.get(h);
      if (v) responseHeaders.set(h, v);
    }

    return new Response(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    });
  },
};
