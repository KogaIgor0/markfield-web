/**
 * Catálogo de transformadores (E-06) — rede compacta Elektro (DIS-NOR-013).
 *
 * Potências normalizadas NBR 5356 / Elektro, fases e elos fusíveis sugeridos.
 * Os elos são valores típicos para 15 kV; o projetista pode sobrescrever.
 */
import type { DadosTransformador } from "./model";

/** Potências nominais normalizadas (kVA). */
export const POTENCIAS_KVA: number[] = [
  10, 15, 25, 30, 37.5, 45, 75, 112.5, 150, 225, 300, 500,
];

export type FasesTrafo = DadosTransformador["fases"];

export const FASES_OPCOES: { valor: FasesTrafo; rotulo: string }[] = [
  { valor: "monofasico", rotulo: "Monofásico (1F)" },
  { valor: "bifasico",   rotulo: "Bifásico (1F+N)" },
  { valor: "trifasico",  rotulo: "Trifásico (3F)" },
];

/**
 * Elos fusíveis disponíveis no catálogo Elektro (T&B / Cooper Power).
 */
export const ELOS_FUSIVEL: string[] = [
  "1K", "2K", "3K", "5K", "6K", "8K", "10K",
  "12K", "15K", "20K", "25K", "40K", "65K", "100K",
];

/**
 * Sugere o elo fusível a partir das fases e da potência (kVA) para 15 kV.
 *
 * Tabela empírica baseada em DIS-NOR-013 + prática Elektro SP.
 * Formato da tabela: [kVA_máx, elo_mono/bi, elo_trifásico].
 */
export function sugerirEloFusivel(
  fases: FasesTrafo,
  potenciaKva: number,
): string | undefined {
  if (!potenciaKva || potenciaKva <= 0) return undefined;
  // [kVA_máx, elo_mono_bi, elo_tri]
  const tabela: [number, string, string][] = [
    [10,    "3K",   "3K"],
    [15,    "3K",   "3K"],
    [25,    "5K",   "5K"],
    [30,    "5K",   "5K"],
    [37.5,  "8K",   "6K"],
    [45,    "10K",  "8K"],
    [75,    "15K",  "12K"],
    [112.5, "25K",  "20K"],
    [150,   "40K",  "25K"],
    [225,   "65K",  "40K"],
    [300,   "100K", "65K"],
    [500,   "100K", "100K"],
  ];
  for (const [kvaMax, eloMono, eloTri] of tabela) {
    if (potenciaKva <= kvaMax) {
      return fases === "trifasico" ? eloTri : eloMono;
    }
  }
  return "100K";
}

/** Cria um `DadosTransformador` inicial com defaults razoáveis. */
export function novoTrafo(): DadosTransformador {
  const fases: FasesTrafo = "trifasico";
  const kva = 45;
  return {
    fases,
    potenciaKva: kva,
    chaveFusivel: true,
    paraRaio: true,
    aterramento: true,
    eloFusivel: sugerirEloFusivel(fases, kva),
    iluminacaoPublica: false,
    compartilhamento: false,
  };
}
