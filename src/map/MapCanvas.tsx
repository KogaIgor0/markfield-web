import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { FeatureCollection, Point } from "geojson";
import type { LatLng, Projeto, TipoPonto } from "../domain/model";
import { fotosGeoJson, linhasGeoJson, pontosGeoJson } from "./geojson";
import { MAPTILER_KEY } from "../config";

/**
 * Mapa base + render + EDIÇÃO do projeto (Fase 2).
 *
 * Interações: selecionar ponto (clique), arrastar para mover, e adicionar ponto
 * (modo "adicionar" → clique no mapa). As mudanças sobem via callbacks; quem
 * altera o modelo é o motor de edição no App. Aqui só desenhamos e capturamos.
 */

/**
 * Base de satélite (D-09): **MapTiler satellite-v2**. Cobertura global com zoom
 * profundo e sem o placeholder "Map data not yet available" da Esri. Usamos a
 * TileJSON (`url`) para o MapLibre pegar o zoom máximo real da fonte e fazer o
 * overzoom certo além dele. Tiles de 512 px (padrão do MapTiler).
 */
const ESTILO_SATELITE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    satelite: {
      type: "raster",
      url: `https://api.maptiler.com/tiles/satellite-v2/tiles.json?key=${MAPTILER_KEY}`,
      tileSize: 512,
      attribution: "© MapTiler © Esri, Maxar, Earthstar Geographics",
    },
  },
  layers: [{ id: "satelite", type: "raster", source: "satelite" }],
};

const CENTRO_INICIAL: [number, number] = [-47.9, -15.8];
const ZOOM_INICIAL = 4;

const SRC = {
  pontos: "mkf-pontos",
  fotos: "mkf-fotos",
  linhas: "mkf-linhas",
  preview: "mkf-preview",
} as const;
const LYR = {
  linhas: "mkf-linhas",
  selLinha: "mkf-sel-linha",
  preview: "mkf-preview",
  sel: "mkf-sel",
  fotos: "mkf-fotos",
  pontos: "mkf-pontos",
} as const;

function esc(s: unknown): string {
  return String(s ?? "").replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c,
  );
}

export type Modo = "selecionar" | "ligar" | { adicionar: TipoPonto };

interface MapCanvasProps {
  projeto?: Projeto | null;
  imagens?: Map<string, string>;
  selecionadoId?: string | null;
  selecionadoTrechoId?: string | null;
  modo?: Modo;
  /** Poste de origem já escolhido no modo "ligar" (para o preview elástico). */
  ligarDeId?: string | null;
  /** Muda quando um NOVO projeto é aberto — dispara o auto-enquadramento. */
  chaveEnquadramento?: number;
  onSelecionar?: (id: string | null) => void;
  onSelecionarTrecho?: (id: string | null) => void;
  onMoverPonto?: (id: string, wgs84: LatLng) => void;
  onAdicionarPonto?: (wgs84: LatLng) => void;
  onPontoClicado?: (id: string) => void;
}

export function MapCanvas(props: MapCanvasProps) {
  const { projeto, selecionadoId, selecionadoTrechoId, modo, chaveEnquadramento } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const fcRef = useRef<FeatureCollection<Point> | null>(null);
  const dragRef = useRef<string | null>(null);
  const prontoRef = useRef(false); // mapa carregado (monotônico; não confiar em isStyleLoaded, que oscila)

  // Espelho sempre-atual das props para os handlers registrados uma vez só.
  const propsRef = useRef(props);
  propsRef.current = props;

  // Cria o mapa e registra os handlers de interação uma única vez.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: ESTILO_SATELITE,
      center: CENTRO_INICIAL,
      zoom: ZOOM_INICIAL,
      maxZoom: 20, // não deixa esticar a imagem além do razoável
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl(), "top-right");
    map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");
    mapRef.current = map;
    map.on("load", () => {
      prontoRef.current = true;
    });

    const emModoAdicionar = () => typeof propsRef.current.modo === "object";
    const emModoLigar = () => propsRef.current.modo === "ligar";

    const coordDoPonto = (id: string): [number, number] | null => {
      const p = propsRef.current.projeto?.pontos.find((x) => x.id === id);
      return p ? [p.wgs84.lng, p.wgs84.lat] : null;
    };

    // Arraste de ponto (só no modo selecionar). `arrastou` só vira true se o
    // mouse REALMENTE se moveu — um clique limpo (mousedown+mouseup no mesmo
    // lugar) não dispara mousemove, então NÃO move o ponto (só seleciona).
    let arrastou = false;
    const onMove = (e: maplibregl.MapMouseEvent) => {
      const id = dragRef.current;
      const fc = fcRef.current;
      if (!id || !fc) return;
      arrastou = true;
      const f = fc.features.find((ft) => ft.properties?.id === id);
      if (f) {
        f.geometry.coordinates = [e.lngLat.lng, e.lngLat.lat];
        (map.getSource(SRC.pontos) as maplibregl.GeoJSONSource).setData(fc);
      }
    };
    const onUp = (e: maplibregl.MapMouseEvent) => {
      map.off("mousemove", onMove);
      map.getCanvas().style.cursor = "";
      const id = dragRef.current;
      dragRef.current = null;
      if (id && arrastou) propsRef.current.onMoverPonto?.(id, { lat: e.lngLat.lat, lng: e.lngLat.lng });
    };
    map.on("mousedown", LYR.pontos, (e) => {
      const id = e.features?.[0]?.properties?.id as string | undefined;
      if (!id) return;
      if (emModoLigar()) {
        e.preventDefault();
        propsRef.current.onPontoClicado?.(id);
        return;
      }
      if (emModoAdicionar()) return;
      e.preventDefault(); // impede o pan do mapa
      propsRef.current.onSelecionar?.(id);
      dragRef.current = id;
      arrastou = false;
      map.getCanvas().style.cursor = "grabbing";
      map.on("mousemove", onMove);
      map.once("mouseup", onUp);
    });

    // Preview elástico no modo ligar: linha do poste de origem até o cursor.
    map.on("mousemove", (e) => {
      const src = map.getSource(SRC.preview) as maplibregl.GeoJSONSource | undefined;
      if (!src) return;
      const de = emModoLigar() && propsRef.current.ligarDeId ? coordDoPonto(propsRef.current.ligarDeId) : null;
      if (de) {
        src.setData({
          type: "Feature",
          geometry: { type: "LineString", coordinates: [de, [e.lngLat.lng, e.lngLat.lat]] },
          properties: {},
        });
      } else {
        src.setData({ type: "FeatureCollection", features: [] });
      }
    });

    // Selecionar um trecho (só no modo selecionar).
    map.on("click", LYR.linhas, (e) => {
      if (emModoLigar() || emModoAdicionar()) return;
      const id = e.features?.[0]?.properties?.id as string | undefined;
      if (!id) return;
      propsRef.current.onSelecionarTrecho?.(id);
      propsRef.current.onSelecionar?.(null);
    });

    // Ponteiro ao passar sobre um ponto (no modo selecionar).
    map.on("mouseenter", LYR.pontos, () => {
      if (!emModoAdicionar() && !emModoLigar()) map.getCanvas().style.cursor = "grab";
    });
    map.on("mouseleave", LYR.pontos, () => {
      if (!dragRef.current && !emModoAdicionar() && !emModoLigar()) {
        map.getCanvas().style.cursor = "";
      }
    });

    // Foto → popup com a imagem.
    map.on("click", LYR.fotos, (e) => {
      const f = e.features?.[0];
      if (!f || f.geometry.type !== "Point") return;
      const [lng, lat] = f.geometry.coordinates as [number, number];
      const p = f.properties ?? {};
      const url = p.nome ? propsRef.current.imagens?.get(String(p.nome)) : undefined;
      const prec = p.precisaoM != null && p.precisaoM !== "" ? `${p.precisaoM} m` : "—";
      const html = `
        <div class="pop">
          <div class="pop-h">${esc(p.nome || "Foto")}</div>
          ${url ? `<img class="pop-img" src="${esc(url)}" alt="${esc(p.nome)}" />` : `<div class="pop-obs">(imagem não carregada)</div>`}
          <table class="pop-t">
            <tr><td>Precisão</td><td>${esc(prec)}${p.baixaConfianca ? " ⚠︎ baixa" : ""}</td></tr>
            ${p.capturadaEm ? `<tr><td>Tirada</td><td>${esc(p.capturadaEm)}</td></tr>` : ""}
          </table>
        </div>`;
      new maplibregl.Popup({ maxWidth: "340px" }).setLngLat([lng, lat]).setHTML(html).addTo(map);
    });

    // Clique geral: adicionar (modo adicionar) ou desmarcar (clique no vazio).
    map.on("click", (e) => {
      const m = propsRef.current.modo;
      if (typeof m === "object") {
        propsRef.current.onAdicionarPonto?.({ lat: e.lngLat.lat, lng: e.lngLat.lng });
        return;
      }
      if (m === "ligar") return; // cliques tratados pelo handler dos postes
      const sobre = map.queryRenderedFeatures(e.point, {
        layers: [LYR.pontos, LYR.fotos, LYR.linhas],
      });
      if (sobre.length === 0) {
        propsRef.current.onSelecionar?.(null);
        propsRef.current.onSelecionarTrecho?.(null);
      }
    });

    return () => {
      map.remove();
      mapRef.current = null;
      prontoRef.current = false;
    };
  }, []);

  // Desenha o projeto quando muda.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !projeto) return;
    const desenhar = () => {
      const fc = pontosGeoJson(projeto);
      fcRef.current = fc;
      desenharProjeto(map, projeto, fc);
      aplicarSelecao(map, propsRef.current.selecionadoId ?? null);
      aplicarSelecaoTrecho(map, propsRef.current.selecionadoTrechoId ?? null);
    };
    if (prontoRef.current) desenhar();
    else map.once("load", desenhar);
    return () => {
      map.off("load", desenhar);
    };
  }, [projeto]);

  // Auto-enquadramento apenas quando um novo projeto é aberto.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !projeto || !chaveEnquadramento) return;
    const fit = () => enquadrar(map, projeto);
    if (prontoRef.current) fit();
    else map.once("load", fit);
    return () => {
      map.off("load", fit);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chaveEnquadramento]);

  // Destaque do ponto selecionado.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    aplicarSelecao(map, selecionadoId ?? null);
  }, [selecionadoId]);

  // Destaque do trecho selecionado.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    aplicarSelecaoTrecho(map, selecionadoTrechoId ?? null);
  }, [selecionadoTrechoId]);

  // Cursor conforme o modo (adicionar/ligar = cruz).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.getCanvas().style.cursor = typeof modo === "object" || modo === "ligar" ? "crosshair" : "";
  }, [modo]);

  return <div ref={containerRef} className="map-canvas" />;
}

function aplicarSelecao(map: maplibregl.Map, id: string | null) {
  if (!map.getLayer(LYR.sel)) return;
  map.setFilter(LYR.sel, ["==", ["get", "id"], id ?? "__nenhum__"]);
}

function aplicarSelecaoTrecho(map: maplibregl.Map, id: string | null) {
  if (!map.getLayer(LYR.selLinha)) return;
  map.setFilter(LYR.selLinha, ["==", ["get", "id"], id ?? "__nenhum__"]);
}

function limpar(map: maplibregl.Map) {
  for (const id of Object.values(LYR)) if (map.getLayer(id)) map.removeLayer(id);
  for (const id of Object.values(SRC)) if (map.getSource(id)) map.removeSource(id);
}

function desenharProjeto(map: maplibregl.Map, projeto: Projeto, pontosFc: FeatureCollection<Point>) {
  limpar(map);

  map.addSource(SRC.linhas, { type: "geojson", data: linhasGeoJson(projeto) });
  map.addSource(SRC.fotos, { type: "geojson", data: fotosGeoJson(projeto) });
  map.addSource(SRC.pontos, { type: "geojson", data: pontosFc });
  map.addSource(SRC.preview, { type: "geojson", data: { type: "FeatureCollection", features: [] } });

  // Destaque do trecho selecionado (linha grossa por baixo).
  map.addLayer({
    id: LYR.selLinha,
    type: "line",
    source: SRC.linhas,
    filter: ["==", ["get", "id"], "__nenhum__"],
    paint: { "line-color": "#c6740e", "line-width": 8, "line-opacity": 0.55 },
  });

  map.addLayer({
    id: LYR.linhas,
    type: "line",
    source: SRC.linhas,
    paint: {
      "line-color": [
        "match",
        ["get", "estilo"],
        "rede",
        "#ff9d00",
        "cerca",
        "#f44336",
        "continua",
        "#4caf50",
        "pontoTraco",
        "#2196f3",
        "#4caf50",
      ],
      "line-width": 3,
    },
  });

  // Preview elástico do modo ligar (tracejado).
  map.addLayer({
    id: LYR.preview,
    type: "line",
    source: SRC.preview,
    paint: { "line-color": "#ff9d00", "line-width": 2, "line-dasharray": [2, 2] },
  });

  // Anel de seleção (abaixo dos pontos; segue o ponto no arraste, mesma fonte).
  map.addLayer({
    id: LYR.sel,
    type: "circle",
    source: SRC.pontos,
    filter: ["==", ["get", "id"], "__nenhum__"],
    paint: {
      "circle-radius": 13,
      "circle-color": "rgba(0,0,0,0)",
      "circle-stroke-width": 3,
      "circle-stroke-color": "#c6740e",
    },
  });

  map.addLayer({
    id: LYR.fotos,
    type: "circle",
    source: SRC.fotos,
    paint: {
      "circle-radius": 5,
      "circle-color": ["case", ["get", "baixaConfianca"], "#9aa0a6", "#4caf50"],
      "circle-opacity": ["case", ["get", "baixaConfianca"], 0.5, 0.95],
      "circle-stroke-width": 1.5,
      "circle-stroke-color": "#ffffff",
    },
  });

  map.addLayer({
    id: LYR.pontos,
    type: "circle",
    source: SRC.pontos,
    paint: {
      "circle-radius": ["match", ["get", "tipo"], "transformador", 8, 7],
      "circle-color": [
        "match",
        ["get", "tipo"],
        "postePropostoo",
        "#f59e0b",
        "transformador",
        "#38bdf8",
        "generico",
        "#9e9e9e",
        "#e5e7eb",
      ],
      "circle-stroke-width": 2,
      "circle-stroke-color": "#ffffff",
    },
  });
}

/** Enquadra nos pontos e nas fotos confiáveis (ignora GPS lixo). */
function enquadrar(map: maplibregl.Map, projeto: Projeto) {
  const bounds = new maplibregl.LngLatBounds();
  let n = 0;
  for (const p of projeto.pontos) {
    bounds.extend([p.wgs84.lng, p.wgs84.lat]);
    n++;
  }
  for (const f of projeto.fotos) {
    if (f.baixaConfianca) continue;
    bounds.extend([f.wgs84.lng, f.wgs84.lat]);
    n++;
  }
  for (const t of projeto.trechos) for (const c of t.caminho ?? []) bounds.extend([c.lng, c.lat]);
  if (n === 0) return;
  map.fitBounds(bounds, { padding: 64, maxZoom: 18, duration: 800 });
}
