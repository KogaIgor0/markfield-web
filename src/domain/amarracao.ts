import type { Projeto } from "./model";
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

/**
 * Lances retos acima de 500 m sem amarração. `codigos` e `rede` vêm do B3/B1.
 */
export function validarAmarracao(
  projeto: Projeto,
  codigos: Map<string, EstruturaAtribuida>,
  rede: RedeModelada,
): LanceLongo[] {
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

  const lances: LanceLongo[] = [];
  const vistos = new Set<string>();
  for (const p of projeto.pontos) {
    if (!amarra(p.id)) continue; // começa em cada amarração
    for (const viz of adj.get(p.id) ?? []) {
      // caminha o lance de postes de LINHA a partir de `viz` até a próxima amarração
      let prev = p.id;
      let cur = viz;
      const a = porId.get(prev)!;
      const b0 = porId.get(cur);
      if (!b0) continue;
      let comp = distanciaM(a.wgs84, b0.wgs84);
      let guarda = 0;
      while (!amarra(cur) && guarda++ < 100000) {
        const prox = [...(adj.get(cur) ?? [])].find((v) => v !== prev);
        if (!prox) break;
        const c1 = porId.get(cur)!;
        const c2 = porId.get(prox)!;
        comp += distanciaM(c1.wgs84, c2.wgs84);
        prev = cur;
        cur = prox;
      }
      if (amarra(cur) && cur !== p.id) {
        const chave = [p.id, cur].sort().join("|");
        if (!vistos.has(chave)) {
          vistos.add(chave);
          if (comp > LANCE_MAX_AMARRACAO_M + 1e-6) {
            lances.push({ deId: p.id, ateId: cur, comprimentoM: comp });
          }
        }
      }
    }
  }
  return lances;
}
