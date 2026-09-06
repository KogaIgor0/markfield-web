import { novoId } from "./ids";
import type { LatLng, Ponto, Projeto, TipoPonto } from "./model";

/**
 * Motor de edição — Fase 2.
 *
 * Operações puras e imutáveis sobre o Projeto: cada uma devolve um NOVO projeto,
 * sem mutar o anterior (base para undo/redo futuro e para o React reconciliar).
 * A UI e o mapa só chamam estas funções; a lógica de "o que muda" mora aqui.
 */

/** Carimba `atualizadoEm` a cada mudança. */
function tocar(p: Projeto): Projeto {
  return { ...p, meta: { ...p.meta, atualizadoEm: new Date().toISOString() } };
}

/** Move um ponto para uma nova coordenada (arraste ou digitação exata). */
export function moverPonto(projeto: Projeto, id: string, wgs84: LatLng): Projeto {
  const pontos = projeto.pontos.map((p) => (p.id === id ? { ...p, wgs84 } : p));
  return tocar({ ...projeto, pontos });
}

/** Campos editáveis de um ponto pela UI. */
export type PatchPonto = Partial<Pick<Ponto, "numero" | "tipo" | "observacao">>;

/** Edita atributos de um ponto (tipo, número, observação). */
export function editarPonto(projeto: Projeto, id: string, patch: PatchPonto): Projeto {
  const pontos = projeto.pontos.map((p) => (p.id === id ? { ...p, ...patch } : p));
  return tocar({ ...projeto, pontos });
}

/** Remove um ponto. */
export function removerPonto(projeto: Projeto, id: string): Projeto {
  return tocar({ ...projeto, pontos: projeto.pontos.filter((p) => p.id !== id) });
}

/** Próximo número sugerido (maior número existente + 1). */
export function proximoNumero(projeto: Projeto): string {
  const max = projeto.pontos.reduce((m, p) => {
    const n = Number(p.numero);
    return Number.isFinite(n) && n > m ? n : m;
  }, 0);
  return String(max + 1);
}

/**
 * Adiciona um ponto criado no Web (origem "web"). Devolve o projeto novo e o id
 * do ponto criado, para a UI já selecioná-lo.
 */
export function adicionarPonto(
  projeto: Projeto,
  tipo: TipoPonto,
  wgs84: LatLng,
): { projeto: Projeto; id: string } {
  const id = novoId("pt");
  const ponto: Ponto = { id, tipo, numero: proximoNumero(projeto), wgs84, origem: "web" };
  return { projeto: tocar({ ...projeto, pontos: [...projeto.pontos, ponto] }), id };
}

/** Acha um ponto pelo id (conveniência para a UI). */
export function acharPonto(projeto: Projeto, id: string | null | undefined): Ponto | undefined {
  if (!id) return undefined;
  return projeto.pontos.find((p) => p.id === id);
}
