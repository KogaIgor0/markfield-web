/**
 * Catálogo de cabos (E-03) — rede compacta Elektro (DIS-NOR-013).
 *
 * O cabo é atributo do TRECHO. A tração de projeto **H** (daN) por lança sai
 * daqui — é o que o motor de esforço (B4) usa para dimensionar estai.
 *
 * ⚠️ Os dados vêm do PACK_ELEKTRO (fonte única). Editar os valores = editar o
 * pack em `packs/elektro.ts`. Ver `claude/markfield-arquitetura-motor.md`.
 */
import { PACK_ELEKTRO } from "../packs/elektro";

/** Condição de vento/zona — escolhe a coluna da tabela de tração. */
export type CondicaoVento = "urbana" | "rural_alto" | "rural_medio_baixo";

export const ROTULO_CONDICAO: Record<CondicaoVento, string> = {
  urbana: "Urbana",
  rural_alto: "Rural (alta obstrução)",
  rural_medio_baixo: "Rural (média/baixa)",
};

/** Condição de vento padrão do piloto — vem do pack da distribuidora. */
export const CONDICAO_PADRAO: CondicaoVento = PACK_ELEKTRO.normas.condicaoPadrao;

export interface Cabo {
  /** Código no sistema (ex.: "A35P"). */
  codigo: string;
  /** Rótulo legível (ex.: "A35P — 35 mm² coberto 15 kV"). */
  rotulo: string;
  secaoMm2: number;
  tensaoKv: number;
  /** Diâmetro nominal (mm) — DIS-NOR-013 Anexo I Tab.2. */
  diametroMm: number;
  /** Carga de ruptura do condutor (daN). */
  rupturaDaN: number;
  /** Tração de projeto H (daN) por condição, vão de referência 50 m (Tab.7–9). */
  tracaoDaN: Record<CondicaoVento, number>;
  /**
   * Tração REDUZIDA (daN) para vão "frouxo" de transferência de esforço (E-05):
   * ~30% da tração de projeto rural média — provisório, a confirmar.
   */
  tracaoReduzidaDaN: number;
  /** As trações foram confirmadas contra a norma? (só A35P por ora). */
  tracaoConfirmada: boolean;
}

/** Cabo padrão do piloto — vem do pack da distribuidora. */
export const CABO_PADRAO: string = PACK_ELEKTRO.normas.caboPadrao;

/** Catálogo de cabos — fonte: PACK_ELEKTRO (DIS-NOR-013). */
export const CABOS: Cabo[] = PACK_ELEKTRO.cabos;

/** Acha um cabo pelo código; cai no padrão quando ausente/desconhecido. */
export function acharCabo(codigo?: string): Cabo {
  const c = codigo ? CABOS.find((x) => x.codigo === codigo) : undefined;
  return c ?? CABOS.find((x) => x.codigo === CABO_PADRAO) ?? CABOS[0];
}

/** Tração de projeto H (daN) de um cabo na condição dada. */
export function tracaoDoCabo(codigo: string | undefined, condicao: CondicaoVento): number {
  return acharCabo(codigo).tracaoDaN[condicao];
}
