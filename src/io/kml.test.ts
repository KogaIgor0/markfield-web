import { describe, it, expect } from "vitest";
import sniaKml from "./__fixtures__/Snia.kml?raw";
import { parseKml, LIMITE_PRECISAO_CONFIAVEL_M } from "./kml";
import { importarKml } from "./pacote";

/**
 * Testes de contrato contra o export REAL do app ("exportar tudo" do projeto
 * "Sônia"): 5 pontos (2 postes propostos, 3 genéricos), 19 fotos (3 com GPS
 * lixo de 300 m), nenhuma linha. Se o app mudar o formato, estes testes quebram
 * antes de o usuário sentir.
 */
describe("parseKml — export real da Sônia", () => {
  const c = parseKml(sniaKml);

  it("lê o nome do projeto (com acento)", () => {
    expect(c.nomeProjeto).toBe("Sônia");
  });

  it("lê os 5 pontos com os tipos certos", () => {
    expect(c.pontos).toHaveLength(5);
    const porTipo = (t: string) => c.pontos.filter((p) => p.tipo === t).length;
    expect(porTipo("postePropostoo")).toBe(2); // grafia com dois "o" preservada
    expect(porTipo("generico")).toBe(3);
    expect(porTipo("transformador")).toBe(0);
    expect(porTipo("outro")).toBe(0);
  });

  it("preserva número, observação, origem e precisão de campo", () => {
    const p1 = c.pontos.find((p) => p.numero === "1");
    expect(p1?.tipo).toBe("postePropostoo");
    expect(p1?.observacao).toBe("12600 Tomada");
    expect(p1?.fonteCoordenada).toBe("GPS");
    expect(p1?.precisaoM).toBeCloseTo(1.4, 5);
    expect(p1?.criadoEm).toBe("2026-08-26 09:44");
    // Precisão fina vem do ExtendedData, não do texto arredondado da descrição.
    const p3 = c.pontos.find((p) => p.numero === "3");
    expect(p3?.precisaoM).toBeCloseTo(1.35, 5);
  });

  it("lê as 19 fotos e marca as 3 de GPS lixo (300 m)", () => {
    expect(c.fotos).toHaveLength(19);
    const ruins = c.fotos.filter((f) => f.baixaConfianca);
    expect(ruins).toHaveLength(3);
    for (const f of ruins) expect(f.precisaoM).toBeGreaterThanOrEqual(LIMITE_PRECISAO_CONFIAVEL_M);
    // As boas ficam intactas.
    const foto1 = c.fotos.find((f) => f.nome === "Foto1");
    expect(foto1?.baixaConfianca).toBe(false);
    expect(foto1?.precisaoM).toBeCloseTo(1.4, 5);
    expect(foto1?.arquivo).toBe("fotos/Foto1.jpg");
  });

  it("este projeto não tem linhas de rede/cerca", () => {
    expect(c.trechos).toHaveLength(0);
    expect(c.linhasLivres).toHaveLength(0);
  });

  it("cunha ids estáveis e únicos para todo elemento", () => {
    const ids = [...c.pontos, ...c.fotos].map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => id.length > 0)).toBe(true);
  });
});

describe("importarKml — monta o projeto", () => {
  it("produz um Projeto válido pronto para o mapa", () => {
    const { projeto, relatorio } = importarKml(sniaKml);
    expect(projeto.schemaVersion).toBe(1);
    expect(projeto.meta.nome).toBe("Sônia");
    expect(projeto.pontos).toHaveLength(5);
    expect(projeto.fotos).toHaveLength(19);
    expect(relatorio.fotosBaixaConfianca).toBe(3);
  });
});
