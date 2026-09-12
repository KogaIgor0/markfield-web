import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Feature, FeatureCollection, Point } from "geojson";
import type { LatLng, Projeto, TipoPonto } from "../domain/model";
import { fotosGeoJson, linhasGeoJson, pontosGeoJson } from "./geojson";
import { BASE_MAPA, ESRI_MAXZOOM, MAPTILER_KEY } from "../config";

/**
 * Mapa base + render + EDIÇÃO do projeto (Fase 2).
 *
 * Interações: selecionar ponto (clique), arrastar para mover, e adicionar ponto
 * (modo "adicionar" → clique no mapa). As mudanças sobem via callbacks; quem
 * altera o modelo é o motor de edição no App. Aqui só desenhamos e capturamos.
 */

/**
 * Base de satélite (D-09). A fonte é escolhida em `config.ts` (BASE_MAPA).
 *
 * - **Esri** (padrão): imagem nítida; capamos em `maxzoom: 18` e deixamos o
 *   MapLibre esticar além disso, para não aparecer o tile "Map data not yet
 *   available" nos zooms sem cobertura. Se ainda aparecer no zoom máximo,
 *   basta baixar esse número (17, 16…).
 * - **MapTiler**: cobertura global via TileJSON, tiles de 512 px.
 */
const FONTE_ESRI: maplibregl.RasterSourceSpecification = {
  type: "raster",
  tiles: [
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  ],
  tileSize: 256,
  // Capa no zoom com cobertura real (config): acima disso o MapLibre amplia o
  // último tile bom em vez de pedir o tile cinza "Map data not yet available".
  maxzoom: ESRI_MAXZOOM,
  attribution: "Tiles © Esri — World Imagery",
};

const FONTE_MAPTILER: maplibregl.RasterSourceSpecification = {
  type: "raster",
  url: `https://api.maptiler.com/tiles/satellite-v2/tiles.json?key=${MAPTILER_KEY}`,
  tileSize: 512,
  attribution: "© MapTiler © Esri, Maxar, Earthstar Geographics",
};

const ESTILO_SATELITE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    satelite: BASE_MAPA === "maptiler" ? FONTE_MAPTILER : FONTE_ESRI,
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
  medicao: "mkf-medicao",
  estaiSim: "mkf-estai-simbolo",
} as const;
const LYR = {
  linhas: "mkf-linhas",
  linhaReduzida: "mkf-linha-reduzida",
  selLinha: "mkf-sel-linha",
  preview: "mkf-preview",
  sel: "mkf-sel",
  estai: "mkf-estai",
  estaiOk: "mkf-estai-ok",
  sugCE4: "mkf-sug-ce4",
  fotos: "mkf-fotos",
  pontos: "mkf-pontos",
  estaiLinha: "mkf-estai-linha",
  estaiAncora: "mkf-estai-ancora",
  medicaoLinha: "mkf-medicao-linha",
  medicaoPts: "mkf-medicao-pts",
} as const;

function esc(s: unknown): string {
  return String(s ?? "").replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c,
  );
}

export type Modo = "selecionar" | "ligar" | "medir" | "inserir" | { adicionar: TipoPonto };

interface MapCanvasProps {
  projeto?: Projeto | null;
  imagens?: Map<string, string>;
  selecionadoId?: string | null;
  selecionadoTrechoId?: string | null;
  modo?: Modo;
  /** Poste de origem já escolhido no modo "ligar" (para o preview elástico). */
  ligarDeId?: string | null;
  /** id do poste → papel na rede (B1). Colore os postes quando `modoRede`. */
  papeis?: Map<string, string>;
  /** Colorir os postes pelo papel na rede (em vez de pelo tipo). */
  modoRede?: boolean;
  /**
   * Ponto habilitado para arraste. Só ESTE ponto se move no mapa — os demais
   * apenas selecionam ao toque. Evita mover um ponto "sem querer" (o arraste é
   * uma ação deliberada, ligada pelo painel).
   */
  movendoId?: string | null;
  /** id do poste → rótulo de estrutura (B3). Aparece sobre o poste no modo Rede. */
  rotulosEstrutura?: Map<string, string>;
  /** ids dos postes com estai PENDENTE (B4). Anel vermelho no modo Rede. */
  estaiIds?: Set<string>;
  /** ids dos postes com estai já instalado (B4). Anel verde no modo Rede. */
  estaiInstaladoIds?: Set<string>;
  /** ids dos postes sugeridos para CE4 (E-01/A). Anel âmbar tracejado no modo Rede. */
  sugCE4Ids?: Set<string>;
  /** Segmentos do estai instalado (poste → âncora), no sentido do esforço. */
  estais?: { de: LatLng; ate: LatLng }[];
  /** Pontos da régua de medição (modo "medir"). */
  medicao?: LatLng[];
  onMedirPonto?: (wgs84: LatLng) => void;
  /** Mostra as fotos no mapa (podem poluir a análise). */
  mostrarFotos?: boolean;
  /** Mostra o número do poste como rótulo permanente (E-06). */
  mostrarNumeros?: boolean;
  /** Muda quando um NOVO projeto é aberto — dispara o auto-enquadramento. */
  chaveEnquadramento?: number;
  onSelecionar?: (id: string | null) => void;
  onSelecionarTrecho?: (id: string | null) => void;
  onMoverPonto?: (id: string, wgs84: LatLng) => void;
  onAdicionarPonto?: (wgs84: LatLng) => void;
  onPontoClicado?: (id: string) => void;
}

const COR_TIPO: maplibregl.ExpressionSpecification = [
  "match",
  ["get", "tipo"],
  "postePropostoo",
  "#f59e0b",
  "transformador",
  "#38bdf8",
  "generico",
  "#9e9e9e",
  "#e5e7eb",
];

const COR_PAPEL: maplibregl.ExpressionSpecification = [
  "match",
  ["get", "papel"],
  "fonte",
  "#16a34a",
  "trafo",
  "#38bdf8",
  "angulo",
  "#d97706",
  "derivacao",
  "#a855f7",
  "fim",
  "#ef4444",
  "tangente",
  "#9e9e9e",
  "isolado",
  "#6b7280",
  "#e5e7eb",
];

export function MapCanvas(props: MapCanvasProps) {
  const {
    projeto,
    selecionadoId,
    selecionadoTrechoId,
    modo,
    chaveEnquadramento,
    papeis,
    modoRede,
    rotulosEstrutura,
    estaiIds,
    estaiInstaladoIds,
    sugCE4Ids,
    estais,
    medicao,
    mostrarFotos,
    mostrarNumeros,
  } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const fcRef = useRef<FeatureCollection<Point> | null>(null);
  const dragRef = useRef<string | null>(null);
  const marcadoresRef = useRef<maplibregl.Marker[]>([]);
  const numerosRef = useRef<maplibregl.Marker[]>([]);
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
    const emModoInserir = () => propsRef.current.modo === "inserir";

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
      if (emModoLigar() || emModoInserir()) {
        e.preventDefault();
        propsRef.current.onPontoClicado?.(id);
        return;
      }
      if (emModoAdicionar()) return;
      e.preventDefault(); // impede o pan do mapa
      // Já em modo mover DESTE ponto: inicia o arraste (sem reselecionar, o que
      // apagaria o modo mover). Qualquer outro ponto: só seleciona.
      if (propsRef.current.movendoId === id) {
        dragRef.current = id;
        arrastou = false;
        map.getCanvas().style.cursor = "grabbing";
        map.on("mousemove", onMove);
        map.once("mouseup", onUp);
        return;
      }
      propsRef.current.onSelecionar?.(id);
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
      if (emModoLigar() || emModoAdicionar() || emModoInserir()) return;
      const id = e.features?.[0]?.properties?.id as string | undefined;
      if (!id) return;
      propsRef.current.onSelecionarTrecho?.(id);
      propsRef.current.onSelecionar?.(null);
    });

    // Ponteiro ao passar sobre um ponto (no modo selecionar): "grab" só no ponto
    // habilitado para mover; nos demais, "pointer" (seleciona, não arrasta).
    map.on("mouseenter", LYR.pontos, (e) => {
      if (emModoAdicionar() || emModoLigar() || emModoInserir()) return;
      const id = e.features?.[0]?.properties?.id as string | undefined;
      map.getCanvas().style.cursor = propsRef.current.movendoId === id ? "grab" : "pointer";
    });
    map.on("mouseleave", LYR.pontos, () => {
      if (!dragRef.current && !emModoAdicionar() && !emModoLigar() && !emModoInserir()) {
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
      if (m === "medir") {
        propsRef.current.onMedirPonto?.({ lat: e.lngLat.lat, lng: e.lngLat.lng });
        return;
      }
      if (typeof m === "object") {
        propsRef.current.onAdicionarPonto?.({ lat: e.lngLat.lat, lng: e.lngLat.lng });
        return;
      }
      if (m === "ligar" || m === "inserir") return; // cliques tratados pelo handler dos postes
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
      const fc = pontosGeoJson(
        projeto,
        propsRef.current.papeis,
        propsRef.current.estaiIds,
        propsRef.current.estaiInstaladoIds,
        propsRef.current.sugCE4Ids,
      );
      fcRef.current = fc;
      const cor = propsRef.current.modoRede ? COR_PAPEL : COR_TIPO;
      desenharProjeto(map, projeto, fc, cor, Boolean(propsRef.current.modoRede));
      aplicarSelecao(map, propsRef.current.selecionadoId ?? null);
      aplicarSelecaoTrecho(map, propsRef.current.selecionadoTrechoId ?? null);
      if (map.getLayer(LYR.fotos)) {
        map.setLayoutProperty(
          LYR.fotos,
          "visibility",
          propsRef.current.mostrarFotos === false ? "none" : "visible",
        );
      }
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

  // Papéis / estai mudaram → atualiza os dados dos postes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !projeto || !map.getSource(SRC.pontos)) return;
    const fc = pontosGeoJson(projeto, papeis, estaiIds, estaiInstaladoIds, sugCE4Ids);
    fcRef.current = fc;
    (map.getSource(SRC.pontos) as maplibregl.GeoJSONSource).setData(fc);
  }, [papeis, estaiIds, estaiInstaladoIds, sugCE4Ids, projeto]);

  // Alterna a cor dos postes (papel x tipo) e o anel de estai só no modo Rede.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getLayer(LYR.pontos)) return;
    map.setPaintProperty(LYR.pontos, "circle-color", modoRede ? COR_PAPEL : COR_TIPO);
    for (const l of [LYR.estai, LYR.estaiOk, LYR.sugCE4, LYR.estaiLinha, LYR.estaiAncora]) {
      if (map.getLayer(l)) map.setLayoutProperty(l, "visibility", modoRede ? "visible" : "none");
    }
  }, [modoRede]);

  // Rótulos de estrutura (B3) como marcadores HTML sobre os postes — só no modo
  // Rede. HTML (não símbolo do MapLibre) evita depender de glyphs/fontes externas.
  useEffect(() => {
    const map = mapRef.current;
    for (const m of marcadoresRef.current) m.remove();
    marcadoresRef.current = [];
    if (!map || !modoRede || !projeto || !rotulosEstrutura) return;
    for (const p of projeto.pontos) {
      const rotulo = rotulosEstrutura.get(p.id);
      if (!rotulo) continue;
      const el = document.createElement("div");
      el.className = `rotulo-estrutura${rotulo.endsWith("?") ? " revisar" : ""}`;
      el.textContent = rotulo;
      el.style.pointerEvents = "none"; // não rouba o clique do poste
      const mk = new maplibregl.Marker({ element: el, anchor: "bottom", offset: [0, -12] })
        .setLngLat([p.wgs84.lng, p.wgs84.lat])
        .addTo(map);
      marcadoresRef.current.push(mk);
    }
    return () => {
      for (const m of marcadoresRef.current) m.remove();
      marcadoresRef.current = [];
    };
  }, [projeto, rotulosEstrutura, modoRede]);

  // Rótulo do NÚMERO do poste (E-06) — marcador HTML permanente, à direita do
  // poste, em qualquer modo. Não rouba o clique. Toggle por `mostrarNumeros`.
  useEffect(() => {
    const map = mapRef.current;
    for (const m of numerosRef.current) m.remove();
    numerosRef.current = [];
    if (!map || !mostrarNumeros || !projeto) return;
    for (const p of projeto.pontos) {
      const num = p.numero?.trim();
      if (!num) continue;
      const el = document.createElement("div");
      el.className = "rotulo-numero";
      el.textContent = num;
      el.style.pointerEvents = "none";
      const mk = new maplibregl.Marker({ element: el, anchor: "left", offset: [9, 0] })
        .setLngLat([p.wgs84.lng, p.wgs84.lat])
        .addTo(map);
      numerosRef.current.push(mk);
    }
    return () => {
      for (const m of numerosRef.current) m.remove();
      numerosRef.current = [];
    };
  }, [projeto, mostrarNumeros]);

  // Cursor conforme o modo (adicionar/ligar/medir = cruz).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.getCanvas().style.cursor =
      typeof modo === "object" || modo === "ligar" || modo === "medir" || modo === "inserir"
        ? "crosshair"
        : "";
  }, [modo]);

  // Símbolo do estai (linha + âncora) atualiza quando muda.
  useEffect(() => {
    const map = mapRef.current;
    const src = map?.getSource(SRC.estaiSim) as maplibregl.GeoJSONSource | undefined;
    if (!src) return;
    const feats: Feature[] = [];
    for (const e of estais ?? []) {
      feats.push({
        type: "Feature",
        geometry: { type: "LineString", coordinates: [[e.de.lng, e.de.lat], [e.ate.lng, e.ate.lat]] },
        properties: {},
      });
      feats.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: [e.ate.lng, e.ate.lat] },
        properties: {},
      });
    }
    src.setData({ type: "FeatureCollection", features: feats });
  }, [estais]);

  // Mostra/esconde as fotos.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getLayer(LYR.fotos)) return;
    map.setLayoutProperty(LYR.fotos, "visibility", mostrarFotos === false ? "none" : "visible");
  }, [mostrarFotos]);

  // Régua de medição: atualiza a linha + os pontos.
  useEffect(() => {
    const map = mapRef.current;
    const src = map?.getSource(SRC.medicao) as maplibregl.GeoJSONSource | undefined;
    if (!src) return;
    const pts = medicao ?? [];
    const feats: Feature[] = pts.map((c, i) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [c.lng, c.lat] },
      properties: { i },
    }));
    if (pts.length >= 2) {
      feats.push({
        type: "Feature",
        geometry: { type: "LineString", coordinates: pts.map((c) => [c.lng, c.lat]) },
        properties: {},
      });
    }
    src.setData({ type: "FeatureCollection", features: feats });
  }, [medicao]);

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

function desenharProjeto(
  map: maplibregl.Map,
  projeto: Projeto,
  pontosFc: FeatureCollection<Point>,
  corPonto: maplibregl.ExpressionSpecification,
  modoRede: boolean,
) {
  limpar(map);

  map.addSource(SRC.linhas, { type: "geojson", data: linhasGeoJson(projeto) });
  map.addSource(SRC.fotos, { type: "geojson", data: fotosGeoJson(projeto) });
  map.addSource(SRC.pontos, { type: "geojson", data: pontosFc });
  map.addSource(SRC.preview, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  map.addSource(SRC.medicao, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  map.addSource(SRC.estaiSim, { type: "geojson", data: { type: "FeatureCollection", features: [] } });

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

  // Vão de tração reduzida (E-05): tracejado ciano por cima, pra identificar o "frouxo".
  map.addLayer({
    id: LYR.linhaReduzida,
    type: "line",
    source: SRC.linhas,
    filter: ["==", ["get", "reduzida"], true],
    paint: { "line-color": "#0891b2", "line-width": 3, "line-dasharray": [2, 2] },
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

  // Anel de estai INSTALADO (verde) e PENDENTE (vermelho) (B4).
  map.addLayer({
    id: LYR.estaiOk,
    type: "circle",
    source: SRC.pontos,
    filter: ["==", ["get", "estaiOk"], true],
    layout: { visibility: modoRede ? "visible" : "none" },
    paint: {
      "circle-radius": 12,
      "circle-color": "rgba(0,0,0,0)",
      "circle-stroke-width": 3,
      "circle-stroke-color": "#16a34a",
    },
  });
  map.addLayer({
    id: LYR.estai,
    type: "circle",
    source: SRC.pontos,
    filter: ["==", ["get", "estai"], true],
    layout: { visibility: modoRede ? "visible" : "none" },
    paint: {
      "circle-radius": 12,
      "circle-color": "rgba(0,0,0,0)",
      "circle-stroke-width": 3,
      "circle-stroke-color": "#e11d48",
    },
  });
  // Anel de SUGESTÃO de CE4 (âmbar), maior, por fora dos anéis de estai (E-01/A).
  map.addLayer({
    id: LYR.sugCE4,
    type: "circle",
    source: SRC.pontos,
    filter: ["==", ["get", "sugCE4"], true],
    layout: { visibility: modoRede ? "visible" : "none" },
    paint: {
      "circle-radius": 16,
      "circle-color": "rgba(217,119,6,0.12)",
      "circle-stroke-width": 2.5,
      "circle-stroke-color": "#d97706",
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
      "circle-color": corPonto,
      "circle-stroke-width": 2,
      "circle-stroke-color": "#ffffff",
    },
  });

  // Estai (B4): linha do poste até a âncora, no sentido do esforço, + a âncora.
  map.addLayer({
    id: LYR.estaiLinha,
    type: "line",
    source: SRC.estaiSim,
    filter: ["==", ["geometry-type"], "LineString"],
    layout: { visibility: modoRede ? "visible" : "none", "line-cap": "round" },
    paint: { "line-color": "#16a34a", "line-width": 2.5 },
  });
  map.addLayer({
    id: LYR.estaiAncora,
    type: "circle",
    source: SRC.estaiSim,
    filter: ["==", ["geometry-type"], "Point"],
    layout: { visibility: modoRede ? "visible" : "none" },
    paint: {
      "circle-radius": 3.5,
      "circle-color": "#16a34a",
      "circle-stroke-width": 1.5,
      "circle-stroke-color": "#ffffff",
    },
  });

  // Régua de medição (por cima de tudo).
  map.addLayer({
    id: LYR.medicaoLinha,
    type: "line",
    source: SRC.medicao,
    filter: ["==", ["geometry-type"], "LineString"],
    paint: { "line-color": "#0ea5e9", "line-width": 2, "line-dasharray": [2, 1.5] },
  });
  map.addLayer({
    id: LYR.medicaoPts,
    type: "circle",
    source: SRC.medicao,
    filter: ["==", ["geometry-type"], "Point"],
    paint: {
      "circle-radius": 4,
      "circle-color": "#0ea5e9",
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
