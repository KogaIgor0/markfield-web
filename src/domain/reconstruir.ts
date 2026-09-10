import { paraUtm } from "../geo/utm";
import { novoId } from "./ids";
import type { LatLng, Projeto, Trecho } from "./model";

/**
 * Reconstrução da topologia da rede importada.
 *
 * O app exporta a rede como uma **linha** (LineString, estilo "rede"), sem dizer
 * quais postes ela liga. Sem isso, o Web trata a linha como geometria solta e o
 * motor (dividir vãos, estruturas, esforço) a ignora — o projetista tinha que
 * apagar e "Ligar postes" na mão.
 *
 * Como os vértices da linha passam pelos postes (o levantamento é feito andando
 * pela rede), dá pra **reconstruir a topologia**: casar cada vértice ao poste
 * mais próximo (dentro de uma tolerância) e criar os trechos reais entre os
 * postes que a linha visita, na ordem. Assim o export do campo "já funciona".
 *
 * Só mexe em linhas **"rede" sem pontas ligadas**; trechos já ligados (ex.: de
 * um `.mkf` do Web) e cercas/linhas livres ficam intactos.
 */

/** Distância (m) até um poste para considerar o vértice "no" poste. */
export const TOLERANCIA_SNAP_M = 12;

export interface ResultadoReconstrucao {
  projeto: Projeto;
  /** Trechos poste-a-poste criados. */
  trechosCriados: number;
  /** Linhas "rede" que viraram topologia. */
  linhasReconhecidas: number;
  /** Linhas "rede" que não casaram 2+ postes (ficaram como estavam). */
  linhasSemPoste: number;
}

/** Há linha "rede" importada (sem pontas) esperando reconstrução? */
export function precisaReconstruir(projeto: Projeto): boolean {
  return projeto.trechos.some(
    (t) =>
      t.estilo === "rede" &&
      !(t.dePontoId && t.aPontoId) &&
      Boolean(t.caminho) &&
      t.caminho!.length >= 2,
  );
}

interface XY {
  x: number;
  y: number;
}

/** Distância de um ponto à polilinha e o comprimento acumulado até a projeção. */
function projetarNaPolilinha(poly: XY[], p: XY): { dist: number; arco: number } {
  let melhor = { dist: Infinity, arco: 0 };
  let acc = 0;
  for (let i = 0; i < poly.length - 1; i++) {
    const a = poly[i];
    const b = poly[i + 1];
    const vx = b.x - a.x;
    const vy = b.y - a.y;
    const len2 = vx * vx + vy * vy;
    const len = Math.sqrt(len2);
    let t = len2 > 0 ? ((p.x - a.x) * vx + (p.y - a.y) * vy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const px = a.x + t * vx;
    const py = a.y + t * vy;
    const d = Math.hypot(p.x - px, p.y - py);
    if (d < melhor.dist) melhor = { dist: d, arco: acc + t * len };
    acc += len;
  }
  return melhor;
}

export function reconstruirRede(projeto: Projeto, tolM = TOLERANCIA_SNAP_M): ResultadoReconstrucao {
  // A rede liga POSTES (poste proposto / transformador). Pontos genéricos são
  // obstáculos (cerca, córrego, árvore) — mesmo que fiquem sobre a linha do
  // levantamento, NÃO entram como nós da rede.
  const polesUtm = projeto.pontos
    .filter((p) => p.tipo === "postePropostoo" || p.tipo === "transformador")
    .map((p) => {
      const u = paraUtm(p.wgs84);
      return { id: p.id, xy: { x: u.easting, y: u.northing } as XY };
    });
  const porId = new Map(projeto.pontos.map((p) => [p.id, p]));

  const manter: Trecho[] = [];
  const novos: Trecho[] = [];
  let trechosCriados = 0;
  let linhasReconhecidas = 0;
  let linhasSemPoste = 0;

  for (const t of projeto.trechos) {
    const alvo =
      t.estilo === "rede" &&
      !(t.dePontoId && t.aPontoId) &&
      Boolean(t.caminho) &&
      t.caminho!.length >= 2;
    if (!alvo) {
      manter.push(t);
      continue;
    }
    // Projeta a polilinha da linha em UTM e acha os postes que caem SOBRE ela.
    const poly: XY[] = (t.caminho as LatLng[]).map((c) => {
      const u = paraUtm(c);
      return { x: u.easting, y: u.northing };
    });
    const sobre = polesUtm
      .map((pp) => ({ id: pp.id, ...projetarNaPolilinha(poly, pp.xy) }))
      .filter((r) => r.dist <= tolM)
      .sort((a, b) => a.arco - b.arco);
    // Ordem dos postes ao longo da linha (sem repetir em seguida).
    const seq: string[] = [];
    for (const r of sobre) if (seq[seq.length - 1] !== r.id) seq.push(r.id);
    if (seq.length < 2) {
      manter.push(t); // não deu pra reconhecer — deixa a linha como está
      linhasSemPoste++;
      continue;
    }
    linhasReconhecidas++;
    for (let i = 0; i < seq.length - 1; i++) {
      const de = porId.get(seq[i])!;
      const a = porId.get(seq[i + 1])!;
      novos.push({
        id: novoId("tr"),
        classe: t.classe ?? "indefinida",
        estilo: "rede",
        dePontoId: seq[i],
        aPontoId: seq[i + 1],
        caminho: [{ ...de.wgs84 }, { ...a.wgs84 }],
        origem: t.origem ?? "campo",
        observacao: t.observacao,
      });
      trechosCriados++;
    }
    // a linha original é substituída pelos trechos reconstruídos (não vai p/ manter)
  }

  const projetoNovo: Projeto = {
    ...projeto,
    trechos: [...manter, ...novos],
    meta: { ...projeto.meta, atualizadoEm: new Date().toISOString() },
  };
  return { projeto: projetoNovo, trechosCriados, linhasReconhecidas, linhasSemPoste };
}
