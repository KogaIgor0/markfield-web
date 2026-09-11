import { describe, expect, it } from "vitest";
import {
  CATALOGO_ESTRUTURAS,
  CODIGOS_ESTRUTURA,
  comporEstrutura,
  separarEstrutura,
} from "./estruturas-catalogo";

describe("catálogo de estruturas", () => {
  it("tem a família base da norma", () => {
    for (const c of ["CE1", "CE2", "CE3", "CE4", "CE3-CE3"]) {
      expect((CODIGOS_ESTRUTURA as string[]).includes(c)).toBe(true);
    }
    expect(CATALOGO_ESTRUTURAS.find((e) => e.codigo === "CE1")!.auto).toBe(true);
    expect(CATALOGO_ESTRUTURAS.find((e) => e.codigo === "CE1A")!.auto).toBe(false);
  });

  it("compor: sufixo colado (TR) vs. com espaço (PR/CF)", () => {
    expect(comporEstrutura("CE3", "TR")).toBe("CE3TR");
    expect(comporEstrutura("CE2", "PR")).toBe("CE2 PR");
    expect(comporEstrutura("CE4", "CF")).toBe("CE4 CF");
    expect(comporEstrutura("CE1", "")).toBe("CE1");
  });

  it("separar: reconhece base + sufixo (inclusive TR colado)", () => {
    expect(separarEstrutura("CE3TR")).toEqual({ base: "CE3", sufixo: "TR" });
    expect(separarEstrutura("CE2 PR")).toEqual({ base: "CE2", sufixo: "PR" });
    expect(separarEstrutura("CE4 CF")).toEqual({ base: "CE4", sufixo: "CF" });
    expect(separarEstrutura("CE1")).toEqual({ base: "CE1", sufixo: "" });
    expect(separarEstrutura("CE3-CE3")).toEqual({ base: "CE3-CE3", sufixo: "" });
  });

  it("ida-e-volta compor↔separar", () => {
    for (const [b, s] of [["CE2", "PR"], ["CE3", "TR"], ["CE4", "SUH"], ["CE1", ""]] as const) {
      expect(separarEstrutura(comporEstrutura(b, s))).toEqual({ base: b, sufixo: s });
    }
  });
});
