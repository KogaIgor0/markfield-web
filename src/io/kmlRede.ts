/**
 * Parser de KML/KMZ de rede elétrica para GeoJSON.
 *
 * Extrai todas as LineStrings de um arquivo KML ou KMZ (zip com doc.kml),
 * preservando o nome do alimentador (pasta pai) e o nome do segmento.
 * Diferente de kml.ts (que lê o formato exportado pelo MarkField),
 * este lida com arquivos de terceiros (ex: exportados do GIS da distribuidora).
 */

import { XMLParser } from "fast-xml-parser";
import JSZip from "jszip";

export interface KmlRedeResultado {
  geojson: GeoJSON.FeatureCollection;
  nomeArquivo: string;
  totalSegmentos: number;
  alimentadores: string[];
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  isArray: (name) => ["Folder", "Placemark", "LineString"].includes(name),
  trimValues: true,
});

function coordsTexto(texto: string): [number, number][] {
  return texto
    .trim()
    .split(/\s+/)
    .flatMap((s) => {
      const partes = s.split(",").map(Number);
      const [lng, lat] = partes;
      if (Number.isFinite(lng) && Number.isFinite(lat)) return [[lng, lat] as [number, number]];
      return [];
    });
}

function extrairPlacemarks(
  obj: Record<string, unknown>,
  pastaAtual: string,
  features: GeoJSON.Feature[],
): void {
  const pms = (obj.Placemark as Record<string, unknown>[] | undefined) ?? [];
  for (const pm of pms) {
    const nome = String(pm.name ?? "");
    const lineStrings = (pm.LineString as { coordinates?: unknown }[] | undefined) ?? [];
    for (const ls of lineStrings) {
      const coords = coordsTexto(String(ls.coordinates ?? ""));
      if (coords.length >= 2) {
        features.push({
          type: "Feature",
          properties: { nome, alimentador: pastaAtual },
          geometry: { type: "LineString", coordinates: coords },
        });
      }
    }
  }

  for (const sub of (obj.Folder as Record<string, unknown>[] | undefined) ?? []) {
    const nomeSub = String((sub as Record<string, unknown>).name ?? "").trim();
    extrairPlacemarks(
      sub as Record<string, unknown>,
      nomeSub || pastaAtual,
      features,
    );
  }
}

/**
 * Lê um File KML ou KMZ e retorna GeoJSON + metadados.
 * Descompacta o KMZ via JSZip (já dependência do projeto).
 */
export async function parseKmlRede(arquivo: File): Promise<KmlRedeResultado> {
  let xml: string;

  if (arquivo.name.toLowerCase().endsWith(".kmz")) {
    const zip = await JSZip.loadAsync(await arquivo.arrayBuffer());
    const kmlEntry = Object.values(zip.files).find((f) => f.name.endsWith(".kml"));
    if (!kmlEntry) throw new Error("KMZ sem arquivo .kml interno");
    xml = await kmlEntry.async("text");
  } else {
    xml = await arquivo.text();
  }

  const raiz = parser.parse(xml) as { kml?: { Document?: Record<string, unknown> } };
  const doc = raiz.kml?.Document;
  if (!doc) throw new Error("KML sem <Document>");

  const features: GeoJSON.Feature[] = [];
  const nomePastaRaiz = String((doc.name as unknown) ?? "").trim();
  extrairPlacemarks(doc, nomePastaRaiz, features);

  const alimentadores = [
    ...new Set(
      features
        .map((f) => String(f.properties?.["alimentador"] ?? ""))
        .filter(Boolean),
    ),
  ].sort();

  return {
    geojson: { type: "FeatureCollection", features },
    nomeArquivo: arquivo.name,
    totalSegmentos: features.length,
    alimentadores,
  };
}
