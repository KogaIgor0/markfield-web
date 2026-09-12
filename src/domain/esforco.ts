import type { LatLng, Ponto, Projeto, UtmPoint } from "./model";
import { deUtm, paraUtm } from "../geo/utm";
import {
  acharCabo,
  CABO_PADRAO,
  CONDICAO_PADRAO,
  ROTULO_CONDICAO,
  tracaoDoCabo,
  type CondicaoVento,
} from "./cabos";

/**
 * Esforço mecânico + estai (B4 / T4) — rede compacta Elektro (DIS-NOR-013).
 *
 * Em cada poste, os cabos das lanças vizinhas puxam com uma tração ~horizontal
 * H. A **resultante** desses puxões é o esforço que o poste precisa aguentar;
 * se passa da **capacidade nominal** do poste (daN), entra **estai**.
 *
 * Cálculo (soma vetorial, H por lança conforme o CABO do trecho — E-03):
 *   R = | Σ  H_i · û_i |      (û_i = unitário do poste a cada vizinho, em UTM)
 * Com H igual em todas as lanças reproduz a fórmula do Igor R = √(F1²+F2²+2F1F2cosβ):
 *   - fim de rede (1 vão):        R = H            (puxão cheio de um lado só)
 *   - tangente (2 vãos, α≈0):     R ≈ 0            (os dois lados se equilibram)
 *   - ângulo α (2 vãos):          R = 2·H·sin(α/2)
 *   - derivação (3+ vãos):        soma vetorial das lanças
 *
 * H vem do **catálogo de cabos** (`cabos.ts`) pela condição de vento. Só o A35P
 * está confirmado; os demais são provisórios → resultado marcado **aproximado**.
 * A geometria (quais postes puxam mais) já é exata.
 */

// Re-export para compat (App e testes importam daqui).
export { ROTULO_CONDICAO, CONDICAO_PADRAO };
export type { CondicaoVento };

/** Tração H (daN) do cabo padrão A35P por condição — atalho de compat. */
export const TRACAO_DAN: Record<CondicaoVento, number> = acharCabo(CABO_PADRAO).tracaoDaN;

/** Capacidade nominal padrão do poste (daN) — Quadro 8, concreto circular, A35P. */
export const CAPACIDADE_PADRAO_DAN = 400;
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

/** Vizinho na topologia + tração H (daN) da lança que os liga (do cabo do trecho). */
interface Lanca {
  viz: string;
  H: number;
}

/**
 * Vetores de FORÇA (em UTM) do poste `id` a cada vizinho: unitário × H da lança.
 * Somados dão a resultante do esforço R = |Σ Hᵢ·ûᵢ|.
 */
function forcasAosVizinhos(
  id: string,
  porId: Map<string, UtmPoint>,
  adjH: Map<string, Lanca[]>,
): { x: number; y: number }[] {
  const o = porId.get(id);
  if (!o) return [];
  const fs: { x: number; y: number }[] = [];
  for (const { viz, H } of adjH.get(id) ?? []) {
    const v = porId.get(viz);
    if (!v) continue;
    const dx = v.easting - o.easting;
    const dy = v.northing - o.northing;
    const d = Math.hypot(dx, dy);
    if (d > 0) fs.push({ x: (dx / d) * H, y: (dy / d) * H });
  }
  return fs;
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
  const capacidadePadrao = opcoes.capacidadePadraoDaN ?? CAPACIDADE_PADRAO_DAN;

  // UTM de cada ponto + adjacência COM a tração H de cada lança (do cabo do trecho).
  const porId = new Map<string, UtmPoint>();
  for (const p of projeto.pontos) porId.set(p.id, paraUtm(p.wgs84));
  const adjH = new Map<string, Lanca[]>();
  for (const p of projeto.pontos) adjH.set(p.id, []);
  for (const t of projeto.trechos) {
    if (t.dePontoId && t.aPontoId && adjH.has(t.dePontoId) && adjH.has(t.aPontoId)) {
      // Vão "frouxo" (E-05): usa a tração REDUZIDA do cabo — o lance puxa pouco,
      // transferindo o esforço da tomada pro poste da frente (some o estai lá).
      const H = t.tracaoReduzida
        ? acharCabo(t.tipoCabo).tracaoReduzidaDaN
        : tracaoDoCabo(t.tipoCabo, condicao);
      adjH.get(t.dePontoId)!.push({ viz: t.aPontoId, H });
      adjH.get(t.aPontoId)!.push({ viz: t.dePontoId, H });
    }
  }

  const postes = new Map<string, EsforcoPoste>();
  let totalEstais = 0;
  let pendentes = 0;
  let instalados = 0;
  for (const p of projeto.pontos) {
    const fs = forcasAosVizinhos(p.id, porId, adjH);
    const nviz = fs.length;
    let sx = 0;
    let sy = 0;
    for (const f of fs) {
      sx += f.x;
      sy += f.y;
    }
    const esforcoDaN = Math.hypot(sx, sy); // R = |Σ Hᵢ·ûᵢ|
    const capacidadeDaN = p.capacidadeDaN ?? capacidadePadrao;
    const precisaEstai = nviz > 0 && esforcoDaN > capacidadeDaN + 1e-6;
    const pu = porId.get(p.id)!;

    // Direção do esforço (resultante) e a SUGESTÃO de estai (sentido oposto).
    let azimuteEsforco: number | undefined;
    let sugestaoAzimute: number | undefined;
    if (esforcoDaN > 1e-9) {
      const rx = sx / esforcoDaN;
      const ry = sy / esforcoDaN;
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
      vaos: nviz,
      azimuteEsforco,
      sugestaoAzimute,
      aproximado: true,
    });
  }

  // tracaoDaN no resumo = H do cabo padrão na condição (referência do HUD).
  return { condicao, tracaoDaN: TRACAO_DAN[condicao], postes, totalEstais, pendentes, instalados };
}
