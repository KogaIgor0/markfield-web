import { describe, expect, it } from "vitest";
import { projetoVazio, type Ponto, type Trecho } from "../domain/model";
import { gerarDxfPrancha } from "./dxfPrancha";

const lat0 = -20.71;
const lng0 = -50.06;
const P = (id: string, xm: number, ym: number, extra: Partial<Ponto> = {}): Ponto => ({
  id,
  tipo: "postePropostoo",
  numero: id,
  wgs84: { lat: lat0 + ym / 111000, lng: lng0 + xm / 104000 },
  origem: "web",
  ...extra,
});
const tr = (id: string, de: string, a: string): Trecho => ({
  id,
  classe: "primaria",
  estilo: "rede",
  dePontoId: de,
  aPontoId: a,
  origem: "web",
});

function projetoTeste() {
  const p = projetoVazio("Rede DXF");
  p.pontos = [P("1", 0, 0), P("2", 100, 0, { tipo: "transformador" })];
  p.trechos = [tr("t", "1", "2")];
  return p;
}

describe("gerarDxfPrancha", () => {
  const dxf = gerarDxfPrancha({
    projeto: projetoTeste(),
    esforcos: null,
    rotulosEstrutura: new Map([["2", "CE3TR"]]),
    materiais: null,
    folha: "A3",
    orientacao: "paisagem",
    escala: 1000,
  });

  it("é um DXF R12 válido em milímetros", () => {
    expect(dxf).toContain("AC1009"); // R12
    expect(dxf).toContain("$INSUNITS");
    expect(dxf).toMatch(/SECTION[\s\S]*ENTITIES[\s\S]*EOF/);
  });

  it("desenha a folha (moldura), a rede (LINE) e os postes (CIRCLE)", () => {
    expect(dxf).toContain("MF_MOLDURA");
    expect(dxf).toContain("LINE");
    expect(dxf).toContain("CIRCLE");
  });

  it("traz o rótulo de estrutura, o espaço de aprovação e a simbologia (Anexo VIII)", () => {
    expect(dxf).toContain("CE3TR");
    expect(dxf).toContain("APROVACAO");
    expect(dxf).toContain("Anexo VIII");
  });
});
