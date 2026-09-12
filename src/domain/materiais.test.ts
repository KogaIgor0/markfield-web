import { describe, expect, it } from "vitest";
import type { Ponto, Projeto, Trecho } from "./model";
import { modelarRede } from "./rede";
import { modelarEsforcos } from "./esforco";
import { classificarEstrutura, type EstruturaAtribuida } from "./estrutura";
import { espacadoresDoVao, resumoMateriais } from "./materiais";

const lat0 = -20.71;
const P = (id: string, ym: number, extra: Partial<Ponto> = {}): Ponto => ({
  id,
  tipo: "postePropostoo",
  numero: id,
  wgs84: { lat: lat0 + ym / 111000, lng: -50.06 },
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
const projeto = (pontos: Ponto[], trechos: Trecho[]): Projeto => ({
  schemaVersion: 1,
  meta: { nome: "t", criadoEm: "2026-01-01T00:00:00Z", atualizadoEm: "2026-01-01T00:00:00Z" },
  pontos,
  trechos,
  linhasLivres: [],
  fotos: [],
  referencias: [],
});
function estruturas(proj: Projeto): Map<string, EstruturaAtribuida> {
  const rede = modelarRede(proj);
  const m = new Map<string, EstruturaAtribuida>();
  for (const p of proj.pontos) {
    const pm = rede.postes.get(p.id);
    if (pm) m.set(p.id, classificarEstrutura(pm, p));
  }
  return m;
}

describe("espacadoresDoVao", () => {
  it("~1 a cada 9 m, mínimo 1", () => {
    expect(espacadoresDoVao(90)).toBe(10);
    expect(espacadoresDoVao(9)).toBe(1);
    expect(espacadoresDoVao(3)).toBe(1);
    expect(espacadoresDoVao(0)).toBe(0);
  });
});

describe("resumoMateriais", () => {
  it("agrega estruturas, cabo, espaçadores e estais", () => {
    const proj = projeto(
      [P("A", 0, { ehFonte: true }), P("B", 100), P("C", 200)],
      [tr("t1", "A", "B"), tr("t2", "B", "C")],
    );
    const esf = modelarEsforcos(proj);
    const r = resumoMateriais(proj, estruturas(proj), esf, 0);
    expect(r.postes).toBe(3);
    expect(r.trechos).toBe(2);
    expect(r.comprimentoRedeM).toBeGreaterThan(190);
    // cabo: só A35P (default), ~200 m
    expect(r.cabos).toHaveLength(1);
    expect(r.cabos[0].codigo).toBe("A35P");
    expect(r.cabos[0].comprimentoM).toBeGreaterThan(190);
    // estruturas: C é fim (CE3); B tangente (CE1)
    const cods = r.estruturas.map((e) => e.codigo);
    expect(cods).toContain("CE3");
    expect(cods).toContain("CE1");
    // espaçadores > 0 (estimado)
    expect(r.espacadores).toBeGreaterThan(0);
    expect(r.espacadoresEstimado).toBe(true);
  });

  it("agrupa postes por tipo (altura/carga) e marca os sem tipo", () => {
    const proj = projeto(
      [
        P("A", 0, { ehFonte: true, posteTipo: "C-11/600" }),
        P("B", 100, { posteTipo: "C-11/600" }),
        P("C", 200), // sem tipo
      ],
      [tr("t1", "A", "B"), tr("t2", "B", "C")],
    );
    const r = resumoMateriais(proj, estruturas(proj), modelarEsforcos(proj), 0);
    const c11 = r.postesPorTipo.find((p) => p.codigo === "C-11/600");
    const semTipo = r.postesPorTipo.find((p) => p.codigo === "—");
    expect(c11?.n).toBe(2);
    expect(semTipo?.n).toBe(1);
    expect(r.postesPorTipo.reduce((s, p) => s + p.n, 0)).toBe(r.postes);
  });

  it("conta para-raios pela estrutura -PR e cabo provisório", () => {
    const proj = projeto(
      [P("A", 0, { ehFonte: true }), P("B", 100, { estruturaManual: "CE3 PR" })],
      [tr("t", "A", "B", "A70P")],
    );
    const r = resumoMateriais(proj, estruturas(proj), modelarEsforcos(proj), 0);
    expect(r.pararaios).toBe(1);
    expect(r.cabos[0].codigo).toBe("A70P");
    expect(r.cabos[0].provisorio).toBe(true);
  });
});
