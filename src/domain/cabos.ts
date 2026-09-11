/**
 * Catálogo de cabos (E-03) — rede compacta Elektro (DIS-NOR-013).
 *
 * O cabo é atributo do TRECHO. A tração de projeto **H** (daN) por lança sai
 * daqui — é o que o motor de esforço (B4) usa para dimensionar estai. H depende
 * do cabo, da condição de vento/zona e do vão (usamos o vão de referência 50 m).
 *
 * ⚠️ **Só o A35P (35 mm² 15 kV) está confirmado** (438/595/714 daN — validado
 * antes contra a norma). Os demais cabos entram para já serem selecionáveis
 * ("teremos que ter esses cabos"), com os dados FÍSICOS da norma (diâmetro,
 * ruptura) corretos, mas a **tração provisória** (`tracaoConfirmada: false`) até
 * o Igor confirmar as Tabelas 7/8/9. Corrigir é editar o número aqui — o motor
 * e a UI não mudam. Ver `claude/markfield-catalogo-elektro.md`.
 */

/** Condição de vento/zona — escolhe a coluna da tabela de tração. */
export type CondicaoVento = "urbana" | "rural_alto" | "rural_medio_baixo";

export const ROTULO_CONDICAO: Record<CondicaoVento, string> = {
  urbana: "Urbana",
  rural_alto: "Rural (alta obstrução)",
  rural_medio_baixo: "Rural (média/baixa)",
};

/** Condição de vento padrão do piloto rural (pior caso — mais exposto). */
export const CONDICAO_PADRAO: CondicaoVento = "rural_medio_baixo";

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
  /** As trações foram confirmadas contra a norma? (só A35P por ora). */
  tracaoConfirmada: boolean;
}

/** Cabo padrão do piloto (rural MT). */
export const CABO_PADRAO = "A35P";

/**
 * Catálogo Elektro (piloto). Físico (diâmetro/ruptura) da norma; tração só
 * confirmada no A35P — os demais são **provisórios** até validação.
 */
export const CABOS: Cabo[] = [
  {
    codigo: "A35P",
    rotulo: "A35P — 35 mm² coberto 15 kV",
    secaoMm2: 35,
    tensaoKv: 15,
    diametroMm: 14.05,
    rupturaDaN: 455,
    tracaoDaN: { urbana: 438, rural_alto: 595, rural_medio_baixo: 714 },
    tracaoConfirmada: true, // validado contra a DIS-NOR-013
  },
  {
    codigo: "A70P",
    rotulo: "A70P — 70 mm² coberto 15 kV (provisório)",
    secaoMm2: 70,
    tensaoKv: 15,
    diametroMm: 16.75,
    rupturaDaN: 910,
    tracaoDaN: { urbana: 511, rural_alto: 668, rural_medio_baixo: 793 },
    tracaoConfirmada: false, // do resumo do PDF — a confirmar
  },
  {
    codigo: "A185P",
    rotulo: "A185P — 185 mm² coberto 15 kV (provisório)",
    secaoMm2: 185,
    tensaoKv: 15,
    diametroMm: 23.05,
    rupturaDaN: 2405,
    // urbana 714 (resumo); rural estimado pelos deltas do A35P — A CONFIRMAR.
    tracaoDaN: { urbana: 714, rural_alto: 871, rural_medio_baixo: 990 },
    tracaoConfirmada: false,
  },
];

/** Acha um cabo pelo código; cai no padrão quando ausente/desconhecido. */
export function acharCabo(codigo?: string): Cabo {
  const c = codigo ? CABOS.find((x) => x.codigo === codigo) : undefined;
  return c ?? CABOS.find((x) => x.codigo === CABO_PADRAO) ?? CABOS[0];
}

/** Tração de projeto H (daN) de um cabo na condição dada. */
export function tracaoDoCabo(codigo: string | undefined, condicao: CondicaoVento): number {
  return acharCabo(codigo).tracaoDaN[condicao];
}
