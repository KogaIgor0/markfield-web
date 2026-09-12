import { novoId } from "./ids";
import type { LatLng, Ponto, Projeto, TipoPonto, Trecho } from "./model";

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

/**
 * Move um ponto para uma nova coordenada (arraste ou digitação exata) e leva
 * junto as pontas dos trechos ligados a ele (a rede não "descola" do poste).
 */
export function moverPonto(projeto: Projeto, id: string, wgs84: LatLng): Projeto {
  const pontos = projeto.pontos.map((p) => (p.id === id ? { ...p, wgs84 } : p));
  const trechos = projeto.trechos.map((t) => {
    if (!t.caminho || (t.dePontoId !== id && t.aPontoId !== id)) return t;
    const caminho = [...t.caminho];
    if (t.dePontoId === id) caminho[0] = { ...wgs84 };
    if (t.aPontoId === id) caminho[caminho.length - 1] = { ...wgs84 };
    return { ...t, caminho };
  });
  return tocar({ ...projeto, pontos, trechos });
}

/** Campos editáveis de um ponto pela UI. */
export type PatchPonto = Partial<
  Pick<
    Ponto,
    | "numero"
    | "tipo"
    | "observacao"
    | "capacidadeDaN"
    | "posteTipo"
    | "estruturaManual"
    | "estais"
    // legados (E-01): aceitos só para LIMPAR ao migrar para `estais`.
    | "estaiInstalado"
    | "estaiAzimuteManual"
  >
>;

/** Edita atributos de um ponto (tipo, número, observação). */
export function editarPonto(projeto: Projeto, id: string, patch: PatchPonto): Projeto {
  const pontos = projeto.pontos.map((p) => (p.id === id ? { ...p, ...patch } : p));
  return tocar({ ...projeto, pontos });
}

/** Remove um ponto e os trechos ligados a ele (não deixa rede órfã). */
export function removerPonto(projeto: Projeto, id: string): Projeto {
  return tocar({
    ...projeto,
    pontos: projeto.pontos.filter((p) => p.id !== id),
    trechos: projeto.trechos.filter((t) => t.dePontoId !== id && t.aPontoId !== id),
  });
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

/**
 * Marca (ou desmarca) um poste como a **fonte** da rede — só um por projeto.
 * Alternar num poste que já é fonte remove a marcação.
 */
export function definirFonte(projeto: Projeto, id: string): Projeto {
  const jaEra = projeto.pontos.find((p) => p.id === id)?.ehFonte;
  const pontos = projeto.pontos.map((p) => ({
    ...p,
    ehFonte: p.id === id && !jaEra ? true : undefined,
  }));
  return tocar({ ...projeto, pontos });
}

/**
 * Cabo herdado (E-03): pega o `tipoCabo` de um trecho já ligado ao poste, pra o
 * trecho novo continuar o mesmo cabo. `undefined` = nenhum incidente define cabo
 * → cai no padrão do piloto (A35P).
 */
export function caboHerdado(projeto: Projeto, pontoId: string): string | undefined {
  const comCabo = projeto.trechos.find(
    (t) => (t.dePontoId === pontoId || t.aPontoId === pontoId) && t.tipoCabo,
  );
  return comCabo?.tipoCabo;
}

/**
 * Liga dois postes com um trecho de rede. O caminho nasce das coordenadas
 * exatas dos postes (snap natural) e o trecho guarda os ids das pontas, então
 * ele acompanha os postes quando eles se movem. Herda o cabo do lado da fonte.
 */
export function adicionarTrecho(
  projeto: Projeto,
  dePontoId: string,
  aPontoId: string,
): { projeto: Projeto; id: string } {
  const de = projeto.pontos.find((p) => p.id === dePontoId);
  const a = projeto.pontos.find((p) => p.id === aPontoId);
  if (!de || !a || dePontoId === aPontoId) return { projeto, id: "" };
  const id = novoId("tr");
  const trecho: Trecho = {
    id,
    classe: "indefinida",
    estilo: "rede",
    dePontoId,
    aPontoId,
    caminho: [{ ...de.wgs84 }, { ...a.wgs84 }],
    tipoCabo: caboHerdado(projeto, dePontoId) ?? caboHerdado(projeto, aPontoId),
    origem: "web",
  };
  return { projeto: tocar({ ...projeto, trechos: [...projeto.trechos, trecho] }), id };
}

/** Remove um trecho. */
export function removerTrecho(projeto: Projeto, id: string): Projeto {
  return tocar({ ...projeto, trechos: projeto.trechos.filter((t) => t.id !== id) });
}

export type PatchTrecho = Partial<
  Pick<Trecho, "classe" | "observacao" | "tipoCabo" | "tracaoReduzida">
>;

/** Edita atributos de um trecho (classe elétrica, observação). */
export function editarTrecho(projeto: Projeto, id: string, patch: PatchTrecho): Projeto {
  const trechos = projeto.trechos.map((t) => (t.id === id ? { ...t, ...patch } : t));
  return tocar({ ...projeto, trechos });
}

/** Acha um trecho pelo id. */
export function acharTrecho(projeto: Projeto, id: string | null | undefined): Trecho | undefined {
  if (!id) return undefined;
  return projeto.trechos.find((t) => t.id === id);
}
