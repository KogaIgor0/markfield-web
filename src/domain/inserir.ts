import { novoId } from "./ids";
import { deUtm, paraUtm } from "../geo/utm";
import { normalizarAzimute } from "./esforco";
import type { LatLng, Ponto, Projeto, Trecho } from "./model";

/**
 * Inserir ponto medido no alinhamento da rede (E-04).
 *
 * Pedido do Igor: "sair de um poste **referência** e ir **sentido carga por 30 m**".
 * Duas geometrias, ambas exatas em UTM (métrico):
 *
 *  - **Estender:** cria um poste a `d` metros do referência num azimute (a ponta
 *    da linha "anda" pra fora) e liga referência → novo. Usado quando o poste é
 *    ponta de rede (fim) ou quando o projetista dá um azimute livre.
 *  - **Inserir no vão:** o poste novo cai SOBRE o segmento referência→vizinho, a
 *    `d` metros do referência (subdivide aquele vão em dois). Usado quando se
 *    quer um poste no meio de um lance existente.
 *
 * "Sentido carga" = a jusante, afastando da fonte. A rota do B1 (`rede.ts`) numera
 * os postes por ordem a partir da fonte; então o vizinho com **ordem maior** que o
 * referência é o lado da carga (ver `direcoesDePonto`).
 *
 * Tudo imutável: cada função devolve um NOVO projeto.
 */

function tocar(p: Projeto): Projeto {
  return { ...p, meta: { ...p.meta, atualizadoEm: new Date().toISOString() } };
}

function proximoNumero(projeto: Projeto): string {
  const max = projeto.pontos.reduce((m, p) => {
    const n = Number(p.numero);
    return Number.isFinite(n) && n > m ? n : m;
  }, 0);
  return String(max + 1);
}

/** Distância no plano UTM (m) entre duas coordenadas. */
export function distanciaM(a: LatLng, b: LatLng): number {
  const ua = paraUtm(a);
  const ub = paraUtm(b);
  return Math.hypot(ub.easting - ua.easting, ub.northing - ua.northing);
}

/** Azimute (° 0=N, horário) de A para B, em UTM (x=Este, y=Norte). */
export function azimuteEntre(a: LatLng, b: LatLng): number {
  const ua = paraUtm(a);
  const ub = paraUtm(b);
  return normalizarAzimute((Math.atan2(ub.easting - ua.easting, ub.northing - ua.northing) * 180) / Math.PI);
}

export interface ResultadoInsercao {
  projeto: Projeto;
  /** Id do poste criado (para a UI selecionar/enquadrar). */
  id: string;
}
export type SaidaInsercao = ResultadoInsercao | { erro: string };

export function ehErro(s: SaidaInsercao): s is { erro: string } {
  return (s as { erro?: string }).erro !== undefined;
}

/** Atributos herdados para o trecho novo (classe/cabo — E-03). */
export interface ModeloTrecho {
  classe?: Trecho["classe"];
  estilo?: Trecho["estilo"];
  tipoCabo?: string;
}

/**
 * Estende a rede a partir de `refId` num azimute por `distanciaM` metros: cria um
 * poste na ponta e liga referência → novo.
 */
export function estenderPonto(
  projeto: Projeto,
  refId: string,
  azimuteGraus: number,
  distancia: number,
  modelo: ModeloTrecho = {},
): SaidaInsercao {
  const R = projeto.pontos.find((p) => p.id === refId);
  if (!R) return { erro: "Poste de referência não encontrado." };
  if (!(distancia > 0)) return { erro: "Informe uma distância maior que zero." };

  const ur = paraUtm(R.wgs84);
  const rad = (azimuteGraus * Math.PI) / 180;
  const novoW = deUtm({
    easting: ur.easting + Math.sin(rad) * distancia, // x = Este
    northing: ur.northing + Math.cos(rad) * distancia, // y = Norte
    zone: ur.zone,
    hemisphere: ur.hemisphere,
  });

  const id = novoId("pt");
  const ponto: Ponto = {
    id,
    tipo: "postePropostoo",
    numero: proximoNumero(projeto),
    wgs84: novoW,
    origem: "web",
  };
  const trecho: Trecho = {
    id: novoId("tr"),
    classe: modelo.classe ?? "indefinida",
    estilo: modelo.estilo ?? "rede",
    dePontoId: refId,
    aPontoId: id,
    caminho: [{ ...R.wgs84 }, { ...novoW }],
    tipoCabo: modelo.tipoCabo,
    origem: "web",
  };
  return {
    projeto: tocar({
      ...projeto,
      pontos: [...projeto.pontos, ponto],
      trechos: [...projeto.trechos, trecho],
    }),
    id,
  };
}

/**
 * Insere um poste no vão entre `refId` e `vizinhoId`, a `distanciaM` metros de
 * `refId` (subdivide aquele trecho em dois). Herdam classe/estilo do trecho.
 */
export function inserirNoVao(
  projeto: Projeto,
  refId: string,
  vizinhoId: string,
  distancia: number,
): SaidaInsercao {
  const R = projeto.pontos.find((p) => p.id === refId);
  const V = projeto.pontos.find((p) => p.id === vizinhoId);
  if (!R || !V) return { erro: "Poste de referência ou vizinho não encontrado." };
  if (!(distancia > 0)) return { erro: "Informe uma distância maior que zero." };

  const t = projeto.trechos.find(
    (x) =>
      (x.dePontoId === refId && x.aPontoId === vizinhoId) ||
      (x.dePontoId === vizinhoId && x.aPontoId === refId),
  );
  if (!t) return { erro: "Não há um vão ligando esses dois postes." };

  const ur = paraUtm(R.wgs84);
  const uv = paraUtm(V.wgs84);
  const L = Math.hypot(uv.easting - ur.easting, uv.northing - ur.northing);
  if (distancia >= L) {
    return {
      erro: `A distância (${distancia} m) passa do próximo poste — P${
        V.numero ?? "?"
      } está a ${L.toFixed(0)} m. Reduza a distância ou escolha outra direção.`,
    };
  }

  const f = distancia / L;
  const novoW = deUtm({
    easting: ur.easting + (uv.easting - ur.easting) * f,
    northing: ur.northing + (uv.northing - ur.northing) * f,
    zone: ur.zone,
    hemisphere: ur.hemisphere,
  });

  const id = novoId("pt");
  const ponto: Ponto = {
    id,
    tipo: "postePropostoo",
    numero: proximoNumero(projeto),
    wgs84: novoW,
    origem: "web",
  };
  // Substitui o trecho R–V por R–novo e novo–V, preservando os atributos.
  const tA: Trecho = {
    id: novoId("tr"),
    classe: t.classe,
    estilo: t.estilo ?? "rede",
    dePontoId: refId,
    aPontoId: id,
    caminho: [{ ...R.wgs84 }, { ...novoW }],
    tipoCabo: t.tipoCabo,
    origem: t.origem,
    observacao: t.observacao,
  };
  const tB: Trecho = {
    id: novoId("tr"),
    classe: t.classe,
    estilo: t.estilo ?? "rede",
    dePontoId: id,
    aPontoId: vizinhoId,
    caminho: [{ ...novoW }, { ...V.wgs84 }],
    tipoCabo: t.tipoCabo,
    origem: t.origem,
    observacao: t.observacao,
  };
  return {
    projeto: tocar({
      ...projeto,
      pontos: [...projeto.pontos, ponto],
      trechos: [...projeto.trechos.filter((x) => x.id !== t.id), tA, tB],
    }),
    id,
  };
}

// --------------------------------------------------------------------------
// Resolução de direções (para a UI montar as opções)
// --------------------------------------------------------------------------

export interface DirecaoVizinho {
  vizinhoId: string;
  numero?: string;
  trechoId: string;
  /** Azimute referência → vizinho (° 0=N, horário). */
  azimuteGraus: number;
  /** Comprimento do vão referência–vizinho (m). */
  comprimentoM: number;
  /** Lado na rede: carga (a jusante), fonte (a montante) ou lateral (sem rota). */
  sentido: "carga" | "fonte" | "lateral";
}

export interface DirecoesPonto {
  refId: string;
  vizinhos: DirecaoVizinho[];
  /**
   * Azimute para **estender a linha no sentido carga** quando o poste é uma
   * ponta (1 vizinho a montante): continua a reta pra fora, afastando da rede.
   */
  estenderCargaAzimute?: number;
}

/**
 * Direções possíveis a partir de `refId`, usando a ordem da rota (B1) para saber
 * qual lado é a carga. `ordemPorId` vem de `modelarRede().postes` (campo `ordem`).
 */
export function direcoesDePonto(
  projeto: Projeto,
  refId: string,
  ordemPorId: Map<string, number | undefined>,
): DirecoesPonto {
  const porId = new Map(projeto.pontos.map((p) => [p.id, p]));
  const R = porId.get(refId);
  if (!R) return { refId, vizinhos: [] };

  const vizinhos: DirecaoVizinho[] = [];
  for (const t of projeto.trechos) {
    if (!t.dePontoId || !t.aPontoId) continue;
    let vId: string | undefined;
    if (t.dePontoId === refId) vId = t.aPontoId;
    else if (t.aPontoId === refId) vId = t.dePontoId;
    if (!vId) continue;
    const V = porId.get(vId);
    if (!V) continue;

    const oR = ordemPorId.get(refId);
    const oV = ordemPorId.get(vId);
    let sentido: DirecaoVizinho["sentido"] = "lateral";
    if (oR != null && oV != null) sentido = oV > oR ? "carga" : oV < oR ? "fonte" : "lateral";

    vizinhos.push({
      vizinhoId: vId,
      numero: V.numero,
      trechoId: t.id,
      azimuteGraus: azimuteEntre(R.wgs84, V.wgs84),
      comprimentoM: distanciaM(R.wgs84, V.wgs84),
      sentido,
    });
  }

  let estenderCargaAzimute: number | undefined;
  if (vizinhos.length === 1 && vizinhos[0].sentido !== "carga") {
    // Ponta de rede: continua a linha pra fora (oposto ao único vizinho) = carga.
    estenderCargaAzimute = normalizarAzimute(vizinhos[0].azimuteGraus + 180);
  }

  return { refId, vizinhos, estenderCargaAzimute };
}
