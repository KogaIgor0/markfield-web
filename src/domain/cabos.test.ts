import { describe, expect, it } from "vitest";
import type { Ponto, Projeto, Trecho } from "./model";
import { acharCabo, CABO_PADRAO, tracaoDoCabo } from "./cabos";
import { modelarEsforcos } from "./esforco";
import { adicionarTrecho, caboHerdado, editarTrecho } from "./edicao";

const lat0 = -20.71;
const lng0 = -50.06;
const P = (id: string, xm: number, extra: Partial<Ponto> = {}): Ponto => ({
  id,
  tipo: "postePropostoo",
  numero: id,
  wgs84: { lat: lat0, lng: lng0 + xm / 104000 },
  origem: "web",
  ...extra,
});
const tr = (id: string, de: string, a: string, tipoCabo?: string): Trecho => ({
  id,
  classe: "indefinida",
  estilo: "rede",
  dePontoId: de,
  aPontoId: a,
  tipoCabo,
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

describe("catálogo de cabos", () => {
  it("A35P está confirmado (438/595/714)", () => {
    const c = acharCabo("A35P");
    expect(c.tracaoConfirmada).toBe(true);
    expect(c.tracaoDaN.urbana).toBe(438);
    expect(c.tracaoDaN.rural_alto).toBe(595);
    expect(c.tracaoDaN.rural_medio_baixo).toBe(714);
  });

  it("código ausente/desconhecido cai no padrão A35P", () => {
    expect(acharCabo(undefined).codigo).toBe(CABO_PADRAO);
    expect(acharCabo("nao-existe").codigo).toBe("A35P");
  });

  it("cabos não-A35P entram como provisórios", () => {
    expect(acharCabo("A70P").tracaoConfirmada).toBe(false);
    expect(tracaoDoCabo("A70P", "rural_medio_baixo")).toBe(793);
  });
});

describe("esforço usa o H do cabo de cada lança", () => {
  it("fim de rede: R = H do cabo (A70P > A35P)", () => {
    const r35 = modelarEsforcos(proj([P("A", 0), P("B", 100)], [tr("t", "A", "B", "A35P")]));
    const r70 = modelarEsforcos(proj([P("A", 0), P("B", 100)], [tr("t", "A", "B", "A70P")]));
    expect(r35.postes.get("B")!.esforcoDaN).toBeCloseTo(714, 0);
    expect(r70.postes.get("B")!.esforcoDaN).toBeCloseTo(793, 0);
  });

  it("tangente com cabos diferentes: R = |H70 − H35| (não zera)", () => {
    // A—B(A70P)  B—C(A35P), colineares: em B os puxões são opostos, mas de trações
    // diferentes → resultante = 793 − 714 = 79 daN.
    const proj2 = proj(
      [P("A", 0), P("B", 100), P("C", 200)],
      [tr("t1", "A", "B", "A70P"), tr("t2", "B", "C", "A35P")],
    );
    expect(modelarEsforcos(proj2).postes.get("B")!.esforcoDaN).toBeCloseTo(79, 0);
  });
});

describe("herança de cabo ao ligar", () => {
  it("novo trecho herda o cabo do trecho a montante", () => {
    let p = proj([P("A", 0, { ehFonte: true }), P("B", 100), P("C", 200)], [tr("t1", "A", "B")]);
    // define o cabo do trecho da fonte
    p = editarTrecho(p, "t1", { tipoCabo: "A70P" });
    expect(caboHerdado(p, "B")).toBe("A70P");
    const { projeto: p2, id } = adicionarTrecho(p, "B", "C");
    expect(p2.trechos.find((t) => t.id === id)!.tipoCabo).toBe("A70P");
  });

  it("sem cabo a montante, herda undefined (= padrão)", () => {
    const p = proj([P("A", 0), P("B", 100)], []);
    const { projeto: p2, id } = adicionarTrecho(p, "A", "B");
    expect(p2.trechos.find((t) => t.id === id)!.tipoCabo).toBeUndefined();
  });
});
