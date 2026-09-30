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
 *   → ver scripts/processar-bdgd.sh
 *
 * Dados Elektro 2024 (ref. 31/12/2024):
 *   https://dadosabertos-aneel.opendata.arcgis.com/datasets/8eaa712a707745adac9948b24e188bd9
 *
 * CDN: Cloudflare Worker (workers/bdgd-cors-worker.js) em
 *   https://bdgd-cors.markfield-app.workers.dev
 * O Worker busca os arquivos do GitHub Releases e serve com CORS headers,
 * resolvendo o bloqueio de cross-origin em ambientes sandboxed (StackBlitz).
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
    ssdmt?: string; // Segmentos MT
    ssdbt?: string; // Segmentos BT
    untrmt?: string; // Transformadores
    ponnot?: string; // Postes
  };
}

export const BDGD_FONTES: BdgdFonte[] = [
  {
    id: "elektro",
    nome: "Neoenergia Elektro",
    uf: "SP / MS",
    // Dados processados a partir da BDGD Elektro 2024 (ref. 31/12/2024).
    // Release: https://github.com/KogaIgor0/markfield-web/releases/tag/bdgd-elektro-2024
    // Servidos via Cloudflare Worker com CORS (workers/bdgd-cors-worker.js).
    urls: {
      ssdmt: `${BDGD_CDN}/rede-mt.pmtiles`,
      untrmt: `${BDGD_CDN}/trafos.geojson`,
    },
  },
];

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
