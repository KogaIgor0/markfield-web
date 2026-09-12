import type { LatLng, Projeto } from "./model";
import { paraUtm } from "../geo/utm";

/**
 * Motor de desenho da prancha (B6) — parte determinística e testável.
 *
 * A prancha é a **folha em escala** (o desenho de projeto), não o mapa nem o DXF
 * de cadastro. Este módulo cuida só da MATEMÁTICA da folha: caixa envolvente da
 * rede em UTM (metros), escolha da **escala** (menor escala-padrão que cabe na
 * área de desenho) e a projeção **UTM → milímetros** na folha. O desenho em si
 * (SVG, carimbo, simbologia) é a `ui/PranchaView`.
 *
 * Convenção: trabalhamos em UTM SIRGAS 2000 (a mesma verdade métrica do esforço
 * e do DXF). Numa escala 1:E, 1 mm no papel = E mm reais = E/1000 m; logo
 *   papel_mm = real_m · 1000 / E.
 * A folha usa a convenção matemática (x pra direita, **y pra cima**); o SVG
 * inverte o y na hora de desenhar (Norte pra cima).
 */

// --------------------------------------------------------------------------
// Folha
// --------------------------------------------------------------------------

export type FolhaId = "A4" | "A3" | "A2" | "A1";
export type Orientacao = "retrato" | "paisagem";

/** Dimensões ISO 216 em RETRATO (largura × altura), mm. */
export const DIM_FOLHA: Record<FolhaId, [number, number]> = {
  A4: [210, 297],
  A3: [297, 420],
  A2: [420, 594],
  A1: [594, 841],
};

export interface DimFolha {
  larguraMm: number;
  alturaMm: number;
}

/** Dimensão da folha na orientação pedida (mm). */
export function dimFolha(id: FolhaId, orientacao: Orientacao): DimFolha {
  const [w, h] = DIM_FOLHA[id];
  return orientacao === "paisagem"
    ? { larguraMm: h, alturaMm: w }
    : { larguraMm: w, alturaMm: h };
}

// --------------------------------------------------------------------------
// Escala
// --------------------------------------------------------------------------

/**
 * Escalas-padrão de projeto (o "E" de 1:E). Da mais detalhada (menor número =
 * mais zoom) à mais aberta. A escolha automática pega a **menor** (mais
 * detalhada) que ainda faz a rede caber na área de desenho.
 */
export const ESCALAS_PADRAO = [100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000] as const;

/** Caixa envolvente em UTM (metros). */
export interface Bbox {
  minE: number;
  minN: number;
  maxE: number;
  maxN: number;
}

/** Caixa envolvente dos pontos do projeto (UTM). `null` se não há pontos. */
export function bboxProjeto(projeto: Projeto): Bbox | null {
  return bboxDeCoords(projeto.pontos.map((p) => p.wgs84));
}

/** Caixa envolvente de uma lista de coordenadas WGS84, em UTM. */
export function bboxDeCoords(coords: LatLng[]): Bbox | null {
  if (coords.length === 0) return null;
  let minE = Infinity;
  let minN = Infinity;
  let maxE = -Infinity;
  let maxN = -Infinity;
  for (const c of coords) {
    const u = paraUtm(c);
    if (u.easting < minE) minE = u.easting;
    if (u.easting > maxE) maxE = u.easting;
    if (u.northing < minN) minN = u.northing;
    if (u.northing > maxN) maxN = u.northing;
  }
  return { minE, minN, maxE, maxN };
}

/** Largura/altura reais da caixa (metros). */
export function tamanhoRealM(bbox: Bbox): { larguraM: number; alturaM: number } {
  return { larguraM: bbox.maxE - bbox.minE, alturaM: bbox.maxN - bbox.minN };
}

/**
 * Menor escala-padrão (1:E) em que a rede cabe numa área de `larguraMm` ×
 * `alturaMm` (já descontadas margens/carimbo). Aplica uma folga (`margemFrac`,
 * padrão 10%) pra rede não colar na borda. Se nem a maior escala couber, devolve
 * a maior (a UI avisa que talvez precise de mais de uma folha).
 */
export function escalaParaCaber(
  bbox: Bbox,
  larguraMm: number,
  alturaMm: number,
  margemFrac = 0.1,
): number {
  const { larguraM, alturaM } = tamanhoRealM(bbox);
  const dispW = larguraMm * (1 - margemFrac);
  const dispH = alturaMm * (1 - margemFrac);
  // E mínimo pra caber em cada eixo: papel_mm = real_m·1000/E ≤ disp  →  E ≥ real_m·1000/disp.
  const eMinW = dispW > 0 ? (larguraM * 1000) / dispW : 0;
  const eMinH = dispH > 0 ? (alturaM * 1000) / dispH : 0;
  const eMin = Math.max(eMinW, eMinH);
  for (const e of ESCALAS_PADRAO) {
    if (e >= eMin) return e;
  }
  return ESCALAS_PADRAO[ESCALAS_PADRAO.length - 1];
}

// --------------------------------------------------------------------------
// Projeção UTM → folha (mm)
// --------------------------------------------------------------------------

/** Um ponto na folha, em mm, convenção matemática (x→direita, y→cima) a partir do canto da caixa. */
export interface PontoMm {
  xMm: number;
  yMm: number;
}

/** Projeta um ponto UTM na folha (mm), relativo ao canto mínimo da caixa, na escala dada. */
export function projetar(
  utm: { easting: number; northing: number },
  bbox: Bbox,
  escala: number,
): PontoMm {
  return {
    xMm: ((utm.easting - bbox.minE) * 1000) / escala,
    yMm: ((utm.northing - bbox.minN) * 1000) / escala,
  };
}

/** Atalho: projeta uma coordenada WGS84 na folha (mm). */
export function projetarCoord(coord: LatLng, bbox: Bbox, escala: number): PontoMm {
  return projetar(paraUtm(coord), bbox, escala);
}

/** Dimensão do desenho no papel (mm) para uma caixa numa escala. */
export function dimensaoDesenhoMm(bbox: Bbox, escala: number): DimFolha {
  const { larguraM, alturaM } = tamanhoRealM(bbox);
  return {
    larguraMm: (larguraM * 1000) / escala,
    alturaMm: (alturaM * 1000) / escala,
  };
}

/**
 * Comprimento "redondo" bom pra barra de escala, dado o comprimento máximo
 * disponível no papel (mm) e a escala. Escolhe 1·10ⁿ, 2·10ⁿ ou 5·10ⁿ metros —
 * o maior que ainda cabe em `maxMm`.
 */
export function passoEscalaM(maxMm: number, escala: number): number {
  const maxReal = (maxMm * escala) / 1000; // metros que cabem em maxMm
  if (maxReal <= 0) return 0;
  const pot = Math.pow(10, Math.floor(Math.log10(maxReal)));
  for (const m of [5, 2, 1]) {
    if (m * pot <= maxReal) return m * pot;
  }
  return pot;
}
