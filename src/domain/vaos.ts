import { novoId } from "./ids";
import { deUtm, paraUtm } from "../geo/utm";
import type { LatLng, Ponto, Projeto, Trecho } from "./model";

/**
 * Divisão de vãos (B2 / T2).
 *
 * A rede que vem do campo tem postes só nos pontos que o projetista marcou
 * (fonte, ângulos, obstáculos, trafo). Entre eles o vão pode passar do máximo
 * da norma. Aqui inserimos **postes intermediários** para nenhum vão passar do
 * alvo — é o passo que "posta" a rede.
 *
 * Dois níveis de controle (pedido do Igor):
 *  - **Global:** um "vão alvo" (padrão 100 m — máximo do A35P na rede compacta,
 *    DIS-NOR-013). `dividirVaos` reparte a rede inteira nesse alvo. Como ela
 *    primeiro **colapsa** os postes automáticos anteriores, dá pra **redividir**
 *    com outro alvo (mais/menos postes) sem estragar os postes de campo/manuais.
 *  - **Por vão:** quem foi a campo pode achar melhor encurtar UM vão (interferência
 *    vista no local). `ajustarVao` adiciona/remove um poste só naquele vão.
 *
 * A **redução por terreno** (aclive/curva de nível) depende do perfil de elevação
 * (DEM) e entra no B7; por ora dividimos pelo comprimento no plano (UTM métrico).
 *
 * Tudo imutável: cada função devolve um NOVO projeto.
 */

/** Vão alvo padrão (m) — A35P 35 mm², rede compacta. Máximo permitido. */
export const VAO_MAXIMO_M = 100;
/** Menor alvo que a UI oferece (segurança contra divisão absurda). */
export const VAO_MINIMO_M = 30;

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
  /** Em quantos vãos ele seria dividido (⌈L/alvo⌉). */
  vaos: number;
}

/** Trechos que ligam postes com comprimento acima do alvo. */
export function vaosLongos(projeto: Projeto, alvoM = VAO_MAXIMO_M): VaoLongo[] {
  const r: VaoLongo[] = [];
  for (const t of projeto.trechos) {
    const L = comprimentoTrechoM(projeto, t);
    if (L != null && L > alvoM + 1e-6) {
      r.push({ trechoId: t.id, comprimentoM: L, vaos: Math.ceil(L / alvoM) });
    }
  }
  return r;
}

/** Há postes automáticos (de divisão) no projeto? */
export function temPostesAuto(projeto: Projeto): boolean {
  return projeto.pontos.some((p) => p.auto);
}

// --------------------------------------------------------------------------
// Núcleo: interpolação, adjacência e subdivisão de um vão A→B
// --------------------------------------------------------------------------

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

function maiorNumero(projeto: Projeto): number {
  return projeto.pontos.reduce((m, p) => {
    const n = Number(p.numero);
    return Number.isFinite(n) && n > m ? n : m;
  }, 0);
}

function tocar(p: Projeto): Projeto {
  return { ...p, meta: { ...p.meta, atualizadoEm: new Date().toISOString() } };
}

/** Adjacência poste→[{viz, trecho}] a partir dos trechos que ligam postes. */
function adjacencia(projeto: Projeto): Map<string, { viz: string; trecho: Trecho }[]> {
  const adj = new Map<string, { viz: string; trecho: Trecho }[]>();
  for (const p of projeto.pontos) adj.set(p.id, []);
  for (const t of projeto.trechos) {
    if (t.dePontoId && t.aPontoId && adj.has(t.dePontoId) && adj.has(t.aPontoId)) {
      adj.get(t.dePontoId)!.push({ viz: t.aPontoId, trecho: t });
      adj.get(t.aPontoId)!.push({ viz: t.dePontoId, trecho: t });
    }
  }
  return adj;
}

/**
 * Substitui o vão A→B por `n` sub-vãos iguais, criando n-1 postes automáticos.
 * Devolve os postes e trechos novos e o id do primeiro sub-trecho (A→…), para a
 * UI manter a seleção. `n=1` só recria o trecho direto A→B.
 */
function subdividir(
  A: Ponto,
  B: Ponto,
  n: number,
  modelo: Trecho,
  numeroInicial: number,
): { pontos: Ponto[]; trechos: Trecho[]; primeiroTrechoId: string; ultimoNumero: number } {
  const pontos: Ponto[] = [];
  const trechos: Trecho[] = [];
  const wgs: LatLng[] = [A.wgs84];
  const ids: string[] = [A.id];
  let numero = numeroInicial;
  for (let k = 1; k < n; k++) {
    const w = interpolarUtm(A.wgs84, B.wgs84, k / n);
    const id = novoId("pt");
    numero++;
    pontos.push({ id, tipo: "postePropostoo", numero: String(numero), wgs84: w, origem: "web", auto: true });
    wgs.push(w);
    ids.push(id);
  }
  wgs.push(B.wgs84);
  ids.push(B.id);
  let primeiroTrechoId = "";
  for (let i = 0; i < ids.length - 1; i++) {
    const id = novoId("tr");
    if (i === 0) primeiroTrechoId = id;
    trechos.push({
      id,
      classe: modelo.classe,
      estilo: modelo.estilo ?? "rede",
      dePontoId: ids[i],
      aPontoId: ids[i + 1],
      caminho: [{ ...wgs[i] }, { ...wgs[i + 1] }],
      origem: "web",
      observacao: modelo.observacao,
    });
  }
  return { pontos, trechos, primeiroTrechoId, ultimoNumero: numero };
}

// --------------------------------------------------------------------------
// Colapsar: desfaz a divisão automática, voltando aos vãos "de origem"
// --------------------------------------------------------------------------

/**
 * Remove os postes automáticos e religa as pontas reais de cada vão. Postes de
 * campo e manuais (não-auto) ficam como estão — inclusive se o usuário tiver
 * movido um poste automático, o vão colapsa entre os reais mesmo assim.
 */
export function colapsarVaos(projeto: Projeto): Projeto {
  const autoSet = new Set(projeto.pontos.filter((p) => p.auto).map((p) => p.id));
  if (autoSet.size === 0) return projeto;

  const adj = adjacencia(projeto);
  const semPontas = projeto.trechos.filter((t) => !(t.dePontoId && t.aPontoId));
  const realReal = projeto.trechos.filter(
    (t) => t.dePontoId && t.aPontoId && !autoSet.has(t.dePontoId) && !autoSet.has(t.aPontoId),
  );

  const porId = new Map(projeto.pontos.map((p) => [p.id, p]));
  const vistos = new Set<string>();
  const novos: Trecho[] = [];

  const outroExtremo = (real: string, primeiroAuto: string, viaTrecho: Trecho) => {
    let prev = real;
    let cur = primeiroAuto;
    const modelo = viaTrecho;
    let guarda = 0;
    while (autoSet.has(cur) && guarda++ < 100000) {
      const viz = adj.get(cur) ?? [];
      const proximo = viz.find((e) => e.viz !== prev);
      if (!proximo) break;
      prev = cur;
      cur = proximo.viz;
    }
    return { real: cur, modelo };
  };

  for (const p of projeto.pontos) {
    if (autoSet.has(p.id)) continue; // começa só dos reais
    for (const e of adj.get(p.id) ?? []) {
      if (!autoSet.has(e.viz)) continue; // trecho real→real já preservado acima
      const fim = outroExtremo(p.id, e.viz, e.trecho);
      const chave = [p.id, fim.real].sort().join("|");
      if (vistos.has(chave)) continue;
      vistos.add(chave);
      const A = porId.get(p.id)!;
      const B = porId.get(fim.real)!;
      novos.push({
        id: novoId("tr"),
        classe: fim.modelo.classe,
        estilo: fim.modelo.estilo ?? "rede",
        dePontoId: A.id,
        aPontoId: B.id,
        caminho: [{ ...A.wgs84 }, { ...B.wgs84 }],
        origem: "web",
        observacao: fim.modelo.observacao,
      });
    }
  }

  return tocar({
    ...projeto,
    pontos: projeto.pontos.filter((p) => !p.auto),
    trechos: [...semPontas, ...realReal, ...novos],
  });
}

// --------------------------------------------------------------------------
// Global: dividir/redividir toda a rede num alvo
// --------------------------------------------------------------------------

export interface ResultadoDivisao {
  projeto: Projeto;
  postesAdicionados: number;
  trechosDivididos: number;
}

/**
 * Reparte a rede para nenhum vão passar de `alvoM`. Primeiro **colapsa** a
 * divisão anterior (permite redividir com outro alvo), depois divide cada vão
 * (entre postes reais) em ⌈L/alvo⌉ partes iguais.
 */
export function dividirVaos(projeto: Projeto, alvoM = VAO_MAXIMO_M): ResultadoDivisao {
  const base = colapsarVaos(projeto);
  const pontos = [...base.pontos];
  const trechos: Trecho[] = [];
  let postesAdicionados = 0;
  let trechosDivididos = 0;
  let numero = maiorNumero(base);

  for (const t of base.trechos) {
    const de = t.dePontoId ? pontos.find((p) => p.id === t.dePontoId) : undefined;
    const a = t.aPontoId ? pontos.find((p) => p.id === t.aPontoId) : undefined;
    if (!de || !a) {
      trechos.push(t);
      continue;
    }
    const L = distanciaM(de.wgs84, a.wgs84);
    if (L <= alvoM + 1e-6) {
      trechos.push(t);
      continue;
    }
    trechosDivididos++;
    const n = Math.ceil(L / alvoM);
    const sub = subdividir(de, a, n, t, numero);
    numero = sub.ultimoNumero;
    postesAdicionados += sub.pontos.length;
    pontos.push(...sub.pontos);
    trechos.push(...sub.trechos);
  }

  return { projeto: tocar({ ...base, pontos, trechos }), postesAdicionados, trechosDivididos };
}

// --------------------------------------------------------------------------
// Por vão: adicionar/remover um poste num vão específico
// --------------------------------------------------------------------------

/** Cadeia (sub-trechos + postes auto) do vão que contém `trechoId`, e as pontas reais. */
function cadeiaDoTrecho(projeto: Projeto, trechoId: string) {
  const t0 = projeto.trechos.find((t) => t.id === trechoId);
  if (!t0 || !t0.dePontoId || !t0.aPontoId) return null;
  const autoSet = new Set(projeto.pontos.filter((p) => p.auto).map((p) => p.id));
  const adj = adjacencia(projeto);
  const trechos: Trecho[] = [t0];
  const trechoIds = new Set([t0.id]);
  const autoPoles = new Set<string>();

  const estender = (partirDe: string, indoPara: string) => {
    // caminha a partir do nó, enquanto ele for auto, coletando trechos
    let prev = indoPara;
    let cur = partirDe;
    let guarda = 0;
    while (autoSet.has(cur) && guarda++ < 100000) {
      autoPoles.add(cur);
      const viz = adj.get(cur) ?? [];
      const proximo = viz.find((e) => e.viz !== prev && !trechoIds.has(e.trecho.id));
      if (!proximo) break;
      trechos.push(proximo.trecho);
      trechoIds.add(proximo.trecho.id);
      prev = cur;
      cur = proximo.viz;
    }
    return cur; // poste real (extremo)
  };

  const A = estender(t0.dePontoId, t0.aPontoId);
  const B = estender(t0.aPontoId, t0.dePontoId);
  return { A, B, trechos, trechoIds, autoPoles, n: trechos.length };
}

export interface ResultadoAjuste {
  projeto: Projeto;
  /** Quantos sub-vãos o vão passou a ter. */
  vaos: number;
  /** Id do primeiro sub-trecho, para a UI manter a seleção. */
  trechoSelId: string;
  /** Comprimento de cada sub-vão (m). */
  subVaoM: number;
}

/**
 * Ajusta a divisão de UM vão: `delta = +1` adiciona um poste (mais sub-vãos,
 * mais curtos), `delta = -1` remove um (menos sub-vãos). O vão é identificado
 * pelo trecho selecionado; as pontas reais ficam fixas. Mínimo 1 sub-vão.
 */
export function ajustarVao(projeto: Projeto, trechoId: string, delta: number): ResultadoAjuste | null {
  const cadeia = cadeiaDoTrecho(projeto, trechoId);
  if (!cadeia) return null;
  const porId = new Map(projeto.pontos.map((p) => [p.id, p]));
  const A = porId.get(cadeia.A);
  const B = porId.get(cadeia.B);
  if (!A || !B) return null;

  const novoN = Math.max(1, cadeia.n + delta);
  if (novoN === cadeia.n) {
    const L = distanciaM(A.wgs84, B.wgs84);
    return { projeto, vaos: cadeia.n, trechoSelId: trechoId, subVaoM: L / cadeia.n };
  }

  // remove os postes auto e os sub-trechos deste vão
  const pontos = projeto.pontos.filter((p) => !cadeia.autoPoles.has(p.id));
  const trechos = projeto.trechos.filter((t) => !cadeia.trechoIds.has(t.id));

  const modelo = cadeia.trechos[0];
  const sub = subdividir(A, B, novoN, modelo, maiorNumero(projeto));
  pontos.push(...sub.pontos);
  trechos.push(...sub.trechos);

  const L = distanciaM(A.wgs84, B.wgs84);
  return {
    projeto: tocar({ ...projeto, pontos, trechos }),
    vaos: novoN,
    trechoSelId: sub.primeiroTrechoId,
    subVaoM: L / novoN,
  };
}

/** Info do vão (para o painel do trecho): pontas, nº de sub-vãos e comprimento total. */
export function infoVao(projeto: Projeto, trechoId: string) {
  const cadeia = cadeiaDoTrecho(projeto, trechoId);
  if (!cadeia) return null;
  const porId = new Map(projeto.pontos.map((p) => [p.id, p]));
  const A = porId.get(cadeia.A);
  const B = porId.get(cadeia.B);
  if (!A || !B) return null;
  const comprimentoM = distanciaM(A.wgs84, B.wgs84);
  return { vaos: cadeia.n, comprimentoM, subVaoM: comprimentoM / cadeia.n };
}
