import type { LatLng, Ponto, Projeto, UtmPoint } from "./model";
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
export const ESTAI_COMPRIMENTO_M = 10;

/** Normaliza um azimute para o intervalo [0, 360). */
export function normalizarAzimute(graus: number): number {
  return ((graus % 360) + 360) % 360;
}

/** Um estai já resolvido para desenho: direção + ponta no mapa. */
export interface EstaiResolvido {
  id: string;
  /** Azimute (° 0=N, horário) da âncora vista do poste. */
  azimuteGraus: number;
  /** `true` = ainda na direção sugerida; `false` = girado à mão. */
  auto: boolean;
  /** Ponta do estai (poste → âncora), a ESTAI_COMPRIMENTO_M metros. */
  ate: LatLng;
}

export interface EsforcoPoste {
  /** Esforço resultante R (daN). */
  esforcoDaN: number;
  /** Capacidade nominal considerada (daN). */
  capacidadeDaN: number;
  /** R > capacidade → o poste precisa de (ao menos um) estai. */
  precisaEstai: boolean;
  /** Estais instalados no poste — pode ter 0, 1 ou mais (E-01). */
  estais: EstaiResolvido[];
  /** Precisa de estai E não há nenhum instalado → pendência de projeto. */
  pendente: boolean;
  /** Quantas lanças (vãos) chegam ao poste. */
  vaos: number;
  /**
   * Azimute (°, 0=N, sentido horário) da **resultante do esforço** — a direção
   * pra onde a rede puxa o poste. O estai é ancorado no sentido OPOSTO.
   */
  azimuteEsforco?: number;
  /**
   * Direção **sugerida** para um novo estai (oposto ao esforço). É o azimute que
   * o botão "Adicionar estai" usa por padrão; o projetista gira depois.
   */
  sugestaoAzimute?: number;
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

/** Ponta do estai (âncora) a partir do poste, num azimute, a ESTAI_COMPRIMENTO_M metros. */
function pontaEstai(pu: UtmPoint, azimuteGraus: number): LatLng {
  const rad = (azimuteGraus * Math.PI) / 180;
  return deUtm({
    easting: pu.easting + Math.sin(rad) * ESTAI_COMPRIMENTO_M, // x = Este
    northing: pu.northing + Math.cos(rad) * ESTAI_COMPRIMENTO_M, // y = Norte
    zone: pu.zone,
    hemisphere: pu.hemisphere,
  });
}

/**
 * Estais configurados no poste, com **compatibilidade** com arquivos antigos:
 * usa `estais[]` quando existe; senão converte o `estaiInstalado`/
 * `estaiAzimuteManual` (um estai só) usando a sugestão como direção padrão.
 */
function estaisConfigurados(
  p: Ponto,
  sugestaoAzimute: number | undefined,
): { id: string; azimuteGraus: number; auto: boolean }[] {
  if (p.estais && p.estais.length) {
    return p.estais.map((e) => ({
      id: e.id,
      azimuteGraus: normalizarAzimute(e.azimuteGraus),
      auto: Boolean(e.auto),
    }));
  }
  if (p.estaiInstalado) {
    const az = p.estaiAzimuteManual ?? sugestaoAzimute ?? 0;
    return [{ id: "legado", azimuteGraus: normalizarAzimute(az), auto: p.estaiAzimuteManual == null }];
  }
  return [];
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
    const pu = porId.get(p.id)!;

    // Direção do esforço (resultante) e a SUGESTÃO de estai (sentido oposto).
    let azimuteEsforco: number | undefined;
    let sugestaoAzimute: number | undefined;
    if (mag > 1e-9) {
      const rx = sx / mag;
      const ry = sy / mag;
      azimuteEsforco = normalizarAzimute((Math.atan2(rx, ry) * 180) / Math.PI);
      sugestaoAzimute = normalizarAzimute((Math.atan2(-rx, -ry) * 180) / Math.PI); // oposto
    }

    // Estais instalados (0, 1 ou mais), com a ponta no mapa. Compat com o formato antigo.
    const estais: EstaiResolvido[] = estaisConfigurados(p, sugestaoAzimute).map((e) => ({
      ...e,
      ate: pontaEstai(pu, e.azimuteGraus),
    }));

    const pendente = precisaEstai && estais.length === 0;
    if (precisaEstai) {
      totalEstais++;
      if (estais.length > 0) instalados++;
      else pendentes++;
    }

    postes.set(p.id, {
      esforcoDaN,
      capacidadeDaN,
      precisaEstai,
      estais,
      pendente,
      vaos: us.length,
      azimuteEsforco,
      sugestaoAzimute,
      aproximado: true,
    });
  }

  return { condicao, tracaoDaN: H, postes, totalEstais, pendentes, instalados };
}
