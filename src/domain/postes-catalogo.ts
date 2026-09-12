/**
 * Catálogo de postes (B8) — concreto armado, DIS-ETE-011 rev.06 (Neoenergia).
 *
 * O poste é designado por **altura(m)/carga de topo(daN)** — ex.: `11/400`,
 * `12/600`, `12/1500`. A **carga nominal de topo** é a resistência que o esforço
 * usa (antes era um número solto no ponto); a **altura** vem da regra de projeto
 * (mín. rural 11 m / urbana 12 m — DIS-NOR-012 6.8.2) + vão/cruzamento.
 *
 * Fonte: DIS-ETE-011 rev.06, Anexo I (tabelas de postes seção circular e duplo
 * T). O projeto real da Elektro (Meridiano-SP) usa postes desta tabela: 11/300
 * (DT), 11/400, 11/600, 12/600 (circular). Como o catálogo de cabos, dá pra
 * editar aqui sem mexer no motor. *(A confirmar o subconjunto exato da Elektro.)*
 */

export type SecaoPoste = "circular" | "duploT";

export interface TipoPoste {
  /** Código estável (ex.: "C-11/600", "DT-11/300"). */
  codigo: string;
  secao: SecaoPoste;
  /** Altura nominal (m). */
  alturaM: number;
  /** Carga nominal de topo (daN) — capacidade mecânica. */
  cargaDaN: number;
  /** Rótulo legível (ex.: "11 m · 600 daN · circular"). */
  rotulo: string;
}

/** Cargas por altura — seção CIRCULAR (DIS-ETE-011 rev06, Anexo I). */
const CIRCULAR: Record<number, number[]> = {
  9: [400, 600, 1000, 1500],
  11: [400, 600, 1000, 1500],
  12: [400, 600, 1000, 1500, 2000],
  14: [1000, 1500, 2000],
  16: [1000, 1500],
};

/** Cargas por altura — seção DUPLO T (DIS-ETE-011 rev06, Anexo I). */
const DUPLO_T: Record<number, number[]> = {
  9: [200, 300],
  11: [200, 300],
  12: [200, 300],
  14: [300],
  16: [300],
};

const PREFIXO: Record<SecaoPoste, string> = { circular: "C", duploT: "DT" };
const NOME_SECAO: Record<SecaoPoste, string> = { circular: "circular", duploT: "duplo T" };

function montar(secao: SecaoPoste, tabela: Record<number, number[]>): TipoPoste[] {
  const out: TipoPoste[] = [];
  for (const alturaStr of Object.keys(tabela)) {
    const alturaM = Number(alturaStr);
    for (const cargaDaN of tabela[alturaM]) {
      out.push({
        codigo: `${PREFIXO[secao]}-${alturaM}/${cargaDaN}`,
        secao,
        alturaM,
        cargaDaN,
        rotulo: `${alturaM} m · ${cargaDaN} daN · ${NOME_SECAO[secao]}`,
      });
    }
  }
  return out;
}

/** Catálogo completo (circular + duplo T). */
export const CATALOGO_POSTES: TipoPoste[] = [
  ...montar("circular", CIRCULAR),
  ...montar("duploT", DUPLO_T),
];

// Defaults do piloto (rural / rede compacta MT) — confirmados com o Igor.
export const POSTE_SECAO_PADRAO: SecaoPoste = "circular";
export const POSTE_ALTURA_PADRAO = 11;
/** Código do poste padrão (11 m / 400 daN circular). */
export const POSTE_PADRAO = `${PREFIXO[POSTE_SECAO_PADRAO]}-${POSTE_ALTURA_PADRAO}/400`;

export function acharPoste(codigo: string | undefined | null): TipoPoste | undefined {
  if (!codigo) return undefined;
  return CATALOGO_POSTES.find((p) => p.codigo === codigo);
}

/** Alturas disponíveis para uma seção (crescente). */
export function alturasDe(secao: SecaoPoste): number[] {
  return [...new Set(CATALOGO_POSTES.filter((p) => p.secao === secao).map((p) => p.alturaM))].sort(
    (a, b) => a - b,
  );
}

/** Cargas disponíveis para uma seção + altura (crescente). */
export function cargasDe(secao: SecaoPoste, alturaM: number): number[] {
  return CATALOGO_POSTES.filter((p) => p.secao === secao && p.alturaM === alturaM)
    .map((p) => p.cargaDaN)
    .sort((a, b) => a - b);
}

/** Capacidade (daN) de um código de poste, se conhecido. */
export function capacidadeDoPoste(codigo: string | undefined | null): number | undefined {
  return acharPoste(codigo)?.cargaDaN;
}

export interface SugestaoPoste {
  tipo: TipoPoste;
  /** `false` = nem o maior poste desta altura/seção aguenta o esforço (precisa estai/subir altura). */
  aguenta: boolean;
}

/**
 * Menor poste (na altura/seção dadas) cuja carga ≥ esforço. Se nenhum aguenta,
 * devolve o de MAIOR carga com `aguenta:false` (o estai/subida de altura resolve).
 * Default: 11 m circular (piloto).
 */
export function sugerirPoste(
  esforcoDaN: number,
  opcoes: { secao?: SecaoPoste; alturaM?: number } = {},
): SugestaoPoste {
  const secao = opcoes.secao ?? POSTE_SECAO_PADRAO;
  const alturaM = opcoes.alturaM ?? POSTE_ALTURA_PADRAO;
  const candidatos = CATALOGO_POSTES.filter((p) => p.secao === secao && p.alturaM === alturaM).sort(
    (a, b) => a.cargaDaN - b.cargaDaN,
  );
  // Fallback defensivo (altura/seção sem entradas): usa o padrão.
  const lista = candidatos.length ? candidatos : [acharPoste(POSTE_PADRAO)!];
  const cobre = lista.find((p) => p.cargaDaN >= esforcoDaN - 1e-6);
  return cobre ? { tipo: cobre, aguenta: true } : { tipo: lista[lista.length - 1], aguenta: false };
}
