/**
 * Camadas da BDGD (ANEEL) no MapLibre.
 *
 * A BDGD (Base de Dados Geográfica da Distribuidora) é publicada anualmente
 * pela ANEEL em dadosabertos-aneel.opendata.arcgis.com como arquivos .gdb
 * por distribuidora. Para servir no browser usamos PMTiles (Rede MT) e
 * GeoJSON (Transformadores) via Cloudflare Worker com CORS.
 *
 * Entidades do Módulo 10 – SIG Regulatório (nomes das camadas no .gdb):
 *   SSDMT  - Segmentos de rede MT (linhas média tensão)
 *   SSDBT  - Segmentos de rede BT (linhas baixa tensão)
 *   UNTRMT - Unidades transformadoras MT (pontos)
 *   PONNOT - Pontos notáveis / postes (pontos)
 *
 * Pipeline de processamento (executar uma vez por ciclo BDGD):
 *   → GitHub Actions › "Processar BDGD" › Run workflow
 *   → Parâmetros em scratchpad/bdgd-distribuidoras.md
 *
 * CDN: Cloudflare Worker multi-distribuidora (workers/bdgd-cors-worker.js) em
 *   https://bdgd-cors.markfield-app.workers.dev
 * Roteamento: /{conc}/{arquivo} → GitHub Releases bdgd-{conc}-2024
 * O Worker serve com CORS headers (range requests ok para PMTiles).
 *
 * Para adicionar nova distribuidora após workflow executado:
 *   1. Defina `urls` na entrada correspondente em BDGD_FONTES abaixo.
 *   2. `ssdmt` deve apontar para .pmtiles (streaming eficiente).
 *   3. `untrmt` aponta para .geojson dos transformadores.
 */

import maplibregl from "maplibre-gl";
import { Protocol } from "pmtiles";

// ---------------------------------------------------------------------------
// Protocolo PMTiles (registrado uma única vez no carregamento do módulo)
// ---------------------------------------------------------------------------

const _pmtilesProtocol = new Protocol();
maplibregl.addProtocol("pmtiles", _pmtilesProtocol.tilev4.bind(_pmtilesProtocol));

// ---------------------------------------------------------------------------
// CDN base URL
// ---------------------------------------------------------------------------

/** Cloudflare Worker que serve os assets BDGD com CORS. */
const BDGD_CDN = "https://bdgd-cors.markfield-app.workers.dev";

// ---------------------------------------------------------------------------
// IDs internos
// ---------------------------------------------------------------------------

/** Prefixo de todos os sources e layers da BDGD — nunca colidem com mkf- */
const BDGD_PFX = "bdgd";

/** Sources: um por camada (GeoJSON individual por tipo de entidade). */
export const BDGD_SRC = {
  redeMT: `${BDGD_PFX}-src-rede-mt`,
  redeBT: `${BDGD_PFX}-src-rede-bt`,
  transformadores: `${BDGD_PFX}-src-trafos`,
  postes: `${BDGD_PFX}-src-postes`,
} as const;

/** Layers MapLibre da BDGD. */
export const BDGD_LYR = {
  redeMT: `${BDGD_PFX}-rede-mt`,
  redeBT: `${BDGD_PFX}-rede-bt`,
  transformadores: `${BDGD_PFX}-trafos`,
  postes: `${BDGD_PFX}-postes`,
} as const;

export type BdgdLayerId = (typeof BDGD_LYR)[keyof typeof BDGD_LYR];

// ---------------------------------------------------------------------------
// Metadados de cada camada (para o PainelCamadas)
// ---------------------------------------------------------------------------

export interface BdgdCamadaMeta {
  id: BdgdLayerId;
  label: string;
  /** Cor da bolinha de legenda no painel. */
  cor: string;
  /** Zoom mínimo em que a camada fica visível por padrão. */
  minZoom: number;
}

export const BDGD_CAMADAS: BdgdCamadaMeta[] = [
  { id: BDGD_LYR.redeMT, label: "Rede MT", cor: "#f59e0b", minZoom: 10 },
  { id: BDGD_LYR.redeBT, label: "Rede BT", cor: "#94a3b8", minZoom: 12 },
  { id: BDGD_LYR.transformadores, label: "Transformadores", cor: "#ef4444", minZoom: 11 },
  { id: BDGD_LYR.postes, label: "Postes", cor: "#334155", minZoom: 14 },
];

/** Conjunto padrão de camadas ativas (todas). */
export const BDGD_CAMADAS_PADRAO = new Set<string>(BDGD_CAMADAS.map((c) => c.id));

// ---------------------------------------------------------------------------
// Distribuidoras suportadas
// ---------------------------------------------------------------------------

export interface BdgdFonte {
  id: string;
  nome: string;
  uf: string;
  /**
   * URLs dos assets por entidade. `undefined` = dado não processado ainda
   * (layers inicializadas vazias — framework ligável, sem dados).
   *
   * URLs servidas pelo Cloudflare Worker (BDGD_CDN) com CORS e range requests.
   * PMTiles recomendado para rede MT (streaming eficiente por bbox).
   */
  urls?: {
    ssdmt?: string; // Segmentos MT  (.pmtiles)
    ssdbt?: string; // Segmentos BT  (.pmtiles, opcional)
    untrmt?: string; // Transformadores (.geojson)
    ponnot?: string; // Postes (.geojson, opcional)
  };
}

export const BDGD_FONTES: BdgdFonte[] = [
  // ── SP / MS ───────────────────────────────────────────────────────────────
  {
    id: "elektro",
    nome: "Neoenergia Elektro",
    uf: "SP / MS",
    // Processado: BDGD Elektro 2024 (ref. 31/12/2024)
    // Release: https://github.com/KogaIgor0/markfield-web/releases/tag/bdgd-elektro-2024
    urls: {
      ssdmt: `${BDGD_CDN}/elektro/rede-mt.pmtiles`,
      untrmt: `${BDGD_CDN}/elektro/trafos.geojson`,
    },
  },
  {
    id: "cpfl-paulista",
    nome: "CPFL Paulista",
    uf: "SP",
    // Processado: BDGD CPFL Paulista 2024 (ref. 31/12/2024)
    // Release: https://github.com/KogaIgor0/markfield-web/releases/tag/bdgd-cpfl-paulista-2024
    urls: {
      ssdmt: `${BDGD_CDN}/cpfl-paulista/rede-mt.pmtiles`,
      untrmt: `${BDGD_CDN}/cpfl-paulista/trafos.geojson`,
    },
  },
  {
    id: "cpfl-piratininga",
    nome: "CPFL Piratininga",
    uf: "SP",
    // Processado: BDGD CPFL Piratininga 2024 (ref. 31/12/2024)
    // Release: https://github.com/KogaIgor0/markfield-web/releases/tag/bdgd-cpfl-piratininga-2024
    urls: {
      ssdmt: `${BDGD_CDN}/cpfl-piratininga/rede-mt.pmtiles`,
      untrmt: `${BDGD_CDN}/cpfl-piratininga/trafos.geojson`,
    },
  },
  {
    id: "enel-sp",
    nome: "Enel Distribuição SP",
    uf: "SP",
    // Processado: BDGD Enel SP 2024 (ref. 31/12/2024)
    // Release: https://github.com/KogaIgor0/markfield-web/releases/tag/bdgd-enel-sp-2024
    urls: {
      ssdmt: `${BDGD_CDN}/enel-sp/rede-mt.pmtiles`,
      untrmt: `${BDGD_CDN}/enel-sp/trafos.geojson`,
    },
  },
  // ── MG ────────────────────────────────────────────────────────────────────
  {
    id: "cemig",
    nome: "CEMIG-D",
    uf: "MG",
    // Processado: BDGD CEMIG 2024 (ref. 31/12/2024)
    // Release: https://github.com/KogaIgor0/markfield-web/releases/tag/bdgd-cemig-2024
    urls: {
      ssdmt: `${BDGD_CDN}/cemig/rede-mt.pmtiles`,
      untrmt: `${BDGD_CDN}/cemig/trafos.geojson`,
    },
  },
  // ── PR ────────────────────────────────────────────────────────────────────
  {
    id: "copel",
    nome: "Copel Distribuição",
    uf: "PR",
    // Processado: BDGD Copel 2024 (ref. 31/12/2024)
    // Release: https://github.com/KogaIgor0/markfield-web/releases/tag/bdgd-copel-2024
    urls: {
      ssdmt: `${BDGD_CDN}/copel/rede-mt.pmtiles`,
      untrmt: `${BDGD_CDN}/copel/trafos.geojson`,
    },
  },
  // ── BA ────────────────────────────────────────────────────────────────────
  {
    id: "coelba",
    nome: "Neoenergia Coelba",
    uf: "BA",
    // Pendente: rodar workflow com dataset_id=ac3bf2f2b06447ec80493372ca4c9845
  },
  // ── Equatorial ────────────────────────────────────────────────────────────
  {
    id: "equatorial-pa",
    nome: "Equatorial Pará",
    uf: "PA",
    // Pendente: rodar workflow com dataset_id=60a26bb11754487db39fa6bb91e5dce2
    urls: {
      ssdmt:  "https://bdgd-cors.markfield-app.workers.dev/equatorial-pa/rede-mt.pmtiles",
      untrmt: "https://bdgd-cors.markfield-app.workers.dev/equatorial-pa/trafos.geojson",
    },
  },
  {
    id: "equatorial-ma",
    nome: "Equatorial Maranhão",
    uf: "MA",
    // Pendente: rodar workflow com dataset_id=ba59d4a881684374b53f51656b945b18
    urls: {
      ssdmt:  "https://bdgd-cors.markfield-app.workers.dev/equatorial-ma/rede-mt.pmtiles",
      untrmt: "https://bdgd-cors.markfield-app.workers.dev/equatorial-ma/trafos.geojson",
    },
  },
  {
    id: "equatorial-pi",
    nome: "Equatorial Piauí",
    uf: "PI",
    // Pendente: rodar workflow com dataset_id=642e8c25d57d4a3893c0d069c4363911
  },
  {
    id: "equatorial-al",
    nome: "Equatorial Alagoas",
    uf: "AL",
    // Pendente: rodar workflow com dataset_id=78d8ae0fe3cc46888dc37f2c87bc3f00
    urls: {
      ssdmt:  "https://bdgd-cors.markfield-app.workers.dev/equatorial-al/rede-mt.pmtiles",
      untrmt: "https://bdgd-cors.markfield-app.workers.dev/equatorial-al/trafos.geojson",
    },
  },
  {
    id: "equatorial-go",
    nome: "Equatorial Goiás",
    uf: "GO",
    // Pendente: rodar workflow com dataset_id=4c2fc0e35982454bbc54db53d1532b90
  },
  {
    id: "ceee",
    nome: "CEEE Equatorial",
    uf: "RS",
    // Pendente: rodar workflow com dataset_id=15b77072ab3b46bb8581cca726cdf08a
  },
  {
    id: "cea",
    nome: "CEA Equatorial",
    uf: "AP",
    // Pendente: rodar workflow com dataset_id=123cf701fce4495bab5a673435fb4cbc
    urls: {
      ssdmt:  "https://bdgd-cors.markfield-app.workers.dev/cea/rede-mt.pmtiles",
      untrmt: "https://bdgd-cors.markfield-app.workers.dev/cea/trafos.geojson",
    },
  },
  // ── Energisa ──────────────────────────────────────────────────────────────
  {
    id: "energisa-mt",
    nome: "Energisa Mato Grosso",
    uf: "MT",
    // Processado: BDGD Energisa MT 2024 (ref. 31/12/2024)
    // Release: https://github.com/KogaIgor0/markfield-web/releases/tag/bdgd-energisa-mt-2024
    urls: {
      ssdmt: `${BDGD_CDN}/energisa-mt/rede-mt.pmtiles`,
      untrmt: `${BDGD_CDN}/energisa-mt/trafos.geojson`,
    },
  },
  {
    id: "energisa-ms",
    nome: "Energisa Mato Grosso do Sul",
    uf: "MS",
    // Pendente: rodar workflow com dataset_id=b7fad4cd388845a08a01643599ec747b
  },
  {
    id: "energisa-to",
    nome: "Energisa Tocantins",
    uf: "TO",
    // Pendente: rodar workflow com dataset_id=1bfec53ce077408581c6b2a82076d89a
  },
  {
    id: "energisa-pb",
    nome: "Energisa Paraíba",
    uf: "PB",
    // Pendente: rodar workflow com dataset_id=700e0bfcb04349fea9d1d0af43c2a354
  },
  {
    id: "energisa-se",
    nome: "Energisa Sergipe",
    uf: "SE",
    // Pendente: rodar workflow com dataset_id=910e329827a04ffda153c235ac9c5bc1
    urls: {
      ssdmt:  "https://bdgd-cors.markfield-app.workers.dev/energisa-se/rede-mt.pmtiles",
      untrmt: "https://bdgd-cors.markfield-app.workers.dev/energisa-se/trafos.geojson",
    },
  },
  {
    id: "energisa-mg-rio",
    nome: "Energisa Minas Rio",
    uf: "MG / RJ",
    // Pendente: rodar workflow com dataset_id=bc209c308cac42b9b03fb963ca9c5602
    urls: {
      ssdmt:  "https://bdgd-cors.markfield-app.workers.dev/energisa-mg-rio/rede-mt.pmtiles",
      untrmt: "https://bdgd-cors.markfield-app.workers.dev/energisa-mg-rio/trafos.geojson",
    },
  },
  {
    id: "energisa-sul",
    nome: "Energisa Sul-Sudeste",
    uf: "MG / SP / PR",
    // Pendente: rodar workflow com dataset_id=00eedc147efc4020993a6c9cf9c6d3cc
  },
  {
    id: "energisa-ro",
    nome: "Energisa Rondônia",
    uf: "RO",
    // Pendente: rodar workflow com dataset_id=cb6bd431508544a49256c4a03cdf7cc7
  },
  {
    id: "energisa-ac",
    nome: "Energisa Acre",
    uf: "AC",
    // Pendente: rodar workflow com dataset_id=0d3f9d648eb54c758b592b794faf2ccc
  },
];

/** Só as fontes com dados processados (urls definidas). */
export const BDGD_FONTES_DISPONIVEIS = BDGD_FONTES.filter((f) => f.urls !== undefined);

// ---------------------------------------------------------------------------
// Inicialização no MapLibre
// ---------------------------------------------------------------------------

/** GeoJSON vazio (source placeholder antes dos dados chegarem). */
const FC_VAZIO: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

/**
 * Estilo canônico da Rede MT — reutilizado ao trocar a source de
 * GeoJSON para PMTiles (a source-layer fica "rede_mt" por convenção do
 * pipeline). Extraído aqui para não duplicar entre inicializar e carregar.
 */
const REDE_MT_LAYER_BASE = {
  type: "line" as const,
  minzoom: 10,
  layout: { "line-cap": "round" as const, "line-join": "round" as const },
  paint: {
    "line-color": "#f59e0b",
    "line-width": ["interpolate", ["linear"], ["zoom"], 10, 1, 14, 2.5, 18, 4],
    "line-opacity": 0.9,
  },
};

/**
 * Adiciona ao mapa os sources e layers da BDGD.
 * Deve ser chamada UMA VEZ, dentro do handler `map.on("load", ...)`,
 * ANTES de qualquer layer do projeto (mkf-*) para ficar por baixo.
 */
export function inicializarCamadasBdgd(map: maplibregl.Map, beforeId?: string): void {
  map.addSource(BDGD_SRC.redeMT, { type: "geojson", data: FC_VAZIO });
  map.addSource(BDGD_SRC.redeBT, { type: "geojson", data: FC_VAZIO });
  map.addSource(BDGD_SRC.transformadores, { type: "geojson", data: FC_VAZIO });
  map.addSource(BDGD_SRC.postes, { type: "geojson", data: FC_VAZIO });

  const opts = (id: string) => (beforeId && map.getLayer(beforeId) ? { id, beforeId } : { id });

  // Rede MT (linhas âmbar)
  map.addLayer(
    {
      ...opts(BDGD_LYR.redeMT),
      ...REDE_MT_LAYER_BASE,
      source: BDGD_SRC.redeMT,
    } as maplibregl.LayerSpecification,
  );

  // Rede BT (linhas cinza)
  map.addLayer(
    {
      ...opts(BDGD_LYR.redeBT),
      type: "line",
      source: BDGD_SRC.redeBT,
      minzoom: 12,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": "#94a3b8",
        "line-width": ["interpolate", ["linear"], ["zoom"], 12, 0.8, 16, 2],
        "line-opacity": 0.85,
      },
    } as maplibregl.LayerSpecification,
  );

  // Transformadores (pontos vermelhos)
  map.addLayer(
    {
      ...opts(BDGD_LYR.transformadores),
      type: "circle",
      source: BDGD_SRC.transformadores,
      minzoom: 11,
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 11, 3, 15, 7, 18, 10],
        "circle-color": "#ef4444",
        "circle-stroke-width": 1.5,
        "circle-stroke-color": "#fff",
        "circle-opacity": 0.9,
      },
    } as maplibregl.LayerSpecification,
  );

  // Postes (pontos cinza-escuro)
  map.addLayer(
    {
      ...opts(BDGD_LYR.postes),
      type: "circle",
      source: BDGD_SRC.postes,
      minzoom: 14,
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 14, 2, 17, 5],
        "circle-color": "#334155",
        "circle-stroke-width": 1,
        "circle-stroke-color": "#fff",
        "circle-opacity": 0.85,
      },
    } as maplibregl.LayerSpecification,
  );
}

/**
 * Remove os sources e layers da BDGD do mapa.
 * Seguro chamar mesmo se já foram removidos.
 */
export function removerCamadasBdgd(map: maplibregl.Map): void {
  for (const id of Object.values(BDGD_LYR)) if (map.getLayer(id)) map.removeLayer(id);
  for (const id of Object.values(BDGD_SRC)) if (map.getSource(id)) map.removeSource(id);
}

/**
 * Aplica visibilidade conforme o conjunto de layers ativos.
 */
export function aplicarVisibilidadeBdgd(map: maplibregl.Map, ativas: Set<string>): void {
  for (const id of Object.values(BDGD_LYR)) {
    if (!map.getLayer(id)) continue;
    map.setLayoutProperty(id, "visibility", ativas.has(id) ? "visible" : "none");
  }
}

/**
 * Carrega os dados de uma BdgdFonte nos sources do mapa.
 * URLs .pmtiles → source vector via protocolo pmtiles://.
 * Demais URLs → GeoJSON via fetch.
 */
export async function carregarDadosBdgd(map: maplibregl.Map, fonte: BdgdFonte): Promise<void> {
  const u = fonte.urls;
  if (!u) return;

  const carregarGeoJson = async (srcId: string, url: string | undefined) => {
    if (!url) return;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const geojson = (await res.json()) as GeoJSON.FeatureCollection;
      const src = map.getSource(srcId) as maplibregl.GeoJSONSource | undefined;
      src?.setData(geojson);
    } catch (err) {
      console.warn(`[BDGD] Falha ao carregar ${url}:`, err);
    }
  };

  const carregarRedeMtPmTiles = (url: string) => {
    if (map.getLayer(BDGD_LYR.redeMT)) map.removeLayer(BDGD_LYR.redeMT);
    if (map.getSource(BDGD_SRC.redeMT)) map.removeSource(BDGD_SRC.redeMT);

    map.addSource(BDGD_SRC.redeMT, { type: "vector", url: `pmtiles://${url}` });
    map.addLayer({
      ...REDE_MT_LAYER_BASE,
      id: BDGD_LYR.redeMT,
      source: BDGD_SRC.redeMT,
      "source-layer": "rede_mt",
    } as maplibregl.LayerSpecification);
  };

  if (u.ssdmt?.endsWith(".pmtiles")) {
    carregarRedeMtPmTiles(u.ssdmt);
  } else {
    await carregarGeoJson(BDGD_SRC.redeMT, u.ssdmt);
  }

  await Promise.all([
    carregarGeoJson(BDGD_SRC.redeBT, u.ssdbt),
    carregarGeoJson(BDGD_SRC.transformadores, u.untrmt),
    carregarGeoJson(BDGD_SRC.postes, u.ponnot),
  ]);
}
