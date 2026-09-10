import type { Projeto } from "./model";
import { paraUtm } from "../geo/utm";

/**
 * Modelo de rede (B1) — o alicerce do motor.
 *
 * Transforma o campo (postes + trechos que ligam postes) numa REDE com
 * significado: o papel de cada poste (fonte / tangente / ângulo / derivação /
 * transformador / fim), o **ângulo de deflexão** onde a rede muda de direção, e
 * a ordem da rota a partir da fonte. Tudo determinístico e sobre UTM (métrico).
 *
 * Limite do B1: a topologia vem dos trechos que **ligam postes** (dePontoId/
 * aPontoId, feitos com "Ligar postes"). Linhas de geometria solta (importadas)
 * não entram na topologia — a UI avisa.
 */

export type Papel =
  | "fonte"
  | "tangente"
  | "angulo"
  | "derivacao"
  | "trafo"
  | "fim"
  | "isolado";

export interface PosteModelado {
  id: string;
  papel: Papel;
  /** Quantos postes vizinhos (na topologia). */
  grau: number;
  /** Ângulo de deflexão em graus (0 = reto), quando o poste tem 2 vizinhos. */
  deflexaoGraus?: number;
  /** Ordem na rota a partir da fonte (0 = fonte), quando há fonte. */
  ordem?: number;
}

export interface ResumoRede {
  fonte: number;
  tangente: number;
  angulo: number;
  derivacao: number;
  trafo: number;
  fim: number;
  isolado: number;
  total: number;
}

export interface RedeModelada {
  postes: Map<string, PosteModelado>;
  temFonte: boolean;
  resumo: ResumoRede;
  avisos: string[];
}

/** Limite de deflexão (°) para um poste de 2 vizinhos ainda ser "tangente" (CE1). */
export const LIMITE_TANGENTE_GRAUS = 6;

/** Ângulo de deflexão em P, dados os vizinhos A e B (em UTM métrico). */
function deflexao(
  p: { easting: number; northing: number },
  a: { easting: number; northing: number },
  b: { easting: number; northing: number },
): number {
  const vax = a.easting - p.easting;
  const vay = a.northing - p.northing;
  const vbx = b.easting - p.easting;
  const vby = b.northing - p.northing;
  const la = Math.hypot(vax, vay);
  const lb = Math.hypot(vbx, vby);
  if (la === 0 || lb === 0) return 0;
  const cos = Math.min(1, Math.max(-1, (vax * vbx + vay * vby) / (la * lb)));
  const interior = (Math.acos(cos) * 180) / Math.PI; // 180 = reto
  return 180 - interior; // deflexão: 0 = reto
}

export function modelarRede(projeto: Projeto): RedeModelada {
  const avisos: string[] = [];

  // Adjacência a partir dos trechos que ligam postes.
  const adj = new Map<string, Set<string>>();
  for (const p of projeto.pontos) adj.set(p.id, new Set());
  let semLigacao = 0;
  for (const t of projeto.trechos) {
    if (t.dePontoId && t.aPontoId && adj.has(t.dePontoId) && adj.has(t.aPontoId)) {
      adj.get(t.dePontoId)!.add(t.aPontoId);
      adj.get(t.aPontoId)!.add(t.dePontoId);
    } else if (t.caminho && t.caminho.length >= 2) {
      semLigacao++;
    }
  }
  if (semLigacao > 0) {
    avisos.push(`${semLigacao} linha(s) não ligam postes — use "Ligar postes" para entrarem na rede.`);
  }

  const porId = new Map(projeto.pontos.map((p) => [p.id, p]));
  const postes = new Map<string, PosteModelado>();

  for (const p of projeto.pontos) {
    const viz = [...(adj.get(p.id) ?? [])];
    const grau = viz.length;

    let deflexaoGraus: number | undefined;
    if (grau === 2) {
      const a = porId.get(viz[0]);
      const b = porId.get(viz[1]);
      if (a && b) {
        deflexaoGraus = deflexao(paraUtm(p.wgs84), paraUtm(a.wgs84), paraUtm(b.wgs84));
      }
    }

    let papel: Papel;
    if (p.tipo === "transformador") papel = "trafo";
    else if (p.ehFonte) papel = "fonte";
    else if (grau === 0) papel = "isolado";
    else if (grau === 1) papel = "fim";
    else if (grau >= 3) papel = "derivacao";
    else papel = (deflexaoGraus ?? 0) <= LIMITE_TANGENTE_GRAUS ? "tangente" : "angulo";

    postes.set(p.id, { id: p.id, papel, grau, deflexaoGraus });
  }

  // Rota: ordem por BFS a partir da fonte.
  const fonte = projeto.pontos.find((p) => p.ehFonte);
  const temFonte = Boolean(fonte);
  if (fonte) {
    const fila = [fonte.id];
    const visto = new Set([fonte.id]);
    let ordem = 0;
    postes.get(fonte.id)!.ordem = ordem++;
    while (fila.length) {
      const cur = fila.shift()!;
      for (const nb of adj.get(cur) ?? []) {
        if (!visto.has(nb)) {
          visto.add(nb);
          const pm = postes.get(nb);
          if (pm) pm.ordem = ordem++;
          fila.push(nb);
        }
      }
    }
  }

  const resumo: ResumoRede = {
    fonte: 0,
    tangente: 0,
    angulo: 0,
    derivacao: 0,
    trafo: 0,
    fim: 0,
    isolado: 0,
    total: projeto.pontos.length,
  };
  for (const pm of postes.values()) resumo[pm.papel]++;

  return { postes, temFonte, resumo, avisos };
}

/** Rótulo legível de um papel. */
export function rotuloPapel(p: Papel): string {
  const m: Record<Papel, string> = {
    fonte: "Fonte",
    tangente: "Tangente",
    angulo: "Ângulo",
    derivacao: "Derivação",
    trafo: "Transformador",
    fim: "Fim de rede",
    isolado: "Solto",
  };
  return m[p];
}
