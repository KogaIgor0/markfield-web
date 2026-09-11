/**
 * Catálogo de estruturas (E-02) — rede compacta Elektro (DIS-NOR-013 rev.08).
 *
 * Fonte única das estruturas que o sistema conhece: classificação automática
 * (B3), override manual (painel), e futuro materiais (B5) / legenda da prancha
 * (B6). **É o que está na norma — não inventamos.** Onde a norma tem variação de
 * grafia/uso, marcamos e o campo "Outro…" do painel cobre o resto.
 *
 * Estrutura = uma família BASE (pelo ângulo/função) + um SUFIXO de equipamento
 * (transformador, para-raios, chave…). Ex.: CE2 + PR = "CE2 PR"; CE3 + TR = "CE3TR".
 */

export type FuncaoEstrutura =
  | "tangente"
  | "angulo"
  | "encabecamento"
  | "fim"
  | "afastador";

export interface EstruturaDef {
  /** Código base (ex.: "CE2"). */
  codigo: string;
  /** Rótulo legível para a UI. */
  rotulo: string;
  funcao: FuncaoEstrutura;
  /** Faixa de deflexão aplicável (°), quando classificável por ângulo. */
  anguloMin?: number;
  anguloMax?: number;
  /** O motor pode atribuir automaticamente (por ângulo/papel)? */
  auto: boolean;
}

/** Estruturas BASE (DIS-NOR-013). Faixas de ângulo confirmadas com o Igor. */
export const CATALOGO_ESTRUTURAS: EstruturaDef[] = [
  { codigo: "CE1", rotulo: "CE1 — tangente (0–6°)", funcao: "tangente", anguloMin: 0, anguloMax: 6, auto: true },
  { codigo: "CE1A", rotulo: "CE1A — tangente antibalanço", funcao: "tangente", anguloMin: 0, anguloMax: 6, auto: false },
  { codigo: "CE2", rotulo: "CE2 — ângulo (6–60°)", funcao: "angulo", anguloMin: 6, anguloMax: 60, auto: true },
  { codigo: "CE4", rotulo: "CE4 — ancoragem / ângulo (60–90°)", funcao: "angulo", anguloMin: 60, anguloMax: 90, auto: true },
  { codigo: "CE3-CE3", rotulo: "CE3-CE3 — duplo encabeçamento (> 90°)", funcao: "encabecamento", anguloMin: 90, auto: true },
  { codigo: "CE3", rotulo: "CE3 — encabeçamento / fim / derivação", funcao: "fim", auto: true },
  { codigo: "CEJ1", rotulo: "CEJ1 — tangente com afastador", funcao: "afastador", anguloMin: 0, anguloMax: 6, auto: false },
  { codigo: "CEJ1-SAH", rotulo: "CEJ1 SAH — afastador 2500 mm", funcao: "afastador", anguloMin: 0, anguloMax: 6, auto: false },
  { codigo: "CEJ2", rotulo: "CEJ2 — ângulo com afastador", funcao: "afastador", anguloMin: 6, anguloMax: 60, auto: false },
  { codigo: "CEJ2-SAH", rotulo: "CEJ2 SAH — afastador 2500 mm", funcao: "afastador", anguloMin: 6, anguloMax: 60, auto: false },
];

export interface SufixoDef {
  /** Sufixo como grafado (ex.: "TR", "PR"). */
  sufixo: string;
  rotulo: string;
  /** Junta ao código com espaço ("CE2 PR") ou colado ("CE3TR")? */
  colado?: boolean;
}

/** Sufixos de equipamento (DIS-NOR-013 §6.16/6.21, Tabela 1). */
export const SUFIXOS_ESTRUTURA: SufixoDef[] = [
  { sufixo: "TR", rotulo: "Transformador", colado: true },
  { sufixo: "TRSC", rotulo: "Transformador sem chave fusível", colado: true },
  { sufixo: "CF", rotulo: "Chave fusível" },
  { sufixo: "PR", rotulo: "Para-raios" },
  { sufixo: "SU", rotulo: "Seccionador unipolar" },
  { sufixo: "SUH", rotulo: "Seccionador unipolar horizontal" },
  { sufixo: "SUI", rotulo: "Seccionador unipolar inclinado" },
  { sufixo: "DS", rotulo: "Derivação subterrânea (descida)" },
  { sufixo: "SAH", rotulo: "Suporte afastador horizontal" },
  { sufixo: "PU", rotulo: "Poste existente (elevação)" },
];

/** Códigos base (compat com o antigo `CODIGOS_ESTRUTURA`). */
export const CODIGOS_ESTRUTURA: readonly string[] = CATALOGO_ESTRUTURAS.map((e) => e.codigo);

/** Junta código base + sufixo conforme a grafia da norma (colado p/ TR). */
export function comporEstrutura(base: string, sufixo: string | ""): string {
  if (!sufixo) return base;
  const def = SUFIXOS_ESTRUTURA.find((s) => s.sufixo === sufixo);
  return def?.colado ? `${base}${sufixo}` : `${base} ${sufixo}`;
}

/**
 * Separa um código composto em {base, sufixo} (melhor esforço). Usado pra
 * pré-preencher os seletores do painel a partir do `estruturaManual` gravado.
 */
export function separarEstrutura(codigo: string): { base: string; sufixo: string } {
  const v = codigo.trim();
  if (!v) return { base: "", sufixo: "" };
  // ordena sufixos por tamanho (evita casar "SU" antes de "SUH")
  const suf = [...SUFIXOS_ESTRUTURA].sort((a, b) => b.sufixo.length - a.sufixo.length);
  for (const s of suf) {
    const comEspaco = ` ${s.sufixo}`;
    if (v.endsWith(comEspaco)) return { base: v.slice(0, -comEspaco.length).trim(), sufixo: s.sufixo };
    if (v.endsWith(s.sufixo)) {
      const base = v.slice(0, -s.sufixo.length).trim();
      if ((CODIGOS_ESTRUTURA as string[]).includes(base)) return { base, sufixo: s.sufixo };
    }
  }
  return { base: v, sufixo: "" };
}

/** Rótulo do código base (para exibição). */
export function rotuloEstruturaCodigo(codigo: string): string {
  return CATALOGO_ESTRUTURAS.find((e) => e.codigo === codigo)?.rotulo ?? codigo;
}
