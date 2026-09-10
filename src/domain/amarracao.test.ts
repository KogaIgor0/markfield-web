import { describe, expect, it } from "vitest";
import type { Ponto, Projeto, Trecho } from "./model";
import { modelarRede } from "./rede";
import { classificarEstrutura, type EstruturaAtribuida } from "./estrutura";
import { validarAmarracao } from "./amarracao";

const lat0 = -20.71;
const P = (id: string, ym: number, extra: Partial<Ponto> = {}): Ponto => ({
  id,
  tipo: "postePropostoo",
  numero: id,
  wgs84: { lat: lat0 + ym / 111000, lng: -50.06 },
  origem: "web",
  ...extra,
});
const tr = (id: string, de: string, a: string): Trecho => ({
  id,
  classe: "indefinida",
  estilo: "rede",
  dePontoId: de,
  aPontoId: a,
  origem: "web",
});
function projeto(pontos: Ponto[], trechos: Trecho[]): Projeto {
  return {
    schemaVersion: 1,
    meta: { nome: "t", criadoEm: "2026-01-01T00:00:00Z", atualizadoEm: "2026-01-01T00:00:00Z" },
    pontos,
    trechos,
    linhasLivres: [],
    fotos: [],
    referencias: [],
  };
}
function estruturas(proj: Projeto): Map<string, EstruturaAtribuida> {
  const rede = modelarRede(proj);
  const m = new Map<string, EstruturaAtribuida>();
  for (const p of proj.pontos) {
    const pm = rede.postes.get(p.id);
    if (pm) m.set(p.id, classificarEstrutura(pm, p));
  }
  return m;
}

describe("validarAmarracao (CE4 / 500 m)", () => {
  // Linha reta A(0)-B(300)-C(600) → lance A..C = 600 m só com CE1 no meio.
  const A = P("A", 0);
  const B = P("B", 300);
  const C = P("C", 600);
  const proj = projeto([A, B, C], [tr("t1", "A", "B"), tr("t2", "B", "C")]);

  it("sinaliza lance reto > 500 m sem amarração", () => {
    const rede = modelarRede(proj);
    const lances = validarAmarracao(proj, estruturas(proj), rede);
    expect(lances).toHaveLength(1);
    expect(lances[0].comprimentoM).toBeGreaterThan(500);
  });

  it("forçar CE4 no meio (B) quebra o lance e tira o aviso", () => {
    const projCE4 = projeto(
      [A, { ...B, estruturaManual: "CE4" }, C],
      [tr("t1", "A", "B"), tr("t2", "B", "C")],
    );
    const rede = modelarRede(projCE4);
    const lances = validarAmarracao(projCE4, estruturas(projCE4), rede);
    // agora os dois lances (A-B e B-C) têm 300 m cada → nenhum > 500
    expect(lances).toHaveLength(0);
  });
});
