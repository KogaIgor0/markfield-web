/**
 * Camada MapLibre para rede KML importada pelo usuário.
 *
 * Layer separada da BDGD: azul (#3b82f6) para distinguir visualmente
 * da rede BDGD (cinza) e da rede proposta (laranja).
 */

import maplibregl from "maplibre-gl";

export const KML_REDE_SRC = "kml-rede-src";
export const KML_REDE_LYR = "kml-rede-lyr";

const FC_VAZIO: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

/**
 * Inicializa source e layer para a rede KML.
 * Deve ser chamada APÓS inicializarCamadasBdgd (fica acima da BDGD, abaixo do projeto).
 */
export function inicializarCamadaKmlRede(map: maplibregl.Map, beforeId?: string): void {
  if (map.getSource(KML_REDE_SRC)) return;

  map.addSource(KML_REDE_SRC, { type: "geojson", data: FC_VAZIO });

  const opts = beforeId && map.getLayer(beforeId) ? { beforeId } : {};
  map.addLayer({
    ...opts,
    id: KML_REDE_LYR,
    type: "line",
    source: KML_REDE_SRC,
    minzoom: 8,
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": "#3b82f6",   // azul — diferencia de BDGD (cinza) e projeto (laranja)
      "line-width": ["interpolate", ["linear"], ["zoom"], 10, 1.5, 14, 3, 18, 5],
      "line-opacity": 0.8,
    },
  } as maplibregl.LayerSpecification);
}

/** Carrega (ou atualiza) os dados da rede KML no mapa. */
export function carregarKmlRede(
  map: maplibregl.Map,
  geojson: GeoJSON.FeatureCollection,
): void {
  const src = map.getSource(KML_REDE_SRC) as maplibregl.GeoJSONSource | undefined;
  src?.setData(geojson);
}

/** Remove os dados (mantém a source vazia, pronta para novo arquivo). */
export function limparKmlRede(map: maplibregl.Map): void {
  const src = map.getSource(KML_REDE_SRC) as maplibregl.GeoJSONSource | undefined;
  src?.setData(FC_VAZIO);
}

/** Alterna visibilidade da camada. */
export function setVisibilidadeKmlRede(map: maplibregl.Map, visivel: boolean): void {
  if (!map.getLayer(KML_REDE_LYR)) return;
  map.setLayoutProperty(KML_REDE_LYR, "visibility", visivel ? "visible" : "none");
}
