import type { Foto, LatLng, Ponto, Projeto } from "./model";
import { paraUtm } from "../geo/utm";

/**
 * Merge de dois projetos `.mkf` (Nível 2 da conexão APP↔Web).
 *
 * Caso de uso (Igor): projetos grandes divididos entre equipes/dias. A equipe 1
 * levanta um trecho, a equipe 2 outro; o escritório junta os dois `.mkf` num só
 * projeto. Há dois jeitos de os arquivos chegarem, e o merge trata ambos:
 *
 *  1) **IDs compartilhados** — a equipe 2 CONTINUOU o arquivo da equipe 1 (o
 *     `.mkf` preserva os ids). O arquivo que chega é um superconjunto: os
 *     elementos com id já presente na base são os MESMOS; só entram os que a
 *     equipe 2 adicionou (id inédito). Nada é duplicado.
 *  2) **IDs disjuntos** — as duas equipes começaram do zero (ids UUID não
 *     colidem). Tudo do arquivo que chega entra. O poste de EMENDA (o mesmo
 *     poste físico capturado pelas duas) aparece duas vezes, quase na mesma
 *     coordenada → detectamos por PROXIMIDADE e reportamos pro projetista
 *     decidir (não apagamos nada por conta própria).
 *
 * A identidade é o `id`. É por isso que o `.mkf` guardar ids estáveis (D-03) é o
 * que torna o merge confiável: sem isso, não dá pra saber o que é o mesmo poste.
 */

/** Tolerância padrão (m) para sinalizar dois postes como possível emenda/duplicata. */
export const TOL_DUPLICATA_M = 3;

/** Um par de postes muito próximos entre base e arquivo que chega (possível emenda). */
export interface DuplicataProxima {
  /** Id do poste que chegou (no arquivo mesclado). */
  idNovo: string;
  numeroNovo?: string;
  /** Id do poste da base mais próximo. */
  idBase: string;
  numeroBase?: string;
  /** Distância entre eles (m). */
  distanciaM: number;
}

export interface RelatorioMerge {
  /** Nome do projeto que chegou. */
  nomeIncorporado?: string;
  pontosAdicionados: number;
  trechosAdicionados: number;
  linhasAdicionadas: number;
  fotosAdicionadas: number;
  referenciasAdicionadas: number;
  /** Elementos com id já presente na base (equipe continuou o mesmo arquivo). */
  compartilhados: number;
  /** Fotos renomeadas por conflito de nome-base ("Foto1" já existia). */
  fotosRenomeadas: number;
  /** Postes próximos demais entre base e novo — possível emenda a revisar. */
  duplicadasProximas: DuplicataProxima[];
}

export interface ResultadoMerge {
  projeto: Projeto;
  /** Blobs de imagem já unificados (base + novos), indexados por nome-base. */
  imagens: Map<string, Uint8Array>;
  relatorio: RelatorioMerge;
}

export interface OpcoesMerge {
  /** Tolerância de proximidade (m) para sinalizar emenda/duplicata. */
  tolDuplicataM?: number;
  /** Blobs da base e do arquivo que chega, para unificar as imagens. */
  imagensBase?: Map<string, Uint8Array>;
  imagensNovo?: Map<string, Uint8Array>;
}

/** Distância planar entre duas coordenadas, em metros (via UTM SIRGAS 2000). */
function distanciaM(a: LatLng, b: LatLng): number {
  const ua = paraUtm(a);
  const ub = paraUtm(b);
  return Math.hypot(ua.easting - ub.easting, ua.northing - ub.northing);
}

/** Nome-base livre: se "Foto1" já existe, tenta "Foto1_2", "Foto1_3"… */
function nomeLivre(nome: string, usados: Set<string>): string {
  if (!usados.has(nome)) return nome;
  for (let i = 2; ; i++) {
    const cand = `${nome}_${i}`;
    if (!usados.has(cand)) return cand;
  }
}

/**
 * Mescla `novo` dentro de `base`, devolvendo um projeto novo (imutável) e um
 * relatório do que entrou. Identidade por `id`: só entram elementos com id que a
 * base ainda não tem. Postes muito próximos (possível emenda) são reportados,
 * não removidos.
 */
export function mesclarProjetos(
  base: Projeto,
  novo: Projeto,
  opcoes: OpcoesMerge = {},
): ResultadoMerge {
  const tol = opcoes.tolDuplicataM ?? TOL_DUPLICATA_M;

  const idsPontos = new Set(base.pontos.map((p) => p.id));
  const idsTrechos = new Set(base.trechos.map((t) => t.id));
  const idsLinhas = new Set(base.linhasLivres.map((l) => l.id));
  const idsFotos = new Set(base.fotos.map((f) => f.id));
  const idsRefs = new Set(base.referencias.map((r) => r.id));

  let compartilhados = 0;

  // Pontos inéditos.
  const pontosNovos: Ponto[] = [];
  for (const p of novo.pontos) {
    if (idsPontos.has(p.id)) {
      compartilhados++;
      continue;
    }
    pontosNovos.push(p);
  }

  // Trechos inéditos. Mantém a referência de pontos: as pontas ou já estão na
  // base (id compartilhado) ou vieram nos pontos inéditos acima.
  const trechosNovos = novo.trechos.filter((t) => !idsTrechos.has(t.id));
  const linhasNovas = novo.linhasLivres.filter((l) => !idsLinhas.has(l.id));
  const refsNovas = novo.referencias.filter((r) => !idsRefs.has(r.id));

  // Fotos inéditas — resolvendo conflito de nome-base (as duas equipes podem ter
  // "Foto1"). Guardamos o remapeamento pra reindexar os blobs.
  const nomesUsados = new Set<string>();
  for (const f of base.fotos) if (f.nome) nomesUsados.add(f.nome);
  const renomeadas = new Map<string, string>(); // nomeAntigo → nomeNovo
  const fotosNovas: Foto[] = [];
  let fotosRenomeadas = 0;
  for (const f of novo.fotos) {
    if (idsFotos.has(f.id)) {
      compartilhados++;
      continue;
    }
    let foto = f;
    if (f.nome) {
      const novoNome = nomeLivre(f.nome, nomesUsados);
      nomesUsados.add(novoNome);
      if (novoNome !== f.nome) {
        renomeadas.set(f.nome, novoNome);
        fotosRenomeadas++;
        foto = { ...f, nome: novoNome, arquivo: `fotos/${novoNome}.jpg` };
      }
    }
    fotosNovas.push(foto);
  }

  // Detecção de emenda/duplicata: para cada poste inédito, o poste da base mais
  // próximo dentro da tolerância.
  const duplicadasProximas: DuplicataProxima[] = [];
  for (const p of pontosNovos) {
    let melhor: { pb: Ponto; d: number } | null = null;
    for (const pb of base.pontos) {
      const d = distanciaM(p.wgs84, pb.wgs84);
      if (d <= tol && (!melhor || d < melhor.d)) melhor = { pb, d };
    }
    if (melhor) {
      duplicadasProximas.push({
        idNovo: p.id,
        numeroNovo: p.numero,
        idBase: melhor.pb.id,
        numeroBase: melhor.pb.numero,
        distanciaM: melhor.d,
      });
    }
  }

  const projeto: Projeto = {
    ...base,
    meta: { ...base.meta, atualizadoEm: new Date().toISOString() },
    pontos: [...base.pontos, ...pontosNovos],
    trechos: [...base.trechos, ...trechosNovos],
    linhasLivres: [...base.linhasLivres, ...linhasNovas],
    fotos: [...base.fotos, ...fotosNovas],
    referencias: [...base.referencias, ...refsNovas],
  };

  // Imagens: base + novas, reindexando as fotos renomeadas.
  const imagens = new Map<string, Uint8Array>(opcoes.imagensBase ?? []);
  if (opcoes.imagensNovo) {
    for (const [nome, bytes] of opcoes.imagensNovo) {
      const destino = renomeadas.get(nome) ?? nome;
      // não sobrescreve um blob da base com nome igual (já garantido por nomeLivre,
      // mas mantém a rede de segurança).
      if (!imagens.has(destino)) imagens.set(destino, bytes);
    }
  }

  return {
    projeto,
    imagens,
    relatorio: {
      nomeIncorporado: novo.meta?.nome,
      pontosAdicionados: pontosNovos.length,
      trechosAdicionados: trechosNovos.length,
      linhasAdicionadas: linhasNovas.length,
      fotosAdicionadas: fotosNovas.length,
      referenciasAdicionadas: refsNovas.length,
      compartilhados,
      fotosRenomeadas,
      duplicadasProximas,
    },
  };
}
