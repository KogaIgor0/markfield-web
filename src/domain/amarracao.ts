import type { Ponto, Projeto } from "./model";
import type { EstruturaAtribuida } from "./estrutura";
import type { RedeModelada } from "./rede";
import { distanciaM } from "./vaos";

/**
 * Validação de amarração (B4 / norma) — DIS-NOR-013 §6.17.3:
 * "não pode haver lance superior a 500 m sem amarração do cabo mensageiro".
 *
 * A amarração é feita por estruturas de **encabeçamento/ancoragem** (CE3, CE4,
 * CE3-CE3, CE3TR) e, naturalmente, por fins de linha / derivações / fonte. Aqui
 * percorremos cada **lance reto** (sequência de postes de linha CE1/CE2 entre
 * duas amarrações) e sinalizamos os que passam de 500 m — sugerindo inserir uma
 * **CE4**. O projetista resolve forçando CE4 (override) onde achar melhor
 * (ex.: numa travessia), o que quebra o lance e tira o aviso.
 */

export const LANCE_MAX_AMARRACAO_M = 500;

const CODIGOS_AMARRACAO = ["CE3", "CE4", "CE3-CE3", "CE3TR"];

/** Um poste "amarra" se é encabeçamento/ancoragem ou não é poste de linha (grau≠2). */
function ehAmarracao(codigo: string, grau: number): boolean {
  if (grau !== 2) return true; // fim, derivação, fonte, trafo
  return CODIGOS_AMARRACAO.some((c) => codigo.startsWith(c));
}

export interface LanceLongo {
  deId: string;
  ateId: string;
  comprimentoM: number;
}

/** Um poste do lance com a distância acumulada desde a amarração de início. */
interface NoLance {
  id: string;
  acc: number;
}

/** Adjacência + a função `amarra` (compartilhado por validar/propor). */
function contexto(
  projeto: Projeto,
  codigos: Map<string, EstruturaAtribuida>,
  rede: RedeModelada,
) {
  const porId = new Map(projeto.pontos.map((p) => [p.id, p]));
  const adj = new Map<string, Set<string>>();
  for (const p of projeto.pontos) adj.set(p.id, new Set());
  for (const t of projeto.trechos) {
    if (t.dePontoId && t.aPontoId && adj.has(t.dePontoId) && adj.has(t.aPontoId)) {
      adj.get(t.dePontoId)!.add(t.aPontoId);
      adj.get(t.aPontoId)!.add(t.dePontoId);
    }
  }
  const amarra = (id: string): boolean => {
    const cod = codigos.get(id)?.codigo ?? "";
    const grau = rede.postes.get(id)?.grau ?? 0;
    return ehAmarracao(cod, grau);
  };
  return { porId, adj, amarra };
}

/**
 * Percorre cada lance reto (entre duas amarrações) UMA vez, devolvendo a cadeia
 * de postes com distância acumulada. Callback recebe {início, fim, cadeia, comp}.
 */
function percorrerLances(
  projeto: Projeto,
  porId: Map<string, Ponto>,
  adj: Map<string, Set<string>>,
  amarra: (id: string) => boolean,
  visitar: (deId: string, ateId: string, cadeia: NoLance[], comp: number) => void,
): void {
  const vistos = new Set<string>();
  for (const p of projeto.pontos) {
    if (!amarra(p.id)) continue;
    for (const viz of adj.get(p.id) ?? []) {
      const b0 = porId.get(viz);
      if (!b0) continue;
      const cadeia: NoLance[] = [{ id: p.id, acc: 0 }];
      let prev = p.id;
      let cur = viz;
      let acc = distanciaM(porId.get(prev)!.wgs84, b0.wgs84);
      cadeia.push({ id: cur, acc });
      let guarda = 0;
      while (!amarra(cur) && guarda++ < 100000) {
        const prox = [...(adj.get(cur) ?? [])].find((v) => v !== prev);
        if (!prox) break;
        acc += distanciaM(porId.get(cur)!.wgs84, porId.get(prox)!.wgs84);
        prev = cur;
        cur = prox;
        cadeia.push({ id: cur, acc });
      }
      if (amarra(cur) && cur !== p.id) {
        const chave = [p.id, cur].sort().join("|");
        if (!vistos.has(chave)) {
          vistos.add(chave);
          visitar(p.id, cur, cadeia, acc);
        }
      }
    }
  }
}

/**
 * Lances retos acima de 500 m sem amarração. `codigos` e `rede` vêm do B3/B1.
 */
export function validarAmarracao(
  projeto: Projeto,
  codigos: Map<string, EstruturaAtribuida>,
  rede: RedeModelada,
): LanceLongo[] {
  const { porId, adj, amarra } = contexto(projeto, codigos, rede);
  const lances: LanceLongo[] = [];
  percorrerLances(projeto, porId, adj, amarra, (deId, ateId, _cadeia, comp) => {
    if (comp > LANCE_MAX_AMARRACAO_M + 1e-6) lances.push({ deId, ateId, comprimentoM: comp });
  });
  return lances;
}

export interface SugestaoCE4 {
  pontoId: string;
  numero?: string;
  /** Posição do poste ao longo do lance (m desde a amarração de início). */
  posicaoM: number;
  /** Comprimento total do lance (m). */
  lanceComprimentoM: number;
}

/**
 * Propõe **onde colocar CE4** (E-01/A). Para cada lance > 500 m, divide-o em
 * `n = ⌈comp/500⌉` partes iguais (cada sub-lance ≤ 500 m) e sugere a CE4 no
 * **poste de linha existente mais próximo** de cada divisa — sem criar poste
 * solto. O projetista aceita (vira `estruturaManual="CE4"`), move pra outro
 * poste, ou ignora. Cada poste é sugerido no máximo uma vez.
 */
export function proporAmarracao(
  projeto: Projeto,
  codigos: Map<string, EstruturaAtribuida>,
  rede: RedeModelada,
): SugestaoCE4[] {
  const { porId, adj, amarra } = contexto(projeto, codigos, rede);
  const sugestoes: SugestaoCE4[] = [];
  const jaSugerido = new Set<string>();
  percorrerLances(projeto, porId, adj, amarra, (deId, ateId, cadeia, comp) => {
    if (comp <= LANCE_MAX_AMARRACAO_M + 1e-6) return;
    const n = Math.ceil(comp / LANCE_MAX_AMARRACAO_M);
    const passo = comp / n;
    // candidatos = postes interiores de linha (nem a amarração de início nem a de fim)
    const interiores = cadeia.filter((c) => c.id !== deId && c.id !== ateId);
    for (let k = 1; k < n; k++) {
      const alvo = k * passo;
      let melhor: { c: NoLance; d: number } | null = null;
      for (const c of interiores) {
        if (jaSugerido.has(c.id)) continue;
        const d = Math.abs(c.acc - alvo);
        if (!melhor || d < melhor.d) melhor = { c, d };
      }
      if (melhor) {
        jaSugerido.add(melhor.c.id);
        const pt = porId.get(melhor.c.id)!;
        sugestoes.push({
          pontoId: melhor.c.id,
          numero: pt.numero,
          posicaoM: melhor.c.acc,
          lanceComprimentoM: comp,
        });
      }
    }
  });
  return sugestoes;
}
