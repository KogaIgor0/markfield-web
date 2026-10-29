/**
 * Catálogo de estruturas (E-02) — rede compacta Elektro (DIS-NOR-013 rev.08).
 *
 * Os dados vêm do PACK_ELEKTRO (fonte única). Editar = editar `packs/elektro.ts`.
 * Ver `claude/markfield-arquitetura-motor.md`.
 */
import { PACK_ELEKTRO } from "../packs/elektro";

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

export interface SufixoDef {
  /** Sufixo como grafado (ex.: "TR", "PR"). */
  sufixo: string;
  rotulo: string;
  /** Junta ao código com espaço ("CE2 PR") ou colado ("CE3TR")? */
  colado?: boolean;
}

/** Estruturas BASE (DIS-NOR-013) — fonte: PACK_ELEKTRO. */
export const CATALOGO_ESTRUTURAS: EstruturaDef[] = PACK_ELEKTRO.estruturas.catalogo;

/** Sufixos de equipamento (DIS-NOR-013 §6.16/6.21) — fonte: PACK_ELEKTRO. */
export const SUFIXOS_ESTRUTURA: SufixoDef[] = PACK_ELEKTRO.estruturas.sufixos;

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
