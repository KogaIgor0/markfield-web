import { describe, expect, it } from "vitest";
import {
  acharPoste,
  alturasDe,
  cargasDe,
  capacidadeDoPoste,
  CATALOGO_POSTES,
  POSTE_PADRAO,
  sugerirPoste,
} from "./postes-catalogo";

describe("postes — catálogo (DIS-ETE-011 rev06)", () => {
  it("tem os postes do projeto real da Elektro", () => {
    for (const cod of ["C-11/400", "C-11/600", "C-12/600", "DT-11/300", "C-12/1500"]) {
      expect(acharPoste(cod), cod).toBeTruthy();
    }
  });

  it("circular 12 m vai até 2000 daN; duplo T só até 300", () => {
    expect(cargasDe("circular", 12)).toEqual([400, 600, 1000, 1500, 2000]);
    expect(cargasDe("duploT", 12)).toEqual([200, 300]);
  });

  it("alturas circulares = 9,11,12,14,16", () => {
    expect(alturasDe("circular")).toEqual([9, 11, 12, 14, 16]);
  });

  it("capacidade lê a carga do código", () => {
    expect(capacidadeDoPoste("C-11/600")).toBe(600);
    expect(capacidadeDoPoste("DT-11/300")).toBe(300);
    expect(capacidadeDoPoste("inexistente")).toBeUndefined();
  });

  it("padrão = 11 m / 400 daN circular", () => {
    expect(acharPoste(POSTE_PADRAO)?.cargaDaN).toBe(400);
    expect(acharPoste(POSTE_PADRAO)?.alturaM).toBe(11);
  });
});

describe("postes — sugestão pelo esforço (11 m circular)", () => {
  it("pega o menor poste que aguenta", () => {
    expect(sugerirPoste(350).tipo.codigo).toBe("C-11/400"); // 350 < 400
    expect(sugerirPoste(500).tipo.codigo).toBe("C-11/600"); // 400 < 500 ≤ 600
    expect(sugerirPoste(900).tipo.codigo).toBe("C-11/1000");
    const s = sugerirPoste(500);
    expect(s.aguenta).toBe(true);
    expect(s.tipo.cargaDaN).toBeGreaterThanOrEqual(500);
  });

  it("esforço acima do maior (1500) → maior poste, aguenta=false", () => {
    const s = sugerirPoste(1800);
    expect(s.tipo.codigo).toBe("C-11/1500");
    expect(s.aguenta).toBe(false);
  });

  it("respeita altura/seção pedidas", () => {
    expect(sugerirPoste(250, { secao: "duploT", alturaM: 11 }).tipo.codigo).toBe("DT-11/300");
  });
});

describe("postes — catálogo íntegro", () => {
  it("todo código é único e tem rótulo", () => {
    const cods = CATALOGO_POSTES.map((p) => p.codigo);
    expect(new Set(cods).size).toBe(cods.length);
    for (const p of CATALOGO_POSTES) expect(p.rotulo).toContain("daN");
  });
});
