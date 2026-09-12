import type { Projeto } from "./model";
import type { EstruturaAtribuida } from "./estrutura";
import type { RedeEsforcos } from "./esforco";
import { comprimentoTrechoM } from "./vaos";
import { acharCabo, CABO_PADRAO } from "./cabos";

/**
 * Quantitativo do projeto (B5, v1) — números que o sistema deriva sozinho do
 * modelo/geometria. **Não é a lista de peças por estrutura** (essa vem da ND.01
 * / DIS-NOR-013, a transcrever depois — não inventamos). Aqui contamos o que dá
 * pra contar com certeza: estruturas por código, cabo por comprimento,
 * espaçadores (estimados pela regra de 7–10 m), estais, para-raios e estribos.
 *
 * Espaçadores: DIS-NOR-013 6.17.10 pede um a cada 7–10 m; o Quadro 6 dá a
 * quantidade exata por faixa de vão. Sem esse quadro transcrito, estimamos
 * ~1 a cada **9 m** por vão (marcado como estimado) — refinar com o Quadro 6.
 */

/** Intervalo médio usado pra estimar espaçadores (m) — meio de 7–10. */
export const ESPACADOR_INTERVALO_M = 9;

export interface CaboQuant {
  codigo: string;
  rotulo: string;
  comprimentoM: number;
  /** Tração ainda provisória (cabo não-A35P). */
  provisorio: boolean;
}

export interface ResumoMateriais {
  postes: number;
  trechos: number;
  comprimentoRedeM: number;
  estruturas: { codigo: string; n: number }[];
  cabos: CaboQuant[];
  /** Espaçadores estimados (~1 a cada 9 m por vão). */
  espacadores: number;
  espacadoresEstimado: boolean;
  /** Estais instalados (cada um pede 1 isolador de estai — DIS-NOR-012 6.5.16). */
  estais: number;
  /** Postes com para-raios (sufixo PR na estrutura). */
  pararaios: number;
  /** Estribos de espera sugeridos (6.15.2) — passado de fora (proporEstribos). */
  estribos: number;
}

/** Espaçadores estimados de UM vão de comprimento L (m). */
export function espacadoresDoVao(comprimentoM: number): number {
  if (comprimentoM <= 0) return 0;
  return Math.max(1, Math.round(comprimentoM / ESPACADOR_INTERVALO_M));
}

export function resumoMateriais(
  projeto: Projeto,
  estruturas: Map<string, EstruturaAtribuida>,
  esforcos: RedeEsforcos | null,
  estribos: number,
): ResumoMateriais {
  // Estruturas por código.
  const porCodigo = new Map<string, number>();
  let pararaios = 0;
  for (const e of estruturas.values()) {
    if (!e.codigo) continue;
    porCodigo.set(e.codigo, (porCodigo.get(e.codigo) ?? 0) + 1);
    if (/PR/.test(e.codigo)) pararaios++;
  }

  // Cabo por comprimento + espaçadores + comprimento total.
  const porCabo = new Map<string, number>();
  let comprimentoRedeM = 0;
  let espacadores = 0;
  for (const t of projeto.trechos) {
    const L = comprimentoTrechoM(projeto, t);
    if (L == null) continue;
    comprimentoRedeM += L;
    espacadores += espacadoresDoVao(L);
    const cod = t.tipoCabo ?? CABO_PADRAO;
    porCabo.set(cod, (porCabo.get(cod) ?? 0) + L);
  }

  const cabos: CaboQuant[] = [...porCabo.entries()].map(([codigo, comprimentoM]) => {
    const c = acharCabo(codigo);
    return { codigo, rotulo: c.rotulo, comprimentoM, provisorio: !c.tracaoConfirmada };
  });

  // Estais instalados (soma na rede).
  let estais = 0;
  if (esforcos) for (const e of esforcos.postes.values()) estais += e.estais.length;

  return {
    postes: projeto.pontos.length,
    trechos: projeto.trechos.filter((t) => t.dePontoId && t.aPontoId).length,
    comprimentoRedeM,
    estruturas: [...porCodigo.entries()].map(([codigo, n]) => ({ codigo, n })).sort((a, b) => a.codigo.localeCompare(b.codigo)),
    cabos: cabos.sort((a, b) => a.codigo.localeCompare(b.codigo)),
    espacadores,
    espacadoresEstimado: true,
    estais,
    pararaios,
    estribos,
  };
}
