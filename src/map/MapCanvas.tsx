import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Feature, FeatureCollection, Geometry, Point } from "geojson";
import type { AreaBdgd, LatLng, PosteBdgd, Projeto, SegmentoMT, TipoPonto, TrafoExistente } from "../domain/model";
import { fotosGeoJson, linhasGeoJson, pontosGeoJson } from "./geojson";
import { BASE_MAPA, ESRI_MAXZOOM, MAPTILER_KEY } from "../config";
import {
  inicializarCamadasBdgd,
  aplicarVisibilidadeBdgd,
  carregarDadosBdgd,
  BDGD_FONTES,
  BDGD_LYR,
  BDGD_SRC,
  type BdgdCarregamentoResultado,
} from "./bdgd";
import {
  inicializarCamadaKmlRede,
  carregarKmlRede,
  limparKmlRede,
  setVisibilidadeKmlRede,
} from "./kmlRedeLayer";
// ContextoBdgd removido — usar AreaBdgd (do model) para código novo.

/**
 * Mapa base + render + EDIÇÃO do projeto (Fase 2).
 *
 * Interações: selecionar ponto (clique), arrastar para mover, e adicionar ponto
 * (modo "adicionar" → clique no mapa). As mudanças sobem via callbacks; quem
 * altera o modelo é o motor de edição no App. Aqui só desenhamos e capturamos.
 */

/** Tipos de estilo de base exportados para o App. */
export type EstiloBase = "satellite" | "streets" | "hybrid";

/**
 * Alvo para voar no mapa — ponto (center + zoom) ou bbox.
 * Passado como prop `voarPara` no MapCanvas.
 */
export type MapAlvo =
  | { center: [number, number]; zoom?: number }
  | { bbox: [number, number, number, number] };

// ---------------------------------------------------------------------------
// Fontes de tiles
// ---------------------------------------------------------------------------

const FONTE_ESRI: maplibregl.RasterSourceSpecification = {
  type: "raster",
  tiles: [
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  ],
  tileSize: 256,
  maxzoom: ESRI_MAXZOOM,
  attribution: "Tiles © Esri — World Imagery",
};

const FONTE_MAPTILER: maplibregl.RasterSourceSpecification = {
  type: "raster",
  url: `https://api.maptiler.com/tiles/satellite-v2/tiles.json?key=${MAPTILER_KEY}`,
  tileSize: 512,
  attribution: "© MapTiler © Esri, Maxar, Earthstar Geographics",
};

const FONTE_OSM: maplibregl.RasterSourceSpecification = {
  type: "raster",
  tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
  tileSize: 256,
  attribution: "© OpenStreetMap contributors",
};

// Overlay Esri com labels/fronteiras — transparente, para modo híbrido
const FONTE_ESRI_LABELS: maplibregl.RasterSourceSpecification = {
  type: "raster",
  tiles: [
    "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
  ],
  tileSize: 256,
  attribution: "Labels © Esri",
};

// Tiles vetoriais OSM via MapTiler (esquema OpenMapTiles: landcover, building, transportation)
const FONTE_OSM_VEC: maplibregl.VectorSourceSpecification = {
  type: "vector",
  url: `https://api.maptiler.com/tiles/v3/tiles.json?key=${MAPTILER_KEY}`,
};

const OSM_VEC_LYRS = ["osm-landcover", "osm-buildings", "osm-roads", "osm-paths"] as const;

/**
 * Estilo base multi-camada: todas as 3 bases (satélite, ruas, híbrido)
 * são carregadas na inicialização. Alternar o estilo é apenas mudar
 * a visibilidade das camadas — sem recriar o mapa ou chamar setStyle().
 */
const ESTILO_BASE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    "base-sat-src": BASE_MAPA === "maptiler" ? FONTE_MAPTILER : FONTE_ESRI,
    "base-rua-src": FONTE_OSM,
    "base-lbl-src": FONTE_ESRI_LABELS,
  },
  layers: [
    { id: "base-sat", type: "raster", source: "base-sat-src", layout: { visibility: "visible" } },
    { id: "base-rua", type: "raster", source: "base-rua-src", layout: { visibility: "none" } },
    { id: "base-lbl", type: "raster", source: "base-lbl-src", layout: { visibility: "none" } },
  ],
};

function aplicarEstiloBase(map: maplibregl.Map, estilo: EstiloBase) {
  type Vis = "visible" | "none";
  const vis: Record<string, Vis> = {
    "base-sat": estilo !== "streets" ? "visible" : "none",
    "base-rua": estilo === "streets"   ? "visible" : "none",
    "base-lbl": estilo === "hybrid"    ? "visible" : "none",
  };
  for (const [id, v] of Object.entries(vis)) {
    if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", v);
  }
}

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
  estribo: "mkf-estribo",
  estriboConf: "mkf-estribo-conf",
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
  /** ids dos postes com estribo de espera sugerido (6.15.2). Anel ciano tracejado no modo Rede. */
  estribosIds?: Set<string>;
  /** ids dos postes com estribo de espera confirmado pelo projetista. Anel ciano sólido. */
  confirmadosIds?: Set<string>;
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
  /** Camadas BDGD que devem ficar visíveis. */
  camadasBdgdVisiveis?: Set<string>;
  /** Id da distribuidora BDGD selecionada. */
  bdgdFonteId?: string | null;
  /** Incrementar para disparar o carregamento dos dados BDGD. */
  bdgdCarregarTrigger?: number;
  /** Chamado quando o carregamento BDGD termina (sucesso ou erro). */
  onBdgdCarregado?: (resultado: BdgdCarregamentoResultado) => void;
  /** Estilo da base cartográfica ("satellite" | "streets" | "hybrid"). */
  estiloBase?: EstiloBase;
  /** Mostra a camada vetorial OSM (estradas, edificações, vegetação). */
  mostrarOsm?: boolean;
  /** Voa para um ponto/bbox no mapa. Trocar o objeto dispara o flyTo. */
  voarPara?: MapAlvo | null;
  /**
   * Incrementar para disparar a captura da AreaBdgd (rede existente dentro do viewport).
   * Resultado chega via onAreaBdgdCapturada.
   */
  capturarContextoBdgdTrigger?: number;
  /** Coordenada do ponto de derivação (ehFonte=true) para busca de vizinhos BDGD. */
  wgs84Derivacao?: LatLng | null;
  /** Chamado com a AreaBdgd capturada. */
  onAreaBdgdCapturada?: (area: AreaBdgd) => void;
  /** GeoJSON da rede KML importada pelo usuário (null = limpar). */
  kmlRedeGeojson?: GeoJSON.FeatureCollection | null;
  /** Se a camada de rede KML deve estar visível. */
  kmlRedeVisivel?: boolean;
  /** Ativa modo de seleção de área para captura BDGD da prancha. */
  modoSelecaoPrancha?: boolean;
  /** Bbox confirmado pelo usuário para filtrar a captura BDGD (minLng, minLat, maxLng, maxLat). */
  capturaBbox?: [number, number, number, number] | null;
  /** Chamado quando o usuário confirma o retângulo no modo seleção de área. */
  onBboxPranchaConfirmado?: (bbox: [number, number, number, number]) => void;
  /** Chamado quando o usuário clica em um poste ou trafo BDGD (inicia fluxo de correção). */
  onBdgdElementoClicado?: (tipo: "poste" | "trafo", wgs84: LatLng) => void;
  /**
   * Quando true, o próximo clique no mapa captura a nova posição desejada para o
   * elemento BDGD. O cursor muda para crosshair. Snap automático para pontos de projeto.
   */
  modoBdgdCorrigir?: boolean;
  /** Chamado com a posição escolhida pelo usuário no modo de correção BDGD. */
  onCorrigirPosicaoEscolhida?: (wgs84: LatLng) => void;
  /**
   * Delta a aplicar VISUALMENTE nas sources BDGD do mapa (correção sistemática).
   * Muda (seq incrementa) cada vez que uma correção é confirmada.
   * dLat/dLng: graus a somar em todas as features BDGD do viewport.
   */
  bdgdDeltaAplicado?: { dLat: number; dLng: number; seq: number } | null;
  /**
   * Lista acumulada de correções individuais de poste/trafo.
   * Cada item descreve qual elemento mover (tipo, posição original e nova).
   * Muda referência sempre que um novo elemento é corrigido.
   */
  bdgdCorrecoesPostes?: Array<{ tipo: "poste" | "trafo"; original: LatLng; novo: LatLng }> | null;
  /**
   * AreaBdgd completa do projeto (postes + segmentos + trafos).
   * Usada para construir o overlay visual com TODOS os postes (posições já corrigidas).
   */
  areaBdgd?: AreaBdgd | null;
  /** Ativa o modo de desenho de retângulo para definir o bbox da AreaBdgd. */
  modoDesenharAreaBdgd?: boolean;
  /** Chamado quando o usuário confirma o retângulo no modo desenharAreaBdgd. */
  onAreaBdgdBboxDefinido?: (bbox: NonNullable<AreaBdgd["bbox"]>) => void;
  /**
   * Modo de inserção manual de elemento existente: "poste" | "trafo" | "segmento".
   * No modo "segmento" o usuário clica dois pontos consecutivos.
   */
  modoInserirExistente?: "poste" | "trafo" | "segmento" | null;
  /** Chamado quando o usuário clica no mapa para inserir um poste existente. */
  onInserirPosteExistente?: (wgs84: LatLng) => void;
  /** Chamado quando o usuário clica no mapa para inserir um trafo existente. */
  onInserirTrafoExistente?: (wgs84: LatLng) => void;
  /** Chamado quando o usuário define os dois pontos de um segmento MT existente. */
  onInserirSegmentoExistente?: (de: LatLng, ate: LatLng) => void;
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
    estribosIds,
    confirmadosIds,
    estais,
    medicao,
    mostrarFotos,
    mostrarNumeros,
    camadasBdgdVisiveis,
    bdgdFonteId,
    bdgdCarregarTrigger,
    estiloBase,
    mostrarOsm,
    voarPara,
    capturarContextoBdgdTrigger,
    kmlRedeGeojson,
    kmlRedeVisivel,
    modoDesenharAreaBdgd,
  } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const fcRef = useRef<FeatureCollection<Point> | null>(null);
  const dragRef = useRef<string | null>(null);
  const marcadoresRef = useRef<maplibregl.Marker[]>([]);
  const numerosRef = useRef<maplibregl.Marker[]>([]);
  const prontoRef = useRef(false); // mapa carregado (monotônico; não confiar em isStyleLoaded, que oscila)
  const popupBdgdRef = useRef<maplibregl.Popup | null>(null);

  // Espelho sempre-atual das props para os handlers registrados uma vez só.
  const propsRef = useRef(props);
  propsRef.current = props;

  // Ref que guarda o bbox de captura atual — acessível dentro dos closures do useEffect.
  const capturaBboxRef = useRef<[number, number, number, number] | null>(null);
  capturaBboxRef.current = props.capturaBbox ?? null;

  // Ref para o primeiro ponto do segmento MT em modo de inserção manual.
  const segPrimeiroCliqueRef = useRef<LatLng | null>(null);

  // Cursor crosshair enquanto o modo de correção BDGD está ativo.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.getCanvas().style.cursor = props.modoBdgdCorrigir ? "crosshair" : "";
  }, [props.modoBdgdCorrigir]);

  // Cursor crosshair nos modos de inserção manual de elementos existentes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.getCanvas().style.cursor = props.modoInserirExistente ? "crosshair" : "";
    // Ao sair do modo, limpa o primeiro clique pendente do segmento.
    if (!props.modoInserirExistente) segPrimeiroCliqueRef.current = null;
  }, [props.modoInserirExistente]);

  // Cria o mapa e registra os handlers de interação uma única vez.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: ESTILO_BASE,
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
      inicializarCamadasOsmVec(map);
      inicializarCamadasBdgd(map);
      inicializarCamadaKmlRede(map);
      // Aplica estilo inicial (pode ter sido alterado antes do load)
      aplicarEstiloBase(map, propsRef.current.estiloBase ?? "satellite");
      // Aplica visibilidade OSM inicial
      aplicarVisibilidadeOsmVec(map, propsRef.current.mostrarOsm ?? false);
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
      if (propsRef.current.modoSelecaoPrancha || propsRef.current.modoDesenharAreaBdgd || propsRef.current.modoInserirExistente) return;
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

    // Preview elástico no modo ligar e no modo inserir segmento MT existente.
    map.on("mousemove", (e) => {
      const src = map.getSource(SRC.preview) as maplibregl.GeoJSONSource | undefined;
      if (!src) return;
      // Modo ligar: origem já escolhida → linha até o cursor.
      const de = emModoLigar() && propsRef.current.ligarDeId ? coordDoPonto(propsRef.current.ligarDeId) : null;
      // Modo segmento MT: primeiro clique registrado → rubber-band até o cursor.
      const deSeg =
        propsRef.current.modoInserirExistente === "segmento" ? segPrimeiroCliqueRef.current : null;
      if (de) {
        src.setData({
          type: "Feature",
          geometry: { type: "LineString", coordinates: [de, [e.lngLat.lng, e.lngLat.lat]] },
          properties: {},
        });
      } else if (deSeg) {
        src.setData({
          type: "Feature",
          geometry: {
            type: "LineString",
            coordinates: [[deSeg.lng, deSeg.lat], [e.lngLat.lng, e.lngLat.lat]],
          },
          properties: {},
        });
      } else {
        src.setData({ type: "FeatureCollection", features: [] });
      }
    });

    // Selecionar um trecho (só no modo selecionar).
    map.on("click", LYR.linhas, (e) => {
      if (propsRef.current.modoSelecaoPrancha || propsRef.current.modoDesenharAreaBdgd || propsRef.current.modoInserirExistente) return;
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

    // ── BDGD: popup de atributos ao passar sobre um transformador ──────────
    map.on("mouseenter", BDGD_LYR.transformadores, (e) => {
      map.getCanvas().style.cursor = "crosshair";
      const f = e.features?.[0];
      if (!f || f.geometry.type !== "Point") return;
      const [lng, lat] = f.geometry.coordinates as [number, number];
      const p = f.properties ?? {};

      const fmt = (v: unknown) => (v != null && v !== "" ? String(v) : "—");
      const pot  = fmt(p["POT_NOM"] ?? p["POT_NOM_KVA"]);
      const ctmt = fmt(p["CTMT"] ?? p["COD_CTMT"]);
      const tid  = fmt(p["COD_ID"]);
      const pri  = fmt(p["TEN_PRI"]);
      const sec  = fmt(p["TEN_SEC"]);
      const tip  = fmt(p["TIP_TRAFO"] ?? p["TIP_TR_D"]);

      const html = `
        <div class="pop pop-bdgd">
          <div class="pop-h">🔴 Transformador</div>
          <table class="pop-t">
            ${tid  !== "—" ? `<tr><td>COD_ID</td><td>${esc(tid)}</td></tr>` : ""}
            ${ctmt !== "—" ? `<tr><td>Circuito</td><td>${esc(ctmt)}</td></tr>` : ""}
            ${pot  !== "—" ? `<tr><td>Potência</td><td>${esc(pot)} kVA</td></tr>` : ""}
            ${pri  !== "—" ? `<tr><td>Ten. primária</td><td>${esc(pri)} kV</td></tr>` : ""}
            ${sec  !== "—" ? `<tr><td>Ten. secundária</td><td>${esc(sec)} V</td></tr>` : ""}
            ${tip  !== "—" ? `<tr><td>Tipo</td><td>${esc(tip)}</td></tr>` : ""}
          </table>
        </div>`;

      if (popupBdgdRef.current) popupBdgdRef.current.remove();
      popupBdgdRef.current = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false,
        maxWidth: "260px",
        offset: 10,
        className: "bdgd-popup",
      })
        .setLngLat([lng, lat])
        .setHTML(html)
        .addTo(map);
    });

    map.on("mouseleave", BDGD_LYR.transformadores, () => {
      map.getCanvas().style.cursor = "";
      popupBdgdRef.current?.remove();
      popupBdgdRef.current = null;
    });

    // Flag para impedir que o handler geral de clique processe após click em camada BDGD.
    // MapLibre não tem stopPropagation entre layer-click e map-click genérico.
    let bdgdClickHandled = false;

    // ── BDGD postes: clique → iniciar fluxo de correção de coordenada ────
    map.on("click", BDGD_LYR.postes, (e) => {
      if (propsRef.current.modoSelecaoPrancha || propsRef.current.modoDesenharAreaBdgd || propsRef.current.modoInserirExistente) return;
      if (propsRef.current.modoBdgdCorrigir) return; // em modo correção não re-seleciona
      const f = e.features?.[0];
      if (!f || f.geometry.type !== "Point") return;
      const [lng, lat] = f.geometry.coordinates as [number, number];
      propsRef.current.onBdgdElementoClicado?.("poste", { lat, lng });
      bdgdClickHandled = true;
    });

    // ── BDGD transformadores: clique → iniciar fluxo de correção ─────────
    map.on("click", BDGD_LYR.transformadores, (e) => {
      if (propsRef.current.modoSelecaoPrancha || propsRef.current.modoDesenharAreaBdgd || propsRef.current.modoInserirExistente) return;
      if (propsRef.current.modoBdgdCorrigir) return;
      const f = e.features?.[0];
      if (!f || f.geometry.type !== "Point") return;
      const [lng, lat] = f.geometry.coordinates as [number, number];
      propsRef.current.onBdgdElementoClicado?.("trafo", { lat, lng });
      bdgdClickHandled = true;
    });
    // ──────────────────────────────────────────────────────────────────────

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
      // Se um layer BDGD já tratou este clique, ignora aqui para não criar ponto inadvertidamente.
      if (bdgdClickHandled) { bdgdClickHandled = false; return; }
      if (propsRef.current.modoSelecaoPrancha || propsRef.current.modoDesenharAreaBdgd) return;

      // ── Inserção manual de elementos existentes ──────────────────────────
      const modoIns = propsRef.current.modoInserirExistente;
      if (modoIns) {
        const wgs84: LatLng = { lat: e.lngLat.lat, lng: e.lngLat.lng };
        if (modoIns === "poste") {
          propsRef.current.onInserirPosteExistente?.(wgs84);
        } else if (modoIns === "trafo") {
          propsRef.current.onInserirTrafoExistente?.(wgs84);
        } else if (modoIns === "segmento") {
          const primeiro = segPrimeiroCliqueRef.current;
          if (!primeiro) {
            // Primeiro clique — guarda e aguarda o segundo (rubber-band fica ativo no mousemove).
            segPrimeiroCliqueRef.current = wgs84;
          } else {
            // Segundo clique — salva o segmento e continua desenhando a partir deste ponto
            // (modo contínuo: o usuário pode continuar clicando para estender a linha).
            // Para encerrar: Escape ou clicar no botão "Seg.MT" novamente.
            segPrimeiroCliqueRef.current = wgs84;
            propsRef.current.onInserirSegmentoExistente?.(primeiro, wgs84);
          }
        }
        return;
      }

      // Modo correção BDGD: captura nova posição (snap para ponto de projeto, ou livre)
      if (propsRef.current.modoBdgdCorrigir) {
        const pontosNaArea = map.queryRenderedFeatures(e.point, { layers: [LYR.pontos] });
        if (pontosNaArea.length > 0) {
          const pf = pontosNaArea[0];
          if (pf.geometry.type === "Point") {
            const [lng, lat] = pf.geometry.coordinates as [number, number];
            propsRef.current.onCorrigirPosicaoEscolhida?.({ lat, lng });
            return;
          }
        }
        propsRef.current.onCorrigirPosicaoEscolhida?.({
          lat: e.lngLat.lat,
          lng: e.lngLat.lng,
        });
        return;
      }
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

  // Desenha o projeto quando muda; limpa o mapa quando projeto é fechado.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!projeto) {
      // Projeto fechado — remove todas as camadas mkf do mapa.
      if (prontoRef.current) limpar(map);
      return;
    }
    const desenhar = () => {
      const fc = pontosGeoJson(
        projeto,
        propsRef.current.papeis,
        propsRef.current.estaiIds,
        propsRef.current.estaiInstaladoIds,
        propsRef.current.sugCE4Ids,
        propsRef.current.estribosIds,
        propsRef.current.confirmadosIds,
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
    const fc = pontosGeoJson(projeto, papeis, estaiIds, estaiInstaladoIds, sugCE4Ids, estribosIds, confirmadosIds);
    fcRef.current = fc;
    (map.getSource(SRC.pontos) as maplibregl.GeoJSONSource).setData(fc);
  }, [papeis, estaiIds, estaiInstaladoIds, sugCE4Ids, estribosIds, confirmadosIds, projeto]);

  // Alterna a cor dos postes (papel x tipo) e o anel de estai só no modo Rede.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getLayer(LYR.pontos)) return;
    map.setPaintProperty(LYR.pontos, "circle-color", modoRede ? COR_PAPEL : COR_TIPO);
    for (const l of [LYR.estai, LYR.estaiOk, LYR.sugCE4, LYR.estribo, LYR.estriboConf, LYR.estaiLinha, LYR.estaiAncora]) {
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

  // BDGD — visibilidade das camadas.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !prontoRef.current || !camadasBdgdVisiveis) return;
    aplicarVisibilidadeBdgd(map, camadasBdgdVisiveis);
  }, [camadasBdgdVisiveis]);

  // KML Rede — atualiza dados quando o GeoJSON muda.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const run = () => {
      if (kmlRedeGeojson) carregarKmlRede(map, kmlRedeGeojson);
      else limparKmlRede(map);
    };
    if (prontoRef.current) run(); else map.once("load", run);
  }, [kmlRedeGeojson]);

  // KML Rede — visibilidade.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !prontoRef.current) return;
    setVisibilidadeKmlRede(map, kmlRedeVisivel ?? true);
  }, [kmlRedeVisivel]);

  // Estilo de mapa base
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !prontoRef.current) return;
    aplicarEstiloBase(map, estiloBase ?? "satellite");
  }, [estiloBase]);

  // Camada vetorial OSM (estradas, edificações, vegetação)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !prontoRef.current) return;
    aplicarVisibilidadeOsmVec(map, mostrarOsm ?? false);
  }, [mostrarOsm]);

  // Voar para ponto/bbox (cada novo objeto de referência dispara um flyTo)
  useEffect(() => {
    if (!voarPara) return;
    const map = mapRef.current;
    if (!map) return;
    if ("center" in voarPara) {
      map.flyTo({ center: voarPara.center, zoom: voarPara.zoom ?? 14, duration: 1200 });
    } else {
      map.fitBounds(
        [[voarPara.bbox[0], voarPara.bbox[1]], [voarPara.bbox[2], voarPara.bbox[3]]],
        { padding: 60, maxZoom: 16, duration: 1200 }
      );
    }
  }, [voarPara]);

  // BDGD — carregamento dos dados (dispara quando bdgdCarregarTrigger incrementa).
  useEffect(() => {
    if (!bdgdCarregarTrigger) return;
    const map = mapRef.current;
    if (!map) return;
    const fonte = BDGD_FONTES.find((f) => f.id === bdgdFonteId) ?? null;
    if (!fonte?.urls) return;
    const run = () => {
      carregarDadosBdgd(map, fonte).then((resultado) => {
        propsRef.current.onBdgdCarregado?.(resultado);
      });
    };
    if (!prontoRef.current) {
      map.once("load", run);
    } else {
      run();
    }
  }, [bdgdCarregarTrigger, bdgdFonteId]);

  // Modo seleção de área para prancha: desenha retângulo de captura BDGD.
  const { modoSelecaoPrancha } = props;
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !prontoRef.current) return;
    if (!modoSelecaoPrancha) return;

    const BBOX_SRC = "mkf-bbox-sel-src";
    const BBOX_FILL = "mkf-bbox-sel-fill";
    const BBOX_LINE = "mkf-bbox-sel-line";

    if (!map.getSource(BBOX_SRC)) {
      map.addSource(BBOX_SRC, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({ id: BBOX_FILL, type: "fill", source: BBOX_SRC,
        paint: { "fill-color": "#3b82f6", "fill-opacity": 0.18 } });
      map.addLayer({ id: BBOX_LINE, type: "line", source: BBOX_SRC,
        paint: { "line-color": "#3b82f6", "line-width": 2, "line-dasharray": [5, 3] } });
    }

    const canvas = map.getCanvas();
    canvas.style.cursor = "crosshair";
    map.dragPan.disable();

    let startLng: number | null = null;
    let startLat: number | null = null;
    let arrastando = false;

    const onDown = (e: maplibregl.MapMouseEvent) => {
      startLng = e.lngLat.lng;
      startLat = e.lngLat.lat;
      arrastando = true;
    };
    const onMove = (e: maplibregl.MapMouseEvent) => {
      if (!arrastando || startLng === null || startLat === null) return;
      const minLng = Math.min(startLng, e.lngLat.lng);
      const maxLng = Math.max(startLng, e.lngLat.lng);
      const minLat = Math.min(startLat, e.lngLat.lat);
      const maxLat = Math.max(startLat, e.lngLat.lat);
      (map.getSource(BBOX_SRC) as maplibregl.GeoJSONSource).setData({
        type: "FeatureCollection",
        features: [{ type: "Feature", geometry: { type: "Polygon",
          coordinates: [[[minLng, minLat], [maxLng, minLat], [maxLng, maxLat], [minLng, maxLat], [minLng, minLat]]] },
          properties: {} }],
      });
    };
    const onUp = (e: maplibregl.MapMouseEvent) => {
      if (!arrastando || startLng === null || startLat === null) return;
      arrastando = false;
      const minLng = Math.min(startLng, e.lngLat.lng);
      const maxLng = Math.max(startLng, e.lngLat.lng);
      const minLat = Math.min(startLat, e.lngLat.lat);
      const maxLat = Math.max(startLat, e.lngLat.lat);
      // Exige área mínima (~10 m) para evitar clique acidental
      if (maxLng - minLng > 0.0001 && maxLat - minLat > 0.0001) {
        propsRef.current.onBboxPranchaConfirmado?.([minLng, minLat, maxLng, maxLat]);
      }
    };

    map.on("mousedown", onDown);
    map.on("mousemove", onMove);
    map.on("mouseup", onUp);

    return () => {
      map.off("mousedown", onDown);
      map.off("mousemove", onMove);
      map.off("mouseup", onUp);
      canvas.style.cursor = "";
      map.dragPan.enable();
      if (map.getLayer(BBOX_FILL)) map.removeLayer(BBOX_FILL);
      if (map.getLayer(BBOX_LINE)) map.removeLayer(BBOX_LINE);
      if (map.getSource(BBOX_SRC)) map.removeSource(BBOX_SRC);
    };
  }, [modoSelecaoPrancha]);

  // Modo desenhar área do projeto (AreaBdgd.bbox): click+drag → retângulo tracejado laranja.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !prontoRef.current) return;
    if (!modoDesenharAreaBdgd) return;

    const AREA_SRC = "mkf-area-draw-src";
    const AREA_FILL = "mkf-area-draw-fill";
    const AREA_LINE = "mkf-area-draw-line";

    if (!map.getSource(AREA_SRC)) {
      map.addSource(AREA_SRC, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({ id: AREA_FILL, type: "fill", source: AREA_SRC,
        paint: { "fill-color": "#f97316", "fill-opacity": 0.12 } });
      map.addLayer({ id: AREA_LINE, type: "line", source: AREA_SRC,
        paint: { "line-color": "#f97316", "line-width": 2, "line-dasharray": [6, 3] } });
    }

    const canvas = map.getCanvas();
    canvas.style.cursor = "crosshair";
    map.dragPan.disable();

    let startLng: number | null = null;
    let startLat: number | null = null;
    let arrastando = false;

    const onDown = (e: maplibregl.MapMouseEvent) => {
      startLng = e.lngLat.lng;
      startLat = e.lngLat.lat;
      arrastando = true;
    };
    const onMove = (e: maplibregl.MapMouseEvent) => {
      if (!arrastando || startLng === null || startLat === null) return;
      const minLng = Math.min(startLng, e.lngLat.lng);
      const maxLng = Math.max(startLng, e.lngLat.lng);
      const minLat = Math.min(startLat, e.lngLat.lat);
      const maxLat = Math.max(startLat, e.lngLat.lat);
      (map.getSource(AREA_SRC) as maplibregl.GeoJSONSource).setData({
        type: "FeatureCollection",
        features: [{ type: "Feature", geometry: { type: "Polygon",
          coordinates: [[[minLng, minLat], [maxLng, minLat], [maxLng, maxLat], [minLng, maxLat], [minLng, minLat]]] },
          properties: {} }],
      });
    };
    const onUp = (e: maplibregl.MapMouseEvent) => {
      if (!arrastando || startLng === null || startLat === null) return;
      arrastando = false;
      const minLng = Math.min(startLng, e.lngLat.lng);
      const maxLng = Math.max(startLng, e.lngLat.lng);
      const minLat = Math.min(startLat, e.lngLat.lat);
      const maxLat = Math.max(startLat, e.lngLat.lat);
      if (maxLng - minLng > 0.0001 && maxLat - minLat > 0.0001) {
        propsRef.current.onAreaBdgdBboxDefinido?.({
          norte: maxLat,
          sul: minLat,
          leste: maxLng,
          oeste: minLng,
        });
      }
    };

    map.on("mousedown", onDown);
    map.on("mousemove", onMove);
    map.on("mouseup", onUp);

    return () => {
      map.off("mousedown", onDown);
      map.off("mousemove", onMove);
      map.off("mouseup", onUp);
      canvas.style.cursor = "";
      map.dragPan.enable();
      if (map.getLayer(AREA_FILL)) map.removeLayer(AREA_FILL);
      if (map.getLayer(AREA_LINE)) map.removeLayer(AREA_LINE);
      if (map.getSource(AREA_SRC)) map.removeSource(AREA_SRC);
    };
  }, [modoDesenharAreaBdgd]);

  // Overlay persistente: exibe o bbox da AreaBdgd do projeto como retângulo tracejado.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !prontoRef.current) return;

    const BBOX_SRC = "mkf-area-proj-src";
    const BBOX_LINE = "mkf-area-proj-line";

    const bbox = props.areaBdgd?.bbox;

    if (!bbox) {
      // Remove overlay se bbox foi apagado
      if (map.getLayer(BBOX_LINE)) map.removeLayer(BBOX_LINE);
      if (map.getSource(BBOX_SRC)) map.removeSource(BBOX_SRC);
      return;
    }

    const { norte, sul, leste, oeste } = bbox;
    const fc: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: [{
        type: "Feature",
        geometry: {
          type: "Polygon",
          coordinates: [[[oeste, sul], [leste, sul], [leste, norte], [oeste, norte], [oeste, sul]]],
        },
        properties: {},
      }],
    };

    if (map.getSource(BBOX_SRC)) {
      (map.getSource(BBOX_SRC) as maplibregl.GeoJSONSource).setData(fc);
    } else {
      map.addSource(BBOX_SRC, { type: "geojson", data: fc });
      map.addLayer({
        id: BBOX_LINE,
        type: "line",
        source: BBOX_SRC,
        paint: { "line-color": "#f97316", "line-width": 1.5, "line-dasharray": [5, 4], "line-opacity": 0.7 },
      });
    }
  }, [props.areaBdgd?.bbox]);

  // Overlay de elementos manuais (manual=true em areaBdgd).
  // Renderiza postes, trafos e segmentos inseridos manualmente na cor ciano,
  // para diferenciar dos dados capturados automaticamente da BDGD.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !prontoRef.current) return;

    const SRC_M = "mkf-manual-src";
    const LYR_POST = "mkf-manual-postes";
    const LYR_TRAF = "mkf-manual-trafos";
    const LYR_SEG  = "mkf-manual-segs";

    const area = props.areaBdgd;
    const features: GeoJSON.Feature[] = [];

    if (area) {
      for (const p of area.postesBdgd) {
        if (!p.manual) continue;
        features.push({ type: "Feature", geometry: { type: "Point", coordinates: [p.wgs84.lng, p.wgs84.lat] }, properties: { kind: "poste" } });
      }
      for (const t of area.trafos) {
        if (!t.manual) continue;
        features.push({ type: "Feature", geometry: { type: "Point", coordinates: [t.wgs84.lng, t.wgs84.lat] }, properties: { kind: "trafo" } });
      }
      for (const s of area.segmentosMT) {
        if (!s.manual) continue;
        features.push({ type: "Feature", geometry: { type: "LineString", coordinates: [[s.de.lng, s.de.lat], [s.ate.lng, s.ate.lat]] }, properties: { kind: "seg" } });
      }
    }

    const fc: GeoJSON.FeatureCollection = { type: "FeatureCollection", features };

    if (map.getSource(SRC_M)) {
      (map.getSource(SRC_M) as maplibregl.GeoJSONSource).setData(fc);
    } else {
      map.addSource(SRC_M, { type: "geojson", data: fc });
      // Segmentos
      map.addLayer({
        id: LYR_SEG, type: "line", source: SRC_M,
        filter: ["==", ["get", "kind"], "seg"],
        paint: { "line-color": "#22d3ee", "line-width": 2, "line-dasharray": [4, 3], "line-opacity": 0.9 },
      });
      // Postes manuais
      map.addLayer({
        id: LYR_POST, type: "circle", source: SRC_M,
        filter: ["==", ["get", "kind"], "poste"],
        paint: { "circle-radius": 6, "circle-color": "#22d3ee", "circle-stroke-color": "#0e7490", "circle-stroke-width": 1.5, "circle-opacity": 0.9 },
      });
      // Trafos manuais (ícone quadrado via circle-pitch-alignment + stroke alto)
      map.addLayer({
        id: LYR_TRAF, type: "circle", source: SRC_M,
        filter: ["==", ["get", "kind"], "trafo"],
        paint: { "circle-radius": 7, "circle-color": "#f472b6", "circle-stroke-color": "#be185d", "circle-stroke-width": 1.5, "circle-opacity": 0.9 },
      });
    }
  }, [props.areaBdgd]);

  // BDGD — captura contexto (rede existente) para a prancha.
  useEffect(() => {
    if (!capturarContextoBdgdTrigger) return;
    const map = mapRef.current;
    if (!map || !prontoRef.current) return;

    let cancelado = false;

    /** Executa a captura imediatamente (tiles devem estar no cache). */
    const fazerCaptura = () => {
      if (cancelado) return;

      const derivacao = propsRef.current.wgs84Derivacao;
      const callback = propsRef.current.onAreaBdgdCapturada;
      if (!callback) return;

      // Bbox efetivo: prancha-flow (capturaBboxRef) tem prioridade; senão usa areaBdgd.bbox
      const _rawBbox = capturaBboxRef.current;
      const _areaBboxSrc = propsRef.current.areaBdgd?.bbox;
      const efetivoBbox: [number, number, number, number] | null = _rawBbox
        ? _rawBbox
        : _areaBboxSrc
        ? [_areaBboxSrc.oeste, _areaBboxSrc.sul, _areaBboxSrc.leste, _areaBboxSrc.norte]
        : null;

      // IMPORTANTE: usa querySourceFeatures (não queryRenderedFeatures).
      // queryRenderedFeatures só retorna features VISÍVEIS no viewport renderizado —
      // quando a prancha abre por cima do mapa, o MapLibre pode pausar o render e
      // retornar vazio. querySourceFeatures consulta as tiles já cacheadas
      // independentemente do estado de visibilidade do canvas.
      const featuresRedeMT = (() => {
        try {
          if (!map.getSource(BDGD_SRC.redeMT)) return [];
          return map.querySourceFeatures(BDGD_SRC.redeMT, { sourceLayer: "rede_mt" });
        } catch {
          return [];
        }
      })();

      // Converte features de linha para segmentos de 2 vértices (apenas vizinhos ao ponto de derivação)
      const segmentosMT: SegmentoMT[] = [];
      const bboxMT = efetivoBbox;
      if (featuresRedeMT.length > 0 && (derivacao || bboxMT)) {
        // Calcula distância quadrada entre dois pontos WGS84 (aproximação plana suficiente p/ ~100m)
        const distSq = (a: LatLng, b: LatLng) => {
          const dlat = a.lat - b.lat;
          const dlng = a.lng - b.lng;
          return dlat * dlat + dlng * dlng;
        };

        // Para cada feature de linha, pega pares de vértices e calcula dist ao ponto de derivação
        type Segmento = {
          de: LatLng; ate: LatLng; distSq: number;
          // Atributos SSDMT — presentes quando o PMTiles foi gerado com esses campos
          props: Record<string, unknown>;
        };
        const candidatos: Segmento[] = [];

        for (const f of featuresRedeMT) {
          if (f.geometry.type === "LineString") {
            const coords = f.geometry.coordinates;
            const props = (f.properties ?? {}) as Record<string, unknown>;
            for (let i = 0; i < coords.length - 1; i++) {
              const de: LatLng = { lat: coords[i][1], lng: coords[i][0] };
              const ate: LatLng = { lat: coords[i + 1][1], lng: coords[i + 1][0] };
              const midLat = (de.lat + ate.lat) / 2;
              const midLng = (de.lng + ate.lng) / 2;
              // Filtro por bbox quando disponível; senão filtra por distância no sort abaixo
              if (bboxMT) {
                const dentroDeAlg = (
                  (de.lng >= bboxMT[0] && de.lng <= bboxMT[2] && de.lat >= bboxMT[1] && de.lat <= bboxMT[3]) ||
                  (ate.lng >= bboxMT[0] && ate.lng <= bboxMT[2] && ate.lat >= bboxMT[1] && ate.lat <= bboxMT[3]) ||
                  (midLng >= bboxMT[0] && midLng <= bboxMT[2] && midLat >= bboxMT[1] && midLat <= bboxMT[3])
                );
                if (!dentroDeAlg) continue;
              }
              const d = derivacao ? distSq({ lat: midLat, lng: midLng }, derivacao) : 0;
              candidatos.push({ de, ate, distSq: d, props });
            }
          }
        }

        // Com bbox: inclui até 20 segmentos mais próximos do derivacao (ou todos se não há derivacao).
        // Sem bbox: pega os 5 mais próximos do ponto de derivação.
        const limite = bboxMT ? 20 : 5;
        candidatos.sort((a, b) => a.distSq - b.distSq);
        for (const c of candidatos.slice(0, limite)) {
          // Extrai atributos do cabo do SSDMT (gracioso se ausentes no PMTiles)
          const p = c.props;
          const toStr = (v: unknown) =>
            typeof v === "string" ? v.trim() || undefined : undefined;
          const toNum = (v: unknown) =>
            typeof v === "number" ? v :
            typeof v === "string" ? (parseFloat(v) || undefined) : undefined;
          const tipo = toStr(p["TIP_CND"]);
          const secaoMm2 = toNum(p["CRS_CND"]);
          const tensaoKv = toNum(p["TEN_OPE"]);
          const cabo = (tipo != null || secaoMm2 != null || tensaoKv != null)
            ? { tipo, secaoMm2, tensaoKv }
            : undefined;
          segmentosMT.push({ de: c.de, ate: c.ate, ...(cabo ? { cabo } : {}) });
        }
      }

      // Busca transformador(es) via querySourceFeatures no source GeoJSON
      let trafoProximo: TrafoExistente | undefined;
      const bboxTraf = capturaBboxRef.current;
      if (derivacao || bboxTraf) {
        try {
          const trafFeatures = map.getSource(BDGD_SRC.transformadores)
            ? map.querySourceFeatures(BDGD_SRC.transformadores)
            : [];
          let minD = Infinity;
          for (const f of trafFeatures) {
            if (f.geometry.type !== "Point") continue;
            const [lng, lat] = f.geometry.coordinates;
            // Com bbox: só considera trafos dentro da área selecionada
            if (bboxTraf) {
              if (lng < bboxTraf[0] || lng > bboxTraf[2] || lat < bboxTraf[1] || lat > bboxTraf[3]) continue;
            }
            const dlat = lat - (derivacao?.lat ?? lat);
            const dlng = lng - (derivacao?.lng ?? lng);
            const d = dlat * dlat + dlng * dlng;
            if (d < minD) {
              minD = d;
              const props = f.properties ?? {};
              const label =
                (props["COD_ID"] as string | undefined) ??
                (props["CTMT"] as string | undefined) ??
                (props["PRI_SUB"] as string | undefined);
              trafoProximo = { wgs84: { lat, lng }, label };
            }
          }
        } catch {
          // Silencioso — source pode não existir
        }
      }

      // Log de diagnóstico — SSDMT (primeiros 2 segmentos)
      if (segmentosMT.length > 0) {
        const rawMT = (() => {
          try { return map.querySourceFeatures(BDGD_SRC.redeMT, { sourceLayer: "rede_mt" }); } catch { return []; }
        })();
        if (rawMT.length > 0) {
          console.log("[BDGD] SSDMT props[0]:", JSON.stringify(rawMT[0].properties));
          if (rawMT.length > 1) console.log("[BDGD] SSDMT props[1]:", JSON.stringify(rawMT[1].properties));
        }
      }

      // Captura postes BDGD (PONNOT) próximos — via querySourceFeatures na source PMTiles.
      // Filtra num raio de ~300 m em torno do ponto de derivação para não sobrecarregar a prancha.
      const postesBdgd: PosteBdgd[] = [];
      try {
        if (map.getSource(BDGD_SRC.postes)) {
          const postesFeatures = map.querySourceFeatures(BDGD_SRC.postes, { sourceLayer: "postes" });
          // Log de diagnóstico — primeiros 2 postes
          if (postesFeatures.length > 0) {
            console.log("[BDGD] PONNOT props[0]:", JSON.stringify(postesFeatures[0].properties));
            if (postesFeatures.length > 1) console.log("[BDGD] PONNOT props[1]:", JSON.stringify(postesFeatures[1].properties));
          } else {
            console.log("[BDGD] PONNOT: querySourceFeatures retornou 0 features");
          }
          const RAIO_GD = 0.003; // ~300 m em graus (aprox.)
          const bbox = efetivoBbox;
          for (const f of postesFeatures) {
            if (f.geometry.type !== "Point") continue;
            const [lng, lat] = f.geometry.coordinates;
            if (bbox) {
              // Bbox definido pelo usuário — filtra dentro da área selecionada
              if (lng < bbox[0] || lng > bbox[2] || lat < bbox[1] || lat > bbox[3]) continue;
            } else if (derivacao) {
              const dlat = Math.abs(lat - derivacao.lat);
              const dlng = Math.abs(lng - derivacao.lng);
              if (dlat > RAIO_GD || dlng > RAIO_GD) continue;
            }
            const p = (f.properties ?? {}) as Record<string, unknown>;
            const toStr = (v: unknown) =>
              typeof v === "string" ? v.trim() || undefined :
              typeof v === "number" ? String(v) : undefined;
            const toNum = (v: unknown) =>
              typeof v === "number" ? v :
              typeof v === "string" ? (parseFloat(v) || undefined) : undefined;
            postesBdgd.push({
              wgs84: { lat, lng },
              tipEst: toStr(p["TIP_EST"]) ?? (p["TIP_EST"] != null ? p["TIP_EST"] as string | number : undefined),
              altEst: toNum(p["ALT_EST"]),
              tipOpe: toStr(p["TIP_OPE"]) ?? (p["TIP_OPE"] != null ? p["TIP_OPE"] as string | number : undefined),
              codId: toStr(p["COD_ID"]),
            });
          }
        }
      } catch {
        // Silencioso — source pode não ter sido carregada ainda
      }

      // Preserva o bbox definido pelo usuário (areaBdgd.bbox) quando disponível.
      // Só usa getBounds() como fallback para o fluxo da prancha (sem área definida).
      const existingBbox = propsRef.current.areaBdgd?.bbox;
      const bounds = map.getBounds();
      const area: AreaBdgd = {
        bbox: existingBbox ?? {
          norte: bounds.getNorth(),
          sul: bounds.getSouth(),
          leste: bounds.getEast(),
          oeste: bounds.getWest(),
        },
        postesBdgd,
        segmentosMT,
        trafos: trafoProximo ? [trafoProximo] : [],
      };
      callback(area);
    };

    // Fase 3 — quando há um bbox de área definido, voa até ele antes de capturar.
    // Os tiles da região podem não estar carregados se o usuário estava em outro local.
    // fitBounds dispara uma animação de fly; o idle subsequente garante que os tiles
    // terminaram de carregar antes de fazerCaptura() ser chamado.
    const areaBboxParaFly = propsRef.current.areaBdgd?.bbox;
    if (areaBboxParaFly) {
      const { oeste, sul, leste, norte } = areaBboxParaFly;
      map.fitBounds([oeste, sul, leste, norte] as [number, number, number, number], { padding: 60 });
      // Não faz captura imediata — aguarda idle após o fly (tiles da área carregam durante a animação)
    } else {
      // Sem área definida: captura imediata (tiles do viewport atual já estão no cache)
      fazerCaptura();
    }

    // Captura no próximo idle — cobre ambos os casos:
    // - com areaBbox: idle dispara após o fly+load dos tiles da nova área
    // - sem areaBbox: idle dispara após possível race condition de PMTiles (ver comentário original)
    // Fallback de 15 s caso idle não dispare (ex: área sem tiles ou animação muito longa).
    const temFonteMT = !!map.getSource(BDGD_SRC.redeMT);
    if (temFonteMT || areaBboxParaFly) {
      const onIdle = () => { clearTimeout(fallbackTimer); fazerCaptura(); };
      // Timeout de segurança: após 15 s encerra a espera
      const fallbackTimer = setTimeout(() => { map.off("idle", onIdle); }, 15000);
      map.once("idle", onIdle);
      return () => { cancelado = true; clearTimeout(fallbackTimer); map.off("idle", onIdle); };
    }

    return () => { cancelado = true; };
  }, [capturarContextoBdgdTrigger]);

  // BDGD — aplica visualmente o delta de correção nas sources do mapa.
  // GeoJSON (redeMT, trafos): querySourceFeatures devolve TODOS os features → setData corrigido.
  // PMTiles/vetor (postes Elektro): cria source GeoJSON de sobreposição com postes visíveis corrigidos
  // e oculta o layer original, evitando duplicação.
  useEffect(() => {
    const map = mapRef.current;
    const delta = props.bdgdDeltaAplicado;
    if (!map || !delta) return;
    const { dLat, dLng } = delta;

    const shiftGeom = (geom: Geometry): Geometry => {
      if (geom.type === "Point") {
        const [lng, lat] = geom.coordinates as [number, number];
        return { type: "Point", coordinates: [lng + dLng, lat + dLat] };
      }
      if (geom.type === "LineString") {
        return {
          type: "LineString",
          coordinates: (geom.coordinates as [number, number][]).map(
            ([lng, lat]) => [lng + dLng, lat + dLat],
          ),
        };
      }
      return geom;
    };

    const deslocarSourceGeoJson = (srcId: string): void => {
      const src = map.getSource(srcId);
      if (!src || src.type !== "geojson") return;
      const feats = map.querySourceFeatures(srcId);
      (src as maplibregl.GeoJSONSource).setData({
        type: "FeatureCollection",
        features: feats.map((f) => ({ ...f, geometry: shiftGeom(f.geometry) })) as Feature[],
      });
    };

    deslocarSourceGeoJson(BDGD_SRC.redeMT);
    deslocarSourceGeoJson(BDGD_SRC.redeBT);
    deslocarSourceGeoJson(BDGD_SRC.transformadores);

    // Postes: GeoJSON ou PMTiles (vector)
    const postesSrc = map.getSource(BDGD_SRC.postes);
    if (!postesSrc) return;

    if (postesSrc.type === "geojson") {
      deslocarSourceGeoJson(BDGD_SRC.postes);
    } else {
      // PMTiles: cria/atualiza uma source GeoJSON de sobreposição com as features visíveis corrigidas.
      const OVR_SRC = BDGD_SRC.postes + "-corr";
      const OVR_LYR = BDGD_LYR.postes + "-corr";
      const feats = map.querySourceFeatures(BDGD_SRC.postes, { sourceLayer: "postes" });
      const correctedFC: FeatureCollection = {
        type: "FeatureCollection",
        features: feats.map((f) => ({ ...f, geometry: shiftGeom(f.geometry) })) as Feature[],
      };
      if (!map.getSource(OVR_SRC)) {
        map.addSource(OVR_SRC, { type: "geojson", data: correctedFC });
        map.addLayer({
          id: OVR_LYR,
          type: "circle",
          source: OVR_SRC,
          minzoom: 14,
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 14, 2, 17, 5] as maplibregl.ExpressionSpecification,
            "circle-color": "#334155",
            "circle-stroke-width": 1,
            "circle-stroke-color": "#94a3b8",
          },
        });
      } else {
        (map.getSource(OVR_SRC) as maplibregl.GeoJSONSource).setData(correctedFC);
      }
      // Ocultar layer PMTiles original para evitar duplicação visual
      if (map.getLayer(BDGD_LYR.postes)) {
        map.setLayoutProperty(BDGD_LYR.postes, "visibility", "none");
      }
    }
  }, [props.bdgdDeltaAplicado]);

  // BDGD — aplica visualmente correções INDIVIDUAIS de poste/trafo.
  // Reconstrói o overlay a partir de contextoBdgd (lista completa de postes já corrigidos)
  // para garantir que postes fora do viewport também apareçam.
  useEffect(() => {
    const map = mapRef.current;
    const correcoes = props.bdgdCorrecoesPostes;
    if (!map || !correcoes || correcoes.length === 0) return;

    const tol = 1e-6; // ~0.1 m
    const aplicar = (lng: number, lat: number): [number, number] => {
      const c = correcoes.find(
        (c) =>
          Math.abs(c.original.lat - lat) < tol &&
          Math.abs(c.original.lng - lng) < tol,
      );
      return c ? [c.novo.lng, c.novo.lat] : [lng, lat];
    };

    // Atualiza trafos se houver correção de trafo
    if (correcoes.some((c) => c.tipo === "trafo")) {
      const trafSrc = map.getSource(BDGD_SRC.transformadores);
      if (trafSrc && trafSrc.type === "geojson") {
        const feats = map.querySourceFeatures(BDGD_SRC.transformadores);
        (trafSrc as maplibregl.GeoJSONSource).setData({
          type: "FeatureCollection",
          features: feats.map((f) => {
            if (f.geometry.type !== "Point") return { ...f, geometry: f.geometry } as Feature;
            const [lng, lat] = f.geometry.coordinates as [number, number];
            const [newLng, newLat] = aplicar(lng, lat);
            return { ...f, geometry: { type: "Point" as const, coordinates: [newLng, newLat] } } as Feature;
          }),
        });
      }
    }

    const postesSrc = map.getSource(BDGD_SRC.postes);
    if (!postesSrc) return;

    // Constrói o overlay a partir do contextoBdgd completo (todos os postes, com
    // posições já corrigidas) em vez de querySourceFeatures, que retorna apenas as
    // features presentes nos tiles carregados no viewport atual — o que faz postes
    // fora da vista desaparecerem quando o layer PMTiles original é ocultado.
    const ctx = propsRef.current.areaBdgd;
    const correctedFC: FeatureCollection = {
      type: "FeatureCollection",
      features: (ctx?.postesBdgd ?? []).map((p): Feature => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [p.wgs84.lng, p.wgs84.lat] },
        properties: {
          TIP_EST: p.tipEst ?? null,
          ALT_EST: p.altEst ?? null,
          TIP_OPE: p.tipOpe ?? null,
          COD_ID: p.codId ?? null,
        },
      })),
    };

    if (postesSrc.type === "geojson") {
      (postesSrc as maplibregl.GeoJSONSource).setData(correctedFC);
    } else {
      // PMTiles: overlay GeoJSON com todos os postes; layer PMTiles original oculto
      const OVR_SRC = BDGD_SRC.postes + "-corr";
      const OVR_LYR = BDGD_LYR.postes + "-corr";
      if (!map.getSource(OVR_SRC)) {
        map.addSource(OVR_SRC, { type: "geojson", data: correctedFC });
        map.addLayer({
          id: OVR_LYR,
          type: "circle",
          source: OVR_SRC,
          minzoom: 14,
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 14, 2, 17, 5] as maplibregl.ExpressionSpecification,
            "circle-color": "#334155",
            "circle-stroke-width": 1,
            "circle-stroke-color": "#94a3b8",
          },
        });
      } else {
        (map.getSource(OVR_SRC) as maplibregl.GeoJSONSource).setData(correctedFC);
      }
      if (map.getLayer(BDGD_LYR.postes)) {
        map.setLayoutProperty(BDGD_LYR.postes, "visibility", "none");
      }
    }
  }, [props.bdgdCorrecoesPostes]);

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
  // Anel de ESTRIBO DE ESPERA (ciano), 6.15.2 — por fora do CE4.
  map.addLayer({
    id: LYR.estribo,
    type: "circle",
    source: SRC.pontos,
    filter: ["all", ["==", ["get", "estribo"], true], ["==", ["get", "estriboConf"], false]],
    layout: { visibility: modoRede ? "visible" : "none" },
    paint: {
      "circle-radius": 21,
      "circle-color": "rgba(8,145,178,0.10)",
      "circle-stroke-width": 2,
      "circle-stroke-color": "#0891b2",
    },
  });

  // Estribo de espera confirmado pelo projetista — anel sólido ciano mais espesso.
  map.addLayer({
    id: LYR.estriboConf,
    type: "circle",
    source: SRC.pontos,
    filter: ["==", ["get", "estriboConf"], true],
    layout: { visibility: modoRede ? "visible" : "none" },
    paint: {
      "circle-radius": 21,
      "circle-color": "rgba(8,145,178,0.18)",
      "circle-stroke-width": 3,
      "circle-stroke-color": "#0891b2",
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

/** Inicializa as camadas vetoriais OSM (estradas, edifícios, vegetação) — todas ocultas. */
function inicializarCamadasOsmVec(map: maplibregl.Map) {
  if (map.getSource("osm-vec-src")) return;
  map.addSource("osm-vec-src", FONTE_OSM_VEC);

  // Vegetação / cobertura do solo
  map.addLayer({
    id: "osm-landcover",
    type: "fill",
    source: "osm-vec-src",
    "source-layer": "landcover",
    layout: { visibility: "none" },
    paint: {
      "fill-color": [
        "match", ["get", "class"],
        ["wood", "forest"], "#2d6a35",
        "grass", "#57a05a",
        "wetland", "#3d9b78",
        "#5a9e5e",
      ],
      "fill-opacity": 0.4,
    },
  });

  // Edificações
  map.addLayer({
    id: "osm-buildings",
    type: "fill",
    source: "osm-vec-src",
    "source-layer": "building",
    layout: { visibility: "none" },
    paint: {
      "fill-color": "#c8a96e",
      "fill-opacity": 0.55,
      "fill-outline-color": "#9a7240",
    },
  });

  // Estradas (secondary+)
  map.addLayer({
    id: "osm-roads",
    type: "line",
    source: "osm-vec-src",
    "source-layer": "transportation",
    filter: ["match", ["get", "class"],
      ["motorway", "trunk", "primary", "secondary", "tertiary", "minor"], true, false],
    layout: { visibility: "none", "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": "#ffffff",
      "line-width": ["interpolate", ["linear"], ["zoom"], 10, 1, 16, 4],
      "line-opacity": 0.85,
    },
  });

  // Caminhos e trilhas
  map.addLayer({
    id: "osm-paths",
    type: "line",
    source: "osm-vec-src",
    "source-layer": "transportation",
    filter: ["match", ["get", "class"], ["path", "track", "service"], true, false],
    layout: { visibility: "none", "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": "#ffe082",
      "line-width": ["interpolate", ["linear"], ["zoom"], 12, 0.8, 16, 2.5],
      "line-dasharray": [3, 1.5],
      "line-opacity": 0.8,
    },
  });
}

/** Liga ou desliga as camadas vetoriais OSM. */
function aplicarVisibilidadeOsmVec(map: maplibregl.Map, visivel: boolean) {
  const vis: "visible" | "none" = visivel ? "visible" : "none";
  for (const id of OSM_VEC_LYRS) {
    if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", vis);
  }
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


