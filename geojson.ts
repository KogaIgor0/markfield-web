import type { Feature, FeatureCollection, LineString, Point } from "geojson";
import type { Projeto } from "../domain/model";

/**
 * Converte o modelo de domínio em FeatureCollections GeoJSON para o MapLibre.
 * As `properties` carregam só primitivos (o que o popup e o estilo precisam).
 */

export function pontosGeoJson(
  projeto: Projeto,
  papeis?: Map<string, string>,
  estaiIds?: Set<string>,
  estaiInstaladoIds?: Set<string>,
  sugCE4Ids?: Set<string>,
): FeatureCollection<Point> {
  const features: Feature<Point>[] = projeto.pontos.map((p) => ({
    type: "Feature",
    geometry: { type: "Point", coordinates: [p.wgs84.lng, p.wgs84.lat] },
    properties: {
      id: p.id,
      numero: p.numero ?? "",
      tipo: p.tipo,
      papel: papeis?.get(p.id) ?? "",
      estai: estaiIds?.has(p.id) ?? false,
      estaiOk: estaiInstaladoIds?.has(p.id) ?? false,
      sugCE4: sugCE4Ids?.has(p.id) ?? false,
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
  // Lookup de pontos por id — usado para derivar geometria quando o trecho
  // tem dePontoId/aPontoId mas não tem caminho[] (export do app móvel).
  const pontosPorId = new Map(projeto.pontos.map((p) => [p.id, p]));

  const trechos: Feature<LineString>[] = projeto.trechos
    .map((t): Feature<LineString> | null => {
      let coords: number[][];
      if (t.caminho && t.caminho.length >= 2) {
        // Geometria explícita (ex.: trecho reconstruído ou importado do KML).
        coords = t.caminho.map((c) => [c.lng, c.lat]);
      } else if (t.dePontoId && t.aPontoId) {
        // Topologia por referência (ex.: export do app .mkf): deriva as coords.
        const de = pontosPorId.get(t.dePontoId);
        const a = pontosPorId.get(t.aPontoId);
        if (!de || !a) return null; // endpoint fantasma — descarta
        coords = [
          [de.wgs84.lng, de.wgs84.lat],
          [a.wgs84.lng, a.wgs84.lat],
        ];
      } else {
        return null; // sem geometria nem topologia — não pode desenhar
      }
      return {
        type: "Feature",
        geometry: { type: "LineString", coordinates: coords },
        properties: {
          id: t.id,
          kind: "trecho",
          estilo: t.estilo ?? "rede",
          reduzida: Boolean(t.tracaoReduzida),
          observacao: t.observacao ?? "",
        },
      };
    })
    .filter((f): f is Feature<LineString> => f !== null);
  const livres: Feature<LineString>[] = projeto.linhasLivres.map((l) => ({
    type: "Feature",
    geometry: { type: "LineString", coordinates: l.caminho.map((c) => [c.lng, c.lat]) },
    properties: {
      id: l.id,
      kind: "livre",
      estilo: l.estilo ?? "continua",
      observacao: l.observacao ?? "",
    },
  }));
  return { type: "FeatureCollection", features: [...trechos, ...livres] };
}
