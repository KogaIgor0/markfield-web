import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

/**
 * Mapa base do editor (DRS RI-01, RF-07).
 *
 * Fase 0: satélite + pan/zoom, centrado no Brasil. A fonte de tiles aqui é a
 * de satélite da Esri (World Imagery) apenas como base de desenvolvimento —
 * a fonte definitiva (incl. tiles por API para compor a prancha) é a decisão
 * D-09, ainda em aberto. Trocar aqui não afeta o resto do app.
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
  layers: [
    {
      id: "satelite",
      type: "raster",
      source: "satelite",
    },
  ],
};

// Centro aproximado do Brasil, zoom baixo. Ajustado ao carregar um projeto.
const CENTRO_INICIAL: [number, number] = [-47.9, -15.8];
const ZOOM_INICIAL = 4;

export function MapCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

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

  return <div ref={containerRef} className="map-canvas" />;
}
