import { describe, expect, it } from "vitest";
import type { Ponto } from "./model";
import type { PosteModelado } from "./rede";
import { classificarEstrutura, rotuloEstrutura } from "./estrutura";

function pm(over: Partial<PosteModelado>): PosteModelado {
  return { id: "x", papel: "tangente", grau: 2, ...over };
}
function pt(over: Partial<Ponto> = {}): Ponto {
  return { id: "x", tipo: "postePropostoo", wgs84: { lat: 0, lng: 0 }, origem: "web", ...over };
}

describe("classificarEstrutura — casos confirmados (ok)", () => {
  it("tangente ≤6° → CE1", () => {
    const e = classificarEstrutura(pm({ papel: "tangente", deflexaoGraus: 2 }), pt());
    expect(e.codigo).toBe("CE1");
    expect(e.confianca).toBe("ok");
  });

  it("ângulo 6–60° → CE2", () => {
    const e = classificarEstrutura(pm({ papel: "angulo", deflexaoGraus: 30 }), pt());
    expect(e.codigo).toBe("CE2");
    expect(e.confianca).toBe("ok");
  });

  it("ângulo 60–90° → CE4", () => {
    const e = classificarEstrutura(pm({ papel: "angulo", deflexaoGraus: 75 }), pt());
    expect(e.codigo).toBe("CE4");
    expect(e.confianca).toBe("ok");
  });

  it("fim de rede → CE3", () => {
    const e = classificarEstrutura(pm({ papel: "fim", grau: 1 }), pt());
    expect(e.codigo).toBe("CE3");
    expect(e.confianca).toBe("ok");
  });

  it("fim com transformador → CE3TR", () => {
    const e = classificarEstrutura(pm({ papel: "trafo", grau: 1 }), pt({ tipo: "transformador" }));
    expect(e.codigo).toBe("CE3TR");
    expect(e.confianca).toBe("ok");
  });

  it("limite exato 60° é CE2; 60.1° é CE4", () => {
    expect(classificarEstrutura(pm({ papel: "angulo", deflexaoGraus: 60 }), pt()).codigo).toBe("CE2");
    expect(classificarEstrutura(pm({ papel: "angulo", deflexaoGraus: 60.1 }), pt()).codigo).toBe("CE4");
  });
});

describe("classificarEstrutura — casos a revisar", () => {
  it("derivação (grau≥3) marca revisar", () => {
    const e = classificarEstrutura(pm({ papel: "derivacao", grau: 3 }), pt());
    expect(e.confianca).toBe("revisar");
    expect(e.motivo).toBeTruthy();
  });

  it("transformador no meio da linha marca revisar (base + TR)", () => {
    const e = classificarEstrutura(
      pm({ papel: "trafo", grau: 2, deflexaoGraus: 10 }),
      pt({ tipo: "transformador" }),
    );
    expect(e.codigo).toBe("CE2-TR");
    expect(e.confianca).toBe("revisar");
  });

  it("ângulo > 90° marca revisar", () => {
    const e = classificarEstrutura(pm({ papel: "angulo", deflexaoGraus: 120 }), pt());
    expect(e.confianca).toBe("revisar");
  });

  it("fonte e isolado não recebem código", () => {
    expect(classificarEstrutura(pm({ papel: "fonte", grau: 1 }), pt()).codigo).toBe("");
    expect(classificarEstrutura(pm({ papel: "isolado", grau: 0 }), pt()).codigo).toBe("");
  });
});

describe("rotuloEstrutura", () => {
  it("ok mostra só o código; revisar adiciona ?", () => {
    expect(rotuloEstrutura({ codigo: "CE2", descricao: "", confianca: "ok" })).toBe("CE2");
    expect(rotuloEstrutura({ codigo: "CE4", descricao: "", confianca: "revisar" })).toBe("CE4?");
    expect(rotuloEstrutura({ codigo: "", descricao: "", confianca: "revisar" })).toBe("");
  });
});
