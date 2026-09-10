import { describe, expect, it } from "vitest";
import sniaLinhasKml from "../io/__fixtures__/Snia_linhas.kml?raw";
import { importarKml } from "../io/pacote";
import { precisaReconstruir, reconstruirRede } from "./reconstruir";
import { modelarRede } from "./rede";
import type { LatLng, Ponto, Projeto, Trecho } from "./model";

describe("importarKml — a rede do app já entra ligada (auto-reconstrução)", () => {
  const { projeto } = importarKml(sniaLinhasKml);

  it("os trechos 'rede' ligam postes de verdade (não sobra linha solta)", () => {
    const ligados = projeto.trechos.filter((t) => t.estilo === "rede" && t.dePontoId && t.aPontoId);
    expect(ligados.length).toBeGreaterThan(0);
    expect(precisaReconstruir(projeto)).toBe(false);
  });

  it("o modelo de rede (B1) enxerga a topologia", () => {
    const rede = modelarRede(projeto);
    const comLigacao = [...rede.postes.values()].filter((p) => p.grau >= 1).length;
    expect(comLigacao).toBeGreaterThanOrEqual(2);
  });
});

describe("reconstruirRede — casa a linha aos postes que ela cruza", () => {
  // Linha reta de A a C passando POR B (2 vértices só); B está sobre a linha.
  const lat0 = -20.71;
  const P = (id: string, ym: number): Ponto => ({
    id,
    tipo: "postePropostoo",
    numero: id,
    wgs84: { lat: lat0 + ym / 111000, lng: -50.06 },
    origem: "campo",
  });
  const A = P("A", 0);
  const B = P("B", 100);
  const C = P("C", 200);
  const linhaRede: Trecho = {
    id: "linha",
    classe: "indefinida",
    estilo: "rede",
    caminho: [A.wgs84, C.wgs84] as LatLng[], // só 2 vértices (pontas), sem passar explicitamente por B
    origem: "campo",
  };
  const proj: Projeto = {
    schemaVersion: 1,
    meta: { nome: "x", criadoEm: "2026-01-01T00:00:00Z", atualizadoEm: "2026-01-01T00:00:00Z" },
    pontos: [A, B, C],
    trechos: [linhaRede],
    linhasLivres: [],
    fotos: [],
    referencias: [],
  };

  it("liga A–B–C (2 trechos), pegando B que está SOBRE a linha", () => {
    expect(precisaReconstruir(proj)).toBe(true);
    const r = reconstruirRede(proj);
    expect(r.linhasReconhecidas).toBe(1);
    expect(r.trechosCriados).toBe(2); // A→B, B→C
    const seq = r.projeto.trechos.map((t) => `${t.dePontoId}${t.aPontoId}`).sort();
    expect(seq).toEqual(["AB", "BC"]);
    expect(precisaReconstruir(r.projeto)).toBe(false);
  });

  it("é idempotente e não mexe em rede já ligada", () => {
    const r1 = reconstruirRede(proj);
    const r2 = reconstruirRede(r1.projeto);
    expect(r2.trechosCriados).toBe(0);
    expect(r2.projeto.trechos).toHaveLength(2);
  });
});
