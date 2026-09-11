import type { LatLng, Projeto, UtmPoint } from "./model";
import { deUtm, paraUtm } from "../geo/utm";

/**
 * Esforço mecânico + estai (B4 / T4) — rede compacta Elektro (DIS-NOR-013).
 *
 * Em cada poste, os cabos das lanças vizinhas puxam com uma tração ~horizontal
 * H. A **resultante** desses puxões é o esforço que o poste precisa aguentar;
 * se passa da **capacidade nominal** do poste (daN), entra **estai**.
 *
 * Cálculo (geral e exato para tração igual H em todas as lanças):
 *   R = H · | Σ  û_i |          (û_i = vetor unitário do poste a cada vizinho, em UTM)
 * Isso reproduz a fórmula do Igor R = √(F1²+F2²+2·F1·F2·cosβ), β = 180−α:
 *   - fim de rede (1 vão):        R = H            (puxão cheio de um lado só)
 *   - tangente (2 vãos, α≈0):     R ≈ 0            (os dois lados se equilibram)
 *   - ângulo α (2 vãos):          R = 2·H·sin(α/2)
 *   - derivação (3+ vãos):        soma vetorial das lanças
 *
 * ⚠️ **Tração H provisória:** usamos a tração de projeto da DIS-NOR-013
 * (Tab. 7–9, cabo 35 mm²/15 kV, vão de referência 50 m) como H constante por
 * lança. A tabela completa (H por vão/temperatura/vento) é um refinamento; por
 * isso o resultado sai marcado como **aproximado**. A geometria (quais postes
 * puxam mais) já é exata.
 */

export type CondicaoVento = "urbana" | "rural_alto" | "rural_medio_baixo";

/** Tração de projeto H (daN) — DIS-NOR-013 Tab.7–9 (35 mm²/15 kV, vão 50 m). */
export const TRACAO_DAN: Record<CondicaoVento, number> = {
  urbana: 438,
  rural_alto: 595, // rural, alto grau de obstrução (mais abrigado → menos vento)
  rural_medio_baixo: 714, // rural, médio/baixo grau (mais exposto → mais vento) — pior caso
};

export const ROTULO_CONDICAO: Record<CondicaoVento, string> = {
  urbana: "Urbana",
  rural_alto: "Rural (alta obstrução)",
  rural_medio_baixo: "Rural (média/baixa)",
};

/** Capacidade nominal padrão do poste (daN) — Quadro 8, concreto circular, A35P. */
export const CAPACIDADE_PADRAO_DAN = 400;
/** Condição de vento padrão do piloto rural. */
export const CONDICAO_PADRAO: CondicaoVento = "rural_medio_baixo";
/** Comprimento do símbolo de estai no mapa (m) — footprint aproximado. */
export const ESTAI_COMPRIMENTO_M = 15;

export interface EsforcoPoste {
  /** Esforço resultante R (daN). */
  esforcoDaN: number;
  /** Capacidade nominal considerada (daN). */
  capacidadeDaN: number;
  /** R > capacidade → o poste precisa de estai. */
  precisaEstai: boolean;
  /** O projetista registrou o estai instalado. */
  estaiInstalado: boolean;
  /** Precisa de estai E ainda não foi instalado → pendência de projeto. */
  pendente: boolean;
  /** Quantas lanças (vãos) chegam ao poste. */
  vaos: number;
  /**
   * Azimute (°, 0=N, sentido horário) da **resultante do esforço** — a direção
   * pra onde a rede puxa o poste. O estai é ancorado no sentido OPOSTO.
   */
  azimuteEsforco?: number;
  /** Ponta do estai no mapa (poste → âncora, no sentido oposto ao esforço). */
  estaiAte?: LatLng;
  /** Resultado é aproximado (tração H provisória — ver topo do arquivo). */
  aproximado: boolean;
}

export interface OpcoesEsforco {
  condicao?: CondicaoVento;
  /** Capacidade padrão quando o poste não define a sua. */
  capacidadePadraoDaN?: number;
}

export interface RedeEsforcos {
  condicao: CondicaoVento;
  tracaoDaN: number;
  postes: Map<string, EsforcoPoste>;
  /** Postes que precisam de estai (total). */
  totalEstais: number;
  /** Precisam e ainda NÃO têm estai instalado (pendências). */
  pendentes: number;
  /** Já têm estai instalado. */
  instalados: number;
}

/** Vetores unitários (em UTM) do poste `id` até cada vizinho na topologia. */
function unitariosAosVizinhos(
  id: string,
  porId: Map<string, UtmPoint>,
  adj: Map<string, Set<string>>,
): { x: number; y: number }[] {
  const o = porId.get(id);
  if (!o) return [];
  const us: { x: number; y: number }[] = [];
  for (const viz of adj.get(id) ?? []) {
    const v = porId.get(viz);
    if (!v) continue;
    const dx = v.easting - o.easting;
    const dy = v.northing - o.northing;
    const d = Math.hypot(dx, dy);
    if (d > 0) us.push({ x: dx / d, y: dy / d });
  }
  return us;
}

export function modelarEsforcos(projeto: Projeto, opcoes: OpcoesEsforco = {}): RedeEsforcos {
  const condicao = opcoes.condicao ?? CONDICAO_PADRAO;
  const H = TRACAO_DAN[condicao];
  const capacidadePadrao = opcoes.capacidadePadraoDaN ?? CAPACIDADE_PADRAO_DAN;

  // UTM de cada ponto + adjacência (trechos que ligam postes).
  const porId = new Map<string, UtmPoint>();
  for (const p of projeto.pontos) porId.set(p.id, paraUtm(p.wgs84));
  const adj = new Map<string, Set<string>>();
  for (const p of projeto.pontos) adj.set(p.id, new Set());
  for (const t of projeto.trechos) {
    if (t.dePontoId && t.aPontoId && adj.has(t.dePontoId) && adj.has(t.aPontoId)) {
      adj.get(t.dePontoId)!.add(t.aPontoId);
      adj.get(t.aPontoId)!.add(t.dePontoId);
    }
  }

  const postes = new Map<string, EsforcoPoste>();
  let totalEstais = 0;
  let pendentes = 0;
  let instalados = 0;
  for (const p of projeto.pontos) {
    const us = unitariosAosVizinhos(p.id, porId, adj);
    let sx = 0;
    let sy = 0;
    for (const u of us) {
      sx += u.x;
      sy += u.y;
    }
    const mag = Math.hypot(sx, sy);
    const esforcoDaN = H * mag;
    const capacidadeDaN = p.capacidadeDaN ?? capacidadePadrao;
    const precisaEstai = us.length > 0 && esforcoDaN > capacidadeDaN + 1e-6;
    const estaiInstalado = Boolean(p.estaiInstalado);
    const pendente = precisaEstai && !estaiInstalado;
    if (precisaEstai) {
      totalEstais++;
      if (estaiInstalado) instalados++;
      else pendentes++;
    }

    // Direção do esforço (resultante) e ponta do estai no sentido OPOSTO.
    let azimuteEsforco: number | undefined;
    let estaiAte: LatLng | undefined;
    if (precisaEstai && mag > 1e-9) {
      const rx = sx / mag; // resultante (para onde a rede puxa), unitário em UTM
      const ry = sy / mag;
      // azimute do esforço: 0=Norte, horário. Em UTM x=Este, y=Norte.
      azimuteEsforco = (Math.atan2(rx, ry) * 180) / Math.PI;
      const pu = porId.get(p.id)!;
      // estai ancora no sentido oposto (−R̂), a ESTAI_COMPRIMENTO_M metros.
      estaiAte = deUtm({
        easting: pu.easting - rx * ESTAI_COMPRIMENTO_M,
        northing: pu.northing - ry * ESTAI_COMPRIMENTO_M,
        zone: pu.zone,
        hemisphere: pu.hemisphere,
      });
    }

    postes.set(p.id, {
      esforcoDaN,
      capacidadeDaN,
      precisaEstai,
      estaiInstalado,
      pendente,
      vaos: us.length,
      azimuteEsforco,
      estaiAte,
      aproximado: true,
    });
  }

  return { condicao, tracaoDaN: H, postes, totalEstais, pendentes, instalados };
}
