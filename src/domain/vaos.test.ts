import { describe, expect, it } from "vitest";
import type { Projeto, Ponto, Trecho } from "./model";
import { comprimentoTrechoM, distanciaM, dividirVaos, vaosLongos, VAO_MAXIMO_M } from "./vaos";

function ponto(id: string, lat: number, lng: number): Ponto {
  return { id, tipo: "postePropostoo", numero: id.replace("p", ""), wgs84: { lat, lng }, origem: "campo" };
}
function trecho(id: string, de: string, a: string, pts: Record<string, Ponto>): Trecho {
  return {
    id,
    classe: "indefinida",
    estilo: "rede",
    dePontoId: de,
    aPontoId: a,
    caminho: [pts[de].wgs84, pts[a].wgs84],
    origem: "campo",
  };
}
function projeto(pontos: Ponto[], trechos: Trecho[]): Projeto {
  const agora = "2026-01-01T00:00:00.000Z";
  return {
    schemaVersion: 1,
    meta: { nome: "t", criadoEm: agora, atualizadoEm: agora },
    pontos,
    trechos,
    linhasLivres: [],
    fotos: [],
    referencias: [],
  };
}

// ~250 m ao norte (0.002246° ≈ 250 m em latitude), mesma longitude.
const P1 = ponto("p1", -20.7, -50.0);
const P2 = ponto("p2", -20.7 + 0.002246, -50.0);

describe("distância e comprimento", () => {
  it("mede ~250 m entre os dois pontos", () => {
    const d = distanciaM(P1.wgs84, P2.wgs84);
    expect(d).toBeGreaterThan(240);
    expect(d).toBeLessThan(260);
  });

  it("comprimentoTrechoM usa as pontas do trecho", () => {
    const pts = { p1: P1, p2: P2 };
    const proj = projeto([P1, P2], [trecho("t1", "p1", "p2", pts)]);
    expect(comprimentoTrechoM(proj, proj.trechos[0])).toBeCloseTo(distanciaM(P1.wgs84, P2.wgs84), 3);
  });
});

describe("vaosLongos", () => {
  it("acha o vão acima de 100 m e diz em quantos dividir", () => {
    const pts = { p1: P1, p2: P2 };
    const proj = projeto([P1, P2], [trecho("t1", "p1", "p2", pts)]);
    const longos = vaosLongos(proj);
    expect(longos).toHaveLength(1);
    expect(longos[0].vaos).toBe(3); // ⌈~250/100⌉ = 3
  });
});

describe("dividirVaos", () => {
  it("divide ~250 m em 3 vãos, adicionando 2 postes, todos ≤ 100 m", () => {
    const pts = { p1: P1, p2: P2 };
    const proj = projeto([P1, P2], [trecho("t1", "p1", "p2", pts)]);
    const { projeto: novo, postesAdicionados, trechosDivididos } = dividirVaos(proj);
    expect(trechosDivididos).toBe(1);
    expect(postesAdicionados).toBe(2);
    expect(novo.pontos).toHaveLength(4);
    expect(novo.trechos).toHaveLength(3);
    for (const t of novo.trechos) {
      const L = comprimentoTrechoM(novo, t)!;
      expect(L).toBeLessThanOrEqual(VAO_MAXIMO_M + 1e-3);
    }
  });

  it("mantém as pontas originais e encadeia os sub-trechos", () => {
    const pts = { p1: P1, p2: P2 };
    const proj = projeto([P1, P2], [trecho("t1", "p1", "p2", pts)]);
    const { projeto: novo } = dividirVaos(proj);
    // a cadeia começa em p1 e termina em p2
    expect(novo.trechos[0].dePontoId).toBe("p1");
    expect(novo.trechos[novo.trechos.length - 1].aPontoId).toBe("p2");
    // encadeada: o destino de um é a origem do próximo
    for (let i = 0; i < novo.trechos.length - 1; i++) {
      expect(novo.trechos[i].aPontoId).toBe(novo.trechos[i + 1].dePontoId);
    }
  });

  it("não mexe em vão já dentro do limite e é idempotente", () => {
    const A = ponto("p1", -20.7, -50.0);
    const B = ponto("p2", -20.7 + 0.0005, -50.0); // ~55 m
    const pts = { p1: A, p2: B };
    const proj = projeto([A, B], [trecho("t1", "p1", "p2", pts)]);
    const r1 = dividirVaos(proj);
    expect(r1.postesAdicionados).toBe(0);
    expect(r1.projeto.pontos).toHaveLength(2);
    // rodar de novo num projeto já dividido não adiciona nada
    const grande = projeto([P1, P2], [trecho("t1", "p1", "p2", { p1: P1, p2: P2 })]);
    const um = dividirVaos(grande).projeto;
    const dois = dividirVaos(um);
    expect(dois.postesAdicionados).toBe(0);
  });
});
