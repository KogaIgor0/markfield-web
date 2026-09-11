import { describe, expect, it } from "vitest";
import type { Ponto, Projeto, Trecho } from "./model";
import { modelarRede } from "./rede";
import {
  azimuteEntre,
  direcoesDePonto,
  distanciaM,
  ehErro,
  estenderPonto,
  inserirNoVao,
} from "./inserir";

const lat0 = -20.71;
const lng0 = -50.06;
const P = (id: string, xm: number, ym = 0, extra: Partial<Ponto> = {}): Ponto => ({
  id,
  tipo: "postePropostoo",
  numero: id.replace(/\D/g, "") || id,
  wgs84: { lat: lat0 + ym / 111000, lng: lng0 + xm / 104000 },
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
const proj = (pontos: Ponto[], trechos: Trecho[] = []): Projeto => ({
  schemaVersion: 1,
  meta: { nome: "t", criadoEm: "2026-01-01T00:00:00Z", atualizadoEm: "2026-01-01T00:00:00Z" },
  pontos,
  trechos,
  linhasLivres: [],
  fotos: [],
  referencias: [],
});

describe("azimuteEntre", () => {
  it("leste = 90°, norte = 0°", () => {
    const R = P("R", 0);
    expect(azimuteEntre(R.wgs84, P("E", 100).wgs84)).toBeCloseTo(90, 0);
    expect(azimuteEntre(R.wgs84, P("N", 0, 100).wgs84)).toBeCloseTo(0, 0);
  });
});

describe("estenderPonto", () => {
  it("estende 30 m a leste: novo poste ~30 m do referência, ligado a ele", () => {
    const base = proj([P("R", 0)]);
    const s = estenderPonto(base, "R", 90, 30);
    expect(ehErro(s)).toBe(false);
    if (ehErro(s)) return;
    expect(s.projeto.pontos).toHaveLength(2);
    const novo = s.projeto.pontos.find((p) => p.id === s.id)!;
    expect(distanciaM(base.pontos[0].wgs84, novo.wgs84)).toBeCloseTo(30, 1);
    expect(novo.wgs84.lng).toBeGreaterThan(base.pontos[0].wgs84.lng); // a leste
    // trecho R → novo
    const t = s.projeto.trechos[0];
    expect(t.dePontoId).toBe("R");
    expect(t.aPontoId).toBe(s.id);
  });

  it("distância inválida vira erro", () => {
    const s = estenderPonto(proj([P("R", 0)]), "R", 90, 0);
    expect(ehErro(s)).toBe(true);
  });
});

describe("inserirNoVao", () => {
  const base = proj([P("R", 0), P("V", 100)], [tr("t", "R", "V")]);

  it("insere a 30 m de R: subdivide o vão em 30 + 70", () => {
    const s = inserirNoVao(base, "R", "V", 30);
    expect(ehErro(s)).toBe(false);
    if (ehErro(s)) return;
    expect(s.projeto.pontos).toHaveLength(3);
    expect(s.projeto.trechos).toHaveLength(2); // t some, entram 2
    const novo = s.projeto.pontos.find((p) => p.id === s.id)!;
    expect(distanciaM(base.pontos[0].wgs84, novo.wgs84)).toBeCloseTo(30, 1);
    // o resto é L−30 (L ~100 m; o fixture usa m/grau aproximado, daí tolerância 0)
    const L = distanciaM(base.pontos[0].wgs84, base.pontos[1].wgs84);
    expect(distanciaM(novo.wgs84, base.pontos[1].wgs84)).toBeCloseTo(L - 30, 0);
    // topologia R–novo–V
    const tA = s.projeto.trechos.find((t) => t.dePontoId === "R")!;
    const tB = s.projeto.trechos.find((t) => t.aPontoId === "V")!;
    expect(tA.aPontoId).toBe(s.id);
    expect(tB.dePontoId).toBe(s.id);
  });

  it("distância >= vão vira erro (não passa do próximo poste)", () => {
    const s = inserirNoVao(base, "R", "V", 120);
    expect(ehErro(s)).toBe(true);
  });
});

describe("direcoesDePonto — sentido carga pela rota", () => {
  // A(fonte)—B—C em linha; ordem A<B<C.
  const base = proj(
    [P("A", 0, 0, { ehFonte: true }), P("B", 100), P("C", 200)],
    [tr("t1", "A", "B"), tr("t2", "B", "C")],
  );
  const ordem = (() => {
    const m = new Map<string, number | undefined>();
    for (const [id, pm] of modelarRede(base).postes) m.set(id, pm.ordem);
    return m;
  })();

  it("no B: A é fonte (montante), C é carga (jusante)", () => {
    const d = direcoesDePonto(base, "B", ordem);
    const a = d.vizinhos.find((v) => v.vizinhoId === "A")!;
    const c = d.vizinhos.find((v) => v.vizinhoId === "C")!;
    expect(a.sentido).toBe("fonte");
    expect(c.sentido).toBe("carga");
    expect(d.estenderCargaAzimute).toBeUndefined(); // B não é ponta
  });

  it("no C (ponta): pode estender a linha no sentido carga (pra fora)", () => {
    const d = direcoesDePonto(base, "C", ordem);
    expect(d.vizinhos).toHaveLength(1);
    expect(d.vizinhos[0].sentido).toBe("fonte"); // único vizinho é a montante
    expect(d.estenderCargaAzimute).toBeDefined();
    // a linha vai de oeste (B) pra leste (C); estender carga continua pra leste = az 90°
    expect(d.estenderCargaAzimute!).toBeCloseTo(90, 0);
  });
});
