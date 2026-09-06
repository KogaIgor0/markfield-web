import { XMLParser } from "fast-xml-parser";
import { novoId } from "../domain/ids";
import {
  tipoPontoDeApp,
  type EstiloLinha,
  type Foto,
  type LinhaLivre,
  type Ponto,
  type Trecho,
} from "../domain/model";

/**
 * Parser do KML exportado pelo app Markfield.
 *
 * Baseado no export real ("exportar tudo" → `Snia.kml`). O que o app entrega:
 *  - Pontos com `ExtendedData` (simbolo, observacao, origem, precisao_metros) e
 *    `styleUrl` (#estilo_postePropostoo, #estilo_pontoGenerico, #estilo_transformador).
 *  - Fotos como Placemarks independentes (styleUrl #estilo_foto), com precisão e
 *    data só na `description`.
 *  - Linhas de rede/cerca como LineString com styleUrl #estilo_linha_* — não vêm
 *    em todo projeto, mas o app sabe exportá-las.
 *
 * NENHUM id é exportado: nós cunhamos ids estáveis aqui (é a razão do `.mkf`).
 */

/** Acima desta precisão (m) a coordenada da foto é tratada como não confiável. */
export const LIMITE_PRECISAO_CONFIAVEL_M = 50;

export interface ConteudoKml {
  nomeProjeto?: string;
  pontos: Ponto[];
  fotos: Foto[];
  trechos: Trecho[];
  linhasLivres: LinhaLivre[];
  avisos: string[];
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  isArray: (name) =>
    name === "Folder" || name === "Placemark" || name === "Data" || name === "LineString",
  trimValues: true,
});

/** Lê "lng,lat,alt" → {lat,lng}. */
function coordPonto(texto: string): { lat: number; lng: number } | null {
  const [lng, lat] = texto.trim().split(",").map(Number);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

/** Lê "lng,lat,alt lng,lat,alt …" → [{lat,lng}, …]. */
function coordCaminho(texto: string): { lat: number; lng: number }[] {
  return texto
    .trim()
    .split(/\s+/)
    .map(coordPonto)
    .filter((c): c is { lat: number; lng: number } => c !== null);
}

/** Extrai "Campo: valor" de uma description separada por "|". */
function campoDescricao(desc: string | undefined, rotulo: string): string | undefined {
  if (!desc) return undefined;
  const re = new RegExp(`${rotulo}\\s*:\\s*([^|]+)`, "i");
  const m = desc.match(re);
  return m ? m[1].trim() : undefined;
}

function precisaoDe(texto: string | undefined): number | undefined {
  if (!texto) return undefined;
  const m = texto.match(/([\d]+(?:[.,]\d+)?)\s*m/i);
  if (!m) return undefined;
  const n = Number(m[1].replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
}

interface DataItem {
  "@_name"?: string;
  value?: string | number;
}

function lerExtendedData(pm: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  const ext = pm.ExtendedData as { Data?: DataItem[] } | undefined;
  for (const d of ext?.Data ?? []) {
    const nome = d["@_name"];
    if (nome != null && d.value != null) out[nome] = String(d.value);
  }
  return out;
}

function texto(v: unknown): string | undefined {
  if (v == null) return undefined;
  if (typeof v === "object" && "#text" in (v as object)) {
    return String((v as { "#text": unknown })["#text"]);
  }
  return String(v);
}

/** Numeração do ponto a partir do name ("P1 - 12600 Tomada" → "1"). */
function numeroDoNome(nome: string | undefined): string | undefined {
  if (!nome) return undefined;
  const m = nome.match(/^\s*P?(\d+)/i);
  return m ? m[1] : undefined;
}

interface LineStringXml {
  coordinates?: unknown;
}

/** Coleta as LineStrings de um Placemark — direto e dentro de MultiGeometry. */
function coletarLineStrings(pm: Record<string, unknown>): LineStringXml[] {
  const out: LineStringXml[] = [];
  const direto = pm.LineString as LineStringXml[] | undefined;
  if (direto) out.push(...direto);
  const multi = pm.MultiGeometry as { LineString?: LineStringXml[] } | undefined;
  if (multi?.LineString) out.push(...multi.LineString);
  return out;
}

/** Classifica o estilo da linha pelo styleUrl (já em minúsculas). */
function estiloLinha(styleUrl: string): EstiloLinha {
  if (styleUrl.includes("rede")) return "rede";
  if (styleUrl.includes("cerca")) return "cerca";
  if (styleUrl.includes("pontotraco")) return "pontoTraco";
  if (styleUrl.includes("continua")) return "continua";
  return "outro";
}

export function parseKml(xml: string): ConteudoKml {
  const avisos: string[] = [];
  const raiz = parser.parse(xml) as { kml?: { Document?: Record<string, unknown> } };
  const doc = raiz.kml?.Document;
  if (!doc) {
    return { pontos: [], fotos: [], trechos: [], linhasLivres: [], avisos: ["KML sem <Document>."] };
  }

  const nomeProjeto = texto(doc.name);

  // Placemarks podem estar soltos no Document ou dentro de Folders.
  const placemarks: Record<string, unknown>[] = [];
  for (const pm of (doc.Placemark as Record<string, unknown>[] | undefined) ?? []) placemarks.push(pm);
  for (const folder of (doc.Folder as Record<string, unknown>[] | undefined) ?? []) {
    for (const pm of (folder.Placemark as Record<string, unknown>[] | undefined) ?? []) {
      placemarks.push(pm);
    }
  }

  const pontos: Ponto[] = [];
  const fotos: Foto[] = [];
  const trechos: Trecho[] = [];
  const linhasLivres: LinhaLivre[] = [];

  for (const pm of placemarks) {
    const nome = texto(pm.name);
    const desc = texto(pm.description);
    const styleUrl = (texto(pm.styleUrl) ?? "").toLowerCase();
    const ext = lerExtendedData(pm);

    // Linhas: podem vir como <LineString> direto OU dentro de <MultiGeometry>
    // (é assim que o app guarda a cerca — um Placemark com dezenas de segmentos).
    const lineStrings = coletarLineStrings(pm);
    if (lineStrings.length > 0) {
      const estilo = estiloLinha(styleUrl);
      const ehRede = estilo === "rede";
      let usados = 0;
      for (const ls of lineStrings) {
        const caminho = coordCaminho(String(ls.coordinates ?? ""));
        if (caminho.length < 2) continue;
        usados++;
        if (ehRede) {
          trechos.push({
            id: novoId("tr"),
            classe: "indefinida",
            caminho,
            estilo,
            observacao: nome,
            origem: "campo",
          });
        } else {
          linhasLivres.push({
            id: novoId("ll"),
            caminho,
            estilo,
            observacao: nome,
            origem: "campo",
          });
        }
      }
      if (usados === 0) avisos.push(`Linha "${nome ?? "?"}" sem segmento válido.`);
      continue;
    }

    const ponto = pm.Point as { coordinates?: unknown } | undefined;
    if (ponto?.coordinates == null) {
      avisos.push(`Placemark "${nome ?? "?"}" sem geometria reconhecida.`);
      continue;
    }
    const c = coordPonto(String(ponto.coordinates));
    if (!c) {
      avisos.push(`Placemark "${nome ?? "?"}" com coordenada inválida.`);
      continue;
    }

    const ehFoto = styleUrl.includes("foto");
    if (ehFoto) {
      const precisaoM = precisaoDe(campoDescricao(desc, "Precis[ãa]o GPS"));
      fotos.push({
        id: novoId("ft"),
        nome: nome ?? undefined,
        arquivo: `fotos/${nome ?? "foto"}.jpg`,
        wgs84: c,
        precisaoM,
        capturadaEm: campoDescricao(desc, "Tirada em"),
        baixaConfianca: precisaoM != null && precisaoM >= LIMITE_PRECISAO_CONFIAVEL_M,
      });
      continue;
    }

    const simbolo = ext.simbolo ?? styleUrl.replace("#estilo_", "");
    const precisaoExt = ext.precisao_metros ? Number(ext.precisao_metros) : undefined;
    pontos.push({
      id: novoId("pt"),
      tipo: tipoPontoDeApp(simbolo),
      numero: numeroDoNome(nome),
      wgs84: c,
      observacao: ext.observacao ?? campoDescricao(desc, "Observação"),
      origem: "campo",
      fonteCoordenada: ext.origem ?? campoDescricao(desc, "Origem"),
      precisaoM:
        Number.isFinite(precisaoExt) && precisaoExt !== undefined
          ? precisaoExt
          : precisaoDe(campoDescricao(desc, "Precis[ãa]o GPS")),
      criadoEm: campoDescricao(desc, "Criado em"),
    });
  }

  return { nomeProjeto, pontos, fotos, trechos, linhasLivres, avisos };
}
