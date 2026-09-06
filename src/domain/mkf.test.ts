import { describe, it, expect } from "vitest";
import { projetoVazio, type Ponto } from "./model";
import { novoId } from "./ids";
import { montarMkf, serializarMkf, lerMkf } from "./mkf";

describe("contrato .mkf", () => {
  it("faz round-trip de um projeto preservando os IDs", () => {
    const projeto = projetoVazio("Extensão Rural Teste");
    projeto.meta.concessionaria = "neoenergia";

    const poste: Ponto = {
      id: novoId("pt"),
      tipo: "postePropostoo", // sic — grafia do app, deve sobreviver ao round-trip
      numero: "001",
      wgs84: { lat: -15.8, lng: -47.9 },
      origem: "campo",
      precisaoM: 3.2,
    };
    projeto.pontos.push(poste);

    const payload = montarMkf(projeto, "markfield-web/0.1.0-test");
    const { manifestJson, projetoJson } = serializarMkf(payload);
    const lido = lerMkf(manifestJson, projetoJson);

    expect(lido.projeto.pontos).toHaveLength(1);
    expect(lido.projeto.pontos[0].id).toBe(poste.id);
    expect(lido.projeto.pontos[0].tipo).toBe("postePropostoo");
    expect(lido.projeto.meta.concessionaria).toBe("neoenergia");
    expect(lido.manifest.mkfVersion).toBe("1.0.0");
  });

  it("rejeita um projeto com schemaVersion não suportado", () => {
    const projeto = projetoVazio("X");
    const payload = montarMkf(projeto, "teste");
    const { manifestJson, projetoJson } = serializarMkf(payload);
    const corrompido = projetoJson.replace('"schemaVersion": 1', '"schemaVersion": 99');
    expect(() => lerMkf(manifestJson, corrompido)).toThrow(/schemaVersion/);
  });

  it("gera IDs únicos", () => {
    const ids = new Set(Array.from({ length: 1000 }, () => novoId()));
    expect(ids.size).toBe(1000);
  });
});
