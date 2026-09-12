import { describe, expect, it } from "vitest";
import type { Ponto, Projeto, Trecho } from "./model";
import { modelarRede } from "./rede";
import { classificarEstrutura, type EstruturaAtribuida } from "./estrutura";
import { validarPararaios } from "./validacoes";

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

describe("validarPararaios (DIS-NOR-013 6.21.2)", () => {
  // A(fonte)-B-C: C é fim de linha.
  const A = P("A", 0, { ehFonte: true });
  const B = P("B", 100);
  const C = P("C", 200);

  it("fim de linha sem para-raios é sinalizado", () => {
    const proj = projeto([A, B, C], [tr("t1", "A", "B"), tr("t2", "B", "C")]);
    const pend = validarPararaios(proj, modelarRede(proj), estruturas(proj));
    expect(pend).toHaveLength(1);
    expect(pend[0].pontoId).toBe("C");
    expect(pend[0].motivo).toBe("fim de linha");
  });

  it("fim com -PR não é mais sinalizado", () => {
    const proj = projeto(
      [A, B, { ...C, estruturaManual: "CE3 PR" }],
      [tr("t1", "A", "B"), tr("t2", "B", "C")],
    );
    expect(validarPararaios(proj, modelarRede(proj), estruturas(proj))).toHaveLength(0);
  });

  it("fim com transformador (CE3TR) já é coberto — não sinaliza", () => {
    const proj = projeto(
      [A, B, { ...C, tipo: "transformador" }],
      [tr("t1", "A", "B"), tr("t2", "B", "C")],
    );
    expect(validarPararaios(proj, modelarRede(proj), estruturas(proj))).toHaveLength(0);
  });
});
