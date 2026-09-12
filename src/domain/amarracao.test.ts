import { describe, expect, it } from "vitest";
import type { Ponto, Projeto, Trecho } from "./model";
import { modelarRede } from "./rede";
import { classificarEstrutura, type EstruturaAtribuida } from "./estrutura";
import { proporAmarracao, proporEstribos, validarAmarracao } from "./amarracao";

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

describe("proporAmarracao (sugestão de CE4)", () => {
  it("lance de 600 m: sugere CE4 no poste do meio (B)", () => {
    const A = P("A", 0);
    const B = P("B", 300);
    const C = P("C", 600);
    const proj = projeto([A, B, C], [tr("t1", "A", "B"), tr("t2", "B", "C")]);
    const rede = modelarRede(proj);
    const sug = proporAmarracao(proj, estruturas(proj), rede);
    expect(sug).toHaveLength(1);
    expect(sug[0].pontoId).toBe("B");
    expect(sug[0].lanceComprimentoM).toBeGreaterThan(500);
  });

  it("encaixa no poste EXISTENTE mais próximo da divisa (~350 m)", () => {
    // A(0)-M1(250)-M2(480)-C(700): n=2, divisa em 350 → M1 (250) mais perto que M2 (480)
    const proj = projeto(
      [P("A", 0), P("M1", 250), P("M2", 480), P("C", 700)],
      [tr("t1", "A", "M1"), tr("t2", "M1", "M2"), tr("t3", "M2", "C")],
    );
    const rede = modelarRede(proj);
    const sug = proporAmarracao(proj, estruturas(proj), rede);
    expect(sug).toHaveLength(1);
    expect(sug[0].pontoId).toBe("M1");
  });

  it("aceitar a sugestão (CE4 no poste) zera os lances longos", () => {
    const A = P("A", 0);
    const B = P("B", 300);
    const C = P("C", 600);
    const proj = projeto([A, B, C], [tr("t1", "A", "B"), tr("t2", "B", "C")]);
    const sug = proporAmarracao(proj, estruturas(proj), modelarRede(proj));
    // aplica CE4 no poste sugerido
    const aplicado = projeto(
      proj.pontos.map((p) => (p.id === sug[0].pontoId ? { ...p, estruturaManual: "CE4" } : p)),
      proj.trechos,
    );
    expect(validarAmarracao(aplicado, estruturas(aplicado), modelarRede(aplicado))).toHaveLength(0);
    expect(proporAmarracao(aplicado, estruturas(aplicado), modelarRede(aplicado))).toHaveLength(0);
  });

  it("sem lance longo, não propõe nada", () => {
    const proj = projeto([P("A", 0), P("B", 200)], [tr("t", "A", "B")]);
    expect(proporAmarracao(proj, estruturas(proj), modelarRede(proj))).toHaveLength(0);
  });
});

describe("proporEstribos (300 m, DIS-NOR-013 6.15.2)", () => {
  it("lance de 700 m: sugere estribo nos postes mais próximos das divisas de 300 m", () => {
    // A(0)-M1(250)-M2(480)-C(700): n=⌈700/300⌉=3, divisas ~233 e ~467
    const proj = projeto(
      [P("A", 0), P("M1", 250), P("M2", 480), P("C", 700)],
      [tr("t1", "A", "M1"), tr("t2", "M1", "M2"), tr("t3", "M2", "C")],
    );
    const sug = proporEstribos(proj, estruturas(proj), modelarRede(proj));
    expect(sug).toHaveLength(2);
    expect(sug.map((s) => s.pontoId).sort()).toEqual(["M1", "M2"]);
  });

  it("lance curto (< 300 m) não pede estribo", () => {
    const proj = projeto([P("A", 0), P("B", 200)], [tr("t", "A", "B")]);
    expect(proporEstribos(proj, estruturas(proj), modelarRede(proj))).toHaveLength(0);
  });
});
