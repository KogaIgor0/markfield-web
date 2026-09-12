import { describe, expect, it } from "vitest";
import type { LatLng } from "./model";
import {
  bboxDeCoords,
  dimensaoDesenhoMm,
  dimFolha,
  escalaParaCaber,
  passoEscalaM,
  projetar,
  tamanhoRealM,
  type Bbox,
} from "./prancha";

describe("prancha — folha", () => {
  it("A3 em paisagem = 420 × 297 mm", () => {
    expect(dimFolha("A3", "paisagem")).toEqual({ larguraMm: 420, alturaMm: 297 });
    expect(dimFolha("A3", "retrato")).toEqual({ larguraMm: 297, alturaMm: 420 });
  });
});

describe("prancha — escala automática", () => {
  const bbox = (larguraM: number, alturaM: number): Bbox => ({
    minE: 0,
    minN: 0,
    maxE: larguraM,
    maxN: alturaM,
  });

  it("pega a MENOR escala-padrão que faz caber (mais detalhada)", () => {
    // 30 × 20 m numa área de 190 × 277 mm, sem folga:
    // eMin = 30000/190 ≈ 158 → menor padrão ≥ 158 é 200 (1:200).
    expect(escalaParaCaber(bbox(30, 20), 190, 277, 0)).toBe(200);
  });

  it("a folga (10%) pode empurrar pra próxima escala", () => {
    // 100 × 50 m, área 190 × 277 mm, folga 10%: eMin ≈ 100000/171 ≈ 585 → 1000.
    expect(escalaParaCaber(bbox(100, 50), 190, 277, 0.1)).toBe(1000);
  });

  it("rede maior que a maior escala → devolve a maior (1:10000)", () => {
    expect(escalaParaCaber(bbox(2000, 2000), 190, 277, 0)).toBe(10000);
  });

  it("o eixo mais apertado é quem manda", () => {
    // 10 × 260 m: a altura domina. eMin_H = 260000/277 ≈ 939 → 1000.
    expect(escalaParaCaber(bbox(10, 260), 190, 277, 0)).toBe(1000);
  });
});

describe("prancha — projeção UTM → mm", () => {
  const b: Bbox = { minE: 0, minN: 0, maxE: 100, maxN: 50 };

  it("o canto mínimo cai em (0,0)", () => {
    expect(projetar({ easting: 0, northing: 0 }, b, 1000)).toEqual({ xMm: 0, yMm: 0 });
  });

  it("1:1000 → 100 m viram 100 mm; 50 m viram 50 mm", () => {
    expect(projetar({ easting: 100, northing: 50 }, b, 1000)).toEqual({ xMm: 100, yMm: 50 });
  });

  it("dobrar a escala (1:2000) reduz o desenho à metade", () => {
    expect(projetar({ easting: 100, northing: 50 }, b, 2000)).toEqual({ xMm: 50, yMm: 25 });
  });

  it("dimensaoDesenhoMm bate com a escala", () => {
    expect(dimensaoDesenhoMm(b, 1000)).toEqual({ larguraMm: 100, alturaMm: 50 });
    expect(dimensaoDesenhoMm(b, 500)).toEqual({ larguraMm: 200, alturaMm: 100 });
  });
});

describe("prancha — barra de escala", () => {
  it("escolhe passo redondo (1/2/5 ·10ⁿ) que cabe", () => {
    expect(passoEscalaM(100, 1000)).toBe(100); // 100 mm → 100 m reais → passo 100
    expect(passoEscalaM(80, 1000)).toBe(50); //  80 mm →  80 m reais → passo 50
    expect(passoEscalaM(50, 2000)).toBe(100); //  50 mm → 100 m reais → passo 100
  });
});

describe("prancha — bounding box", () => {
  // Perto do piloto (Elektro SP): ~50 m de rede leste-oeste.
  const lat0 = -20.71;
  const lng0 = -50.06;
  const P = (xm: number, ym: number): LatLng => ({
    lat: lat0 + ym / 111000,
    lng: lng0 + xm / 104000,
  });

  it("um ponto só → caixa de tamanho ~zero", () => {
    const b = bboxDeCoords([P(0, 0)])!;
    const { larguraM, alturaM } = tamanhoRealM(b);
    expect(larguraM).toBeCloseTo(0, 3);
    expect(alturaM).toBeCloseTo(0, 3);
  });

  it("dois pontos → caixa cobre os dois (min < max)", () => {
    const b = bboxDeCoords([P(0, 0), P(100, 40)])!;
    expect(b.maxE).toBeGreaterThan(b.minE);
    expect(b.maxN).toBeGreaterThan(b.minN);
    const { larguraM, alturaM } = tamanhoRealM(b);
    // ~100 m em X, ~40 m em Y (a construção lat/lng é aproximada; folga de 1 m).
    expect(larguraM).toBeGreaterThan(99);
    expect(larguraM).toBeLessThan(101);
    expect(alturaM).toBeGreaterThan(38);
    expect(alturaM).toBeLessThan(41);
  });

  it("lista vazia → null", () => {
    expect(bboxDeCoords([])).toBeNull();
  });
});
