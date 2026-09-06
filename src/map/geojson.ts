import type { Feature, FeatureCollection, LineString, Point } from "geojson";
import type { Projeto } from "../domain/model";

/**
 * Converte o modelo de domínio em FeatureCollections GeoJSON para o MapLibre.
 * As `properties` carregam só primitivos (o que o popup e o estilo precisam).
 */

export function pontosGeoJson(projeto: Projeto): FeatureCollection<Point> {
  const features: Feature<Point>[] = projeto.pontos.map((p) => ({
    type: "Feature",
    geometry: { type: "Point", coordinates: [p.wgs84.lng, p.wgs84.lat] },
    properties: {
      id: p.id,
      numero: p.numero ?? "",
      tipo: p.tipo,
      observacao: p.observacao ?? "",
      precisaoM: p.precisaoM ?? null,
      criadoEm: p.criadoEm ?? "",
    },
  }));
  return { type: "FeatureCollection", features };
}

export function fotosGeoJson(projeto: Projeto): FeatureCollection<Point> {
  const features: Feature<Point>[] = projeto.fotos.map((f) => ({
    type: "Feature",
    geometry: { type: "Point", coordinates: [f.wgs84.lng, f.wgs84.lat] },
    properties: {
      id: f.id,
      nome: f.nome ?? "",
      precisaoM: f.precisaoM ?? null,
      capturadaEm: f.capturadaEm ?? "",
      baixaConfianca: Boolean(f.baixaConfianca),
    },
  }));
  return { type: "FeatureCollection", features };
}

export function linhasGeoJson(projeto: Projeto): FeatureCollection<LineString> {
  const trechos: Feature<LineString>[] = projeto.trechos
    .filter((t) => t.caminho && t.caminho.length >= 2)
    .map((t) => ({
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: t.caminho!.map((c) => [c.lng, c.lat]),
      },
      properties: { id: t.id, kind: "trecho", observacao: t.observacao ?? "" },
    }));
  const livres: Feature<LineString>[] = projeto.linhasLivres.map((l) => ({
    type: "Feature",
    geometry: { type: "LineString", coordinates: l.caminho.map((c) => [c.lng, c.lat]) },
    properties: { id: l.id, kind: "livre", observacao: l.observacao ?? "" },
  }));
  return { type: "FeatureCollection", features: [...trechos, ...livres] };
}
