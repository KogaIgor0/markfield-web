import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Projeto } from "../domain/model";
import { rotuloTipo } from "../domain/model";
import { formatarUtm, paraUtm } from "../geo/utm";
import { fotosGeoJson, linhasGeoJson, pontosGeoJson } from "./geojson";

/**
 * Mapa base + render do projeto importado (DRS RI-01, RF-07; Fase 1).
 *
 * A fonte de tiles de satélite (Esri World Imagery) é só base de desenvolvimento;
 * a definitiva é a D-09, ainda em aberto. Trocar aqui não afeta o resto do app.
 *
 * Cores dos símbolos espelham o KML do app (postePropostoo laranja, transformador
 * azul, genérico cinza, foto verde) para o Web "falar a mesma língua" do campo.
 */

const ESTILO_SATELITE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    satelite: {
      type: "raster",
      tiles: [
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      ],
      tileSize: 256,
      attribution: "Tiles © Esri — World Imagery (base de desenvolvimento)",
    },
  },
  layers: [{ id: "satelite", type: "raster", source: "satelite" }],
};

const CENTRO_INICIAL: [number, number] = [-47.9, -15.8];
const ZOOM_INICIAL = 4;

const SRC = { pontos: "mkf-pontos", fotos: "mkf-fotos", linhas: "mkf-linhas" } as const;
const LYR = {
  linhas: "mkf-linhas",
  fotos: "mkf-fotos",
  pontos: "mkf-pontos",
} as const;

function esc(s: unknown): string {
  return String(s ?? "").replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c,
  );
}

interface MapCanvasProps {
  projeto?: Projeto | null;
  imagens?: Map<string, string>;
}

export function MapCanvas({ projeto, imagens }: MapCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  // Cria o mapa uma vez.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: ESTILO_SATELITE,
      center: CENTRO_INICIAL,
      zoom: ZOOM_INICIAL,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl(), "top-right");
    map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Desenha o projeto sempre que ele muda.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !projeto) return;

    const desenhar = () => desenharProjeto(map, projeto, imagens);
    if (map.isStyleLoaded()) desenhar();
    else map.once("load", desenhar);

    return () => {
      map.off("load", desenhar);
    };
  }, [projeto, imagens]);

  return <div ref={containerRef} className="map-canvas" />;
}

function limpar(map: maplibregl.Map) {
  for (const id of Object.values(LYR)) if (map.getLayer(id)) map.removeLayer(id);
  for (const id of Object.values(SRC)) if (map.getSource(id)) map.removeSource(id);
}

function desenharProjeto(map: maplibregl.Map, projeto: Projeto, imagens?: Map<string, string>) {
  limpar(map);

  map.addSource(SRC.linhas, { type: "geojson", data: linhasGeoJson(projeto) });
  map.addSource(SRC.fotos, { type: "geojson", data: fotosGeoJson(projeto) });
  map.addSource(SRC.pontos, { type: "geojson", data: pontosGeoJson(projeto) });

  map.addLayer({
    id: LYR.linhas,
    type: "line",
    source: SRC.linhas,
    paint: {
      "line-color": ["match", ["get", "kind"], "trecho", "#ff9d00", "#4caf50"],
      "line-width": 3,
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

  wirePopups(map, imagens);
  enquadrar(map, projeto);
}

function wirePopups(map: maplibregl.Map, imagens?: Map<string, string>) {
  const apontar = (id: string) => {
    map.on("mouseenter", id, () => (map.getCanvas().style.cursor = "pointer"));
    map.on("mouseleave", id, () => (map.getCanvas().style.cursor = ""));
  };
  apontar(LYR.pontos);
  apontar(LYR.fotos);

  map.on("click", LYR.pontos, (e) => {
    const f = e.features?.[0];
    if (!f || f.geometry.type !== "Point") return;
    const [lng, lat] = f.geometry.coordinates as [number, number];
    const p = f.properties ?? {};
    const utm = paraUtm({ lat, lng });
    const prec = p.precisaoM != null && p.precisaoM !== "" ? `${p.precisaoM} m` : "—";
    const html = `
      <div class="pop">
        <div class="pop-h">${p.numero ? `P${esc(p.numero)}` : "Ponto"} · ${esc(rotuloTipo(p.tipo))}</div>
        ${p.observacao ? `<div class="pop-obs">${esc(p.observacao)}</div>` : ""}
        <table class="pop-t">
          <tr><td>UTM</td><td>${esc(formatarUtm(utm))}</td></tr>
          <tr><td>Lat/Lng</td><td>${lat.toFixed(6)}, ${lng.toFixed(6)}</td></tr>
          <tr><td>Precisão</td><td>${esc(prec)}</td></tr>
          ${p.criadoEm ? `<tr><td>Criado</td><td>${esc(p.criadoEm)}</td></tr>` : ""}
        </table>
      </div>`;
    new maplibregl.Popup({ maxWidth: "320px" }).setLngLat([lng, lat]).setHTML(html).addTo(map);
  });

  map.on("click", LYR.fotos, (e) => {
    const f = e.features?.[0];
    if (!f || f.geometry.type !== "Point") return;
    const [lng, lat] = f.geometry.coordinates as [number, number];
    const p = f.properties ?? {};
    const url = p.nome ? imagens?.get(String(p.nome)) : undefined;
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
