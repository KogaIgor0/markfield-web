import { novoId } from "./ids";
import { deUtm, paraUtm } from "../geo/utm";
import type { LatLng, Projeto, Trecho } from "./model";

/**
 * Divisão de vãos (B2 / T2).
 *
 * A rede que vem do campo tem postes só nos pontos que o projetista marcou
 * (fonte, ângulos, obstáculos, trafo). Entre eles o vão pode passar do máximo
 * da norma. Aqui inserimos **postes intermediários** igualmente espaçados para
 * nenhum vão passar do limite — é o passo que "posta" a rede.
 *
 * Regra confirmada (Blueprint §3): vão máx **100 m** para o cabo **A35P 35 mm²**
 * (rede compacta, DIS-NOR-013). A **redução por terreno** (aclive/curva de nível,
 * para o cabo não ficar baixo) depende do perfil de elevação (DEM) e entra no B7;
 * por ora dividimos pelo comprimento no plano.
 *
 * Tudo em UTM (métrico) e imutável: devolve um NOVO projeto.
 */

/** Vão máximo padrão (m) — A35P 35 mm², rede compacta. */
export const VAO_MAXIMO_M = 100;

/** Distância no plano UTM (metros) entre duas coordenadas. */
export function distanciaM(a: LatLng, b: LatLng): number {
  const ua = paraUtm(a);
  const ub = paraUtm(b);
  return Math.hypot(ub.easting - ua.easting, ub.northing - ua.northing);
}

/** Comprimento (m) de um trecho que liga dois postes. `null` se não liga postes. */
export function comprimentoTrechoM(projeto: Projeto, trecho: Trecho): number | null {
  const de = trecho.dePontoId ? projeto.pontos.find((p) => p.id === trecho.dePontoId) : undefined;
  const a = trecho.aPontoId ? projeto.pontos.find((p) => p.id === trecho.aPontoId) : undefined;
  if (!de || !a) return null;
  return distanciaM(de.wgs84, a.wgs84);
}

export interface VaoLongo {
  trechoId: string;
  comprimentoM: number;
  /** Em quantos vãos ele seria dividido (⌈L/máx⌉). */
  vaos: number;
}

/** Trechos que ligam postes com comprimento acima do máximo. */
export function vaosLongos(projeto: Projeto, maxVaoM = VAO_MAXIMO_M): VaoLongo[] {
  const r: VaoLongo[] = [];
  for (const t of projeto.trechos) {
    const L = comprimentoTrechoM(projeto, t);
    if (L != null && L > maxVaoM + 1e-6) {
      r.push({ trechoId: t.id, comprimentoM: L, vaos: Math.ceil(L / maxVaoM) });
    }
  }
  return r;
}

export interface ResultadoDivisao {
  projeto: Projeto;
  postesAdicionados: number;
  trechosDivididos: number;
}

/** Interpola em UTM (métrico) entre dois pontos; fração f de 0 (a) a 1 (b). */
function interpolarUtm(a: LatLng, b: LatLng, f: number): LatLng {
  const ua = paraUtm(a);
  const ub = paraUtm(b);
  return deUtm({
    easting: ua.easting + (ub.easting - ua.easting) * f,
    northing: ua.northing + (ub.northing - ua.northing) * f,
    zone: ua.zone,
    hemisphere: ua.hemisphere,
  });
}

/** Maior `numero` numérico já usado nos pontos (para continuar a numeração). */
function maiorNumero(projeto: Projeto): number {
  return projeto.pontos.reduce((m, p) => {
    const n = Number(p.numero);
    return Number.isFinite(n) && n > m ? n : m;
  }, 0);
}

/**
 * Insere postes intermediários para que nenhum vão passe de `maxVaoM`.
 * Cada trecho longo vira uma cadeia de sub-trechos ligados pelos novos postes
 * (tipo "poste proposto", origem "web"). Idempotente: rodar de novo não faz nada
 * se já está tudo ≤ máximo.
 */
export function dividirVaos(projeto: Projeto, maxVaoM = VAO_MAXIMO_M): ResultadoDivisao {
  const pontos = [...projeto.pontos];
  const trechos: Trecho[] = [];
  let postesAdicionados = 0;
  let trechosDivididos = 0;
  let contador = maiorNumero(projeto);

  for (const t of projeto.trechos) {
    const de = t.dePontoId ? pontos.find((p) => p.id === t.dePontoId) : undefined;
    const a = t.aPontoId ? pontos.find((p) => p.id === t.aPontoId) : undefined;
    if (!de || !a) {
      trechos.push(t); // trecho sem pontas (geometria solta) fica como está
      continue;
    }
    const L = distanciaM(de.wgs84, a.wgs84);
    if (L <= maxVaoM + 1e-6) {
      trechos.push(t);
      continue;
    }
    trechosDivididos++;
    const n = Math.ceil(L / maxVaoM); // número de vãos resultantes
    const cadeia: LatLng[] = [de.wgs84];
    const ids: string[] = [de.id];
    for (let k = 1; k < n; k++) {
      const wgs = interpolarUtm(de.wgs84, a.wgs84, k / n);
      const id = novoId("pt");
      contador++;
      pontos.push({ id, tipo: "postePropostoo", numero: String(contador), wgs84: wgs, origem: "web" });
      cadeia.push(wgs);
      ids.push(id);
      postesAdicionados++;
    }
    cadeia.push(a.wgs84);
    ids.push(a.id);
    for (let i = 0; i < ids.length - 1; i++) {
      trechos.push({
        id: novoId("tr"),
        classe: t.classe,
        estilo: t.estilo ?? "rede",
        dePontoId: ids[i],
        aPontoId: ids[i + 1],
        caminho: [{ ...cadeia[i] }, { ...cadeia[i + 1] }],
        origem: "web",
        observacao: t.observacao,
      });
    }
  }

  const novo: Projeto = {
    ...projeto,
    pontos,
    trechos,
    meta: { ...projeto.meta, atualizadoEm: new Date().toISOString() },
  };
  return { projeto: novo, postesAdicionados, trechosDivididos };
}
