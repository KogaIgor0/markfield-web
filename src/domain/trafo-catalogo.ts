/**
 * Catálogo de transformadores (E-06) — rede compacta Elektro (DIS-NOR-013).
 *
 * Potências normalizadas NBR 5356 / Elektro, fases, elos fusíveis sugeridos,
 * especificações de para-raio e chave fusível.
 * Os elos são valores típicos para 15 kV; o projetista pode sobrescrever.
 */
import type { DadosTransformador } from "./model";

// --------------------------------------------------------------------------
// Tipos e catálogos
// --------------------------------------------------------------------------

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

/** Elos fusíveis disponíveis (Cooper/T&B — curva K padrão Elektro). */
export const ELOS_FUSIVEL: string[] = [
  "1K", "2K", "3K", "5K", "6K", "8K", "10K",
  "12K", "15K", "20K", "25K", "40K", "65K", "100K",
];

/** Especificações de para-raio para 15 kV (código de corrente nominal). */
export const PARA_RAIO_SPECS: string[] = [
  "3K", "5K", "10K", "12K", "15K", "20K",
];

/** Especificações de chave fusível (portafusível — corrente de fusão do elo). */
export const CHFU_SPECS: string[] = [
  "3K", "5K", "8K", "10K", "12K", "15K", "20K", "25K", "40K", "65K", "100K",
];

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

/**
 * Quantidade de equipamentos (PR / CHFU / ELO) por número de fases.
 *   Monofásico → 1 · Bifásico → 2 · Trifásico → 3
 */
export function qtdPorFases(fases: FasesTrafo): number {
  return fases === "trifasico" ? 3 : fases === "bifasico" ? 2 : 1;
}

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
    chaveFusivelSpec: "15K",
    paraRaio: true,
    paraRaioSpec: "12K",
    aterramento: true,
    eloFusivel: sugerirEloFusivel(fases, kva),
    iluminacaoPublica: false,
    compartilhamento: false,
  };
}

// --------------------------------------------------------------------------
// Geração do texto do oblongo (prancha)
// --------------------------------------------------------------------------

/**
 * Monta a string completa do oblongo de um poste-trafo no formato Elektro:
 *
 *   `11600 - CE3TR - 3PR12K - ATERRAMENTO - 3CHFU15K - 3ELO5K - TR-3-45KVA`
 *
 * Todas as partes são separadas por " - " e ficam no mesmo nível tipográfico
 * (sem linha divisória). A string será quebrada em linhas pelo `BalaoPosto`.
 *
 * @param alturaM    Altura do poste em metros (ex.: 11)
 * @param cargaDaN   Carga do poste em daN (ex.: 600)
 * @param estrutura  Código da estrutura primária (ex.: "CE3TR") — pode ser vazio
 * @param trafo      Dados do equipamento trafo
 */
export function textoOblongoTrafo(
  alturaM: number,
  cargaDaN: number,
  estrutura: string,
  trafo: DadosTransformador,
): string {
  const qtd = qtdPorFases(trafo.fases);
  const partes: string[] = [];

  // 1. Poste (sem espaço entre altura e carga, padrão Elektro)
  partes.push(`${alturaM}${cargaDaN}`);

  // 2. Estrutura primária (CE3TR etc.)
  if (estrutura) partes.push(estrutura);

  // 3. Para-raio: NxPR12K
  if (trafo.paraRaio && trafo.paraRaioSpec) {
    partes.push(`${qtd}PR${trafo.paraRaioSpec}`);
  }

  // 4. Aterramento
  if (trafo.aterramento) partes.push("ATERRAMENTO");

  // 5. Chave fusível: NxCHFU15K
  if (trafo.chaveFusivel && trafo.chaveFusivelSpec) {
    partes.push(`${qtd}CHFU${trafo.chaveFusivelSpec}`);
  }

  // 6. Elo fusível: NxELO5K
  if (trafo.chaveFusivel && trafo.eloFusivel) {
    partes.push(`${qtd}ELO${trafo.eloFusivel}`);
  }

  // 7. Estrutura secundária (se definida)
  if (trafo.estruturaSecundaria) partes.push(trafo.estruturaSecundaria);

  // 8. Transformador: TR-N-kVAKVA (ex.: TR-3-45KVA)
  partes.push(`TR-${qtd}-${trafo.potenciaKva}KVA`);

  // 9. Iluminação pública
  if (trafo.iluminacaoPublica) {
    partes.push(trafo.iluminacaoTipo ? `IP ${trafo.iluminacaoTipo}` : "IP");
  }

  // (Compartilhamento omitido do oblongo — somente para projetos específicos)

  return partes.join(" - ");
}

/**
 * Quebra a string do oblongo em múltiplas linhas respeitando os separadores
 * " - " e um máximo de caracteres por linha. Nunca quebra no meio de uma parte.
 */
export function quebrarLinhasOblongo(texto: string, maxChars = 26): string[] {
  const partes = texto.split(" - ");
  const linhas: string[] = [];
  let atual = "";

  for (const p of partes) {
    const candidato = atual ? `${atual} - ${p}` : p;
    if (candidato.length > maxChars && atual) {
      linhas.push(atual);
      atual = p;
    } else {
      atual = candidato;
    }
  }
  if (atual) linhas.push(atual);
  return linhas.length > 0 ? linhas : [""];
}
