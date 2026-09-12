import type { Projeto } from "./model";
import type { RedeModelada } from "./rede";
import type { EstruturaAtribuida } from "./estrutura";

/**
 * Validadores normativos (avisos de projeto) — DIS-NOR-013.
 *
 * São checagens determinísticas: "a norma exige X aqui e falta". Mesma ideia da
 * CE4 (`amarracao.ts`): o sistema aponta, o projetista resolve. Ver
 * `markfield-normas-requisitos.md`.
 */

export interface PararaiosPendente {
  pontoId: string;
  numero?: string;
  /** Por que a norma exige para-raios neste poste. */
  motivo: string;
}

/**
 * Postes que **exigem para-raios** (DIS-NOR-013 **6.21.2**) e ainda não têm.
 *
 * v1 detecta o gatilho **fim de linha** (6.21.2 a). O **transformador** (6.21.2 d)
 * já vem coberto pela estrutura -TR (o para-raios faz parte da instalação do
 * trafo), então não é sinalizado como faltando. Os demais gatilhos (transição
 * cabo nu→protegido, chave/religador, reguladores, capacitores, medição, rede
 * rural a cada 3 km) entram quando o modelo tiver esses equipamentos.
 */
export function validarPararaios(
  projeto: Projeto,
  rede: RedeModelada,
  estruturas: Map<string, EstruturaAtribuida>,
): PararaiosPendente[] {
  const out: PararaiosPendente[] = [];
  for (const p of projeto.pontos) {
    const pm = rede.postes.get(p.id);
    if (!pm) continue;
    if (pm.papel !== "fim") continue; // gatilho v1: fim de linha
    const cod = estruturas.get(p.id)?.codigo ?? "";
    // já coberto se a estrutura traz para-raios (PR) ou transformador (TR = inclui DPS)
    if (/PR/.test(cod) || /TR/.test(cod)) continue;
    out.push({ pontoId: p.id, numero: p.numero, motivo: "fim de linha" });
  }
  return out;
}
