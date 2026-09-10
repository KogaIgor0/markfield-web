import { describe, expect, it } from "vitest";
import type { Projeto, Ponto, Trecho } from "./model";
import {
  ajustarVao,
  colapsarVaos,
  comprimentoTrechoM,
  distanciaM,
  dividirVaos,
  infoVao,
  redividirVao,
  vaosLongos,
  VAO_MAXIMO_M,
} from "./vaos";

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

  it("não mexe em vão já dentro do limite", () => {
    const A = ponto("p1", -20.7, -50.0);
    const B = ponto("p2", -20.7 + 0.0005, -50.0); // ~55 m
    const pts = { p1: A, p2: B };
    const proj = projeto([A, B], [trecho("t1", "p1", "p2", pts)]);
    const r1 = dividirVaos(proj);
    expect(r1.postesAdicionados).toBe(0);
    expect(r1.projeto.pontos).toHaveLength(2);
  });

  it("é idempotente: rodar de novo não re-divide o que já foi postado", () => {
    const proj = projeto([P1, P2], [trecho("t1", "p1", "p2", { p1: P1, p2: P2 })]);
    const um = dividirVaos(proj).projeto;
    expect(um.pontos).toHaveLength(4); // 2 reais + 2 auto
    const dois = dividirVaos(um);
    expect(dois.postesAdicionados).toBe(0); // não mexe em vão já dividido
    expect(dois.projeto.pontos).toHaveLength(4);
  });

  it("marca os postes inseridos como auto (postes reais ficam intactos)", () => {
    const proj = projeto([P1, P2], [trecho("t1", "p1", "p2", { p1: P1, p2: P2 })]);
    const novo = dividirVaos(proj).projeto;
    expect(novo.pontos.find((p) => p.id === "p1")!.auto).toBeUndefined();
    expect(novo.pontos.find((p) => p.id === "p2")!.auto).toBeUndefined();
    expect(novo.pontos.filter((p) => p.auto)).toHaveLength(2);
  });

  it("NÃO redivide a rede inteira: só divide vão cru (undivided)", () => {
    // Dois vãos crus: p1-p2 (~250 m) e p2-p3 (~55 m). Dividir posta o longo.
    const P3 = ponto("p3", P2.wgs84.lat + 0.0005, -50.0);
    const proj = projeto(
      [P1, P2, P3],
      [trecho("t1", "p1", "p2", { p1: P1, p2: P2 }), trecho("t2", "p2", "p3", { p2: P2, p3: P3 })],
    );
    const div = dividirVaos(proj).projeto;
    const autos = div.pontos.filter((p) => p.auto).length;
    expect(autos).toBe(2); // só o vão longo virou 3; o curto ficou 1
  });
});

describe("redividirVao (por trecho escolhido)", () => {
  it("aplica o alvo SÓ no vão selecionado; outro vão fica intacto", () => {
    const P3 = ponto("p3", P2.wgs84.lat + 0.0005, -50.0); // p2-p3 ~55 m, fica 1
    const proj = projeto(
      [P1, P2, P3],
      [trecho("t1", "p1", "p2", { p1: P1, p2: P2 }), trecho("t2", "p2", "p3", { p2: P2, p3: P3 })],
    );
    const div = dividirVaos(proj).projeto; // p1-p2 → 3 vãos (2 auto); p2-p3 → 1
    const subTrecho = div.trechos.find((t) => t.dePontoId === "p1")!; // primeiro sub-vão do estirão p1..p2
    const r = redividirVao(div, subTrecho.id, 50)!; // ~250/50 = 5 vãos → 4 auto NESSE estirão
    expect(r.vaos).toBe(5);
    // total de autos = 4 (só o estirão p1..p2 mudou; p2-p3 continua sem auto)
    expect(r.projeto.pontos.filter((p) => p.auto)).toHaveLength(4);
    // cada sub-vão do estirão ≤ 50 m
    const info = infoVao(r.projeto, r.trechoSelId)!;
    expect(info.subVaoM).toBeLessThanOrEqual(50 + 1e-3);
  });

  it("alvo maior reduz o nº de postes do vão", () => {
    const proj = projeto([P1, P2], [trecho("t1", "p1", "p2", { p1: P1, p2: P2 })]);
    const em50 = redividirVao(proj, "t1", 50)!; // ~250/50 = 5
    expect(em50.vaos).toBe(5);
    const trecho50 = em50.projeto.trechos.find((t) => t.dePontoId === "p1")!;
    const em100 = redividirVao(em50.projeto, trecho50.id, 100)!; // ~250/100 = 3
    expect(em100.vaos).toBe(3);
  });
});

describe("colapsarVaos", () => {
  it("desfaz a divisão, voltando aos 2 postes e 1 trecho", () => {
    const proj = projeto([P1, P2], [trecho("t1", "p1", "p2", { p1: P1, p2: P2 })]);
    const dividido = dividirVaos(proj).projeto;
    const colapsado = colapsarVaos(dividido);
    expect(colapsado.pontos).toHaveLength(2);
    expect(colapsado.pontos.map((p) => p.id).sort()).toEqual(["p1", "p2"]);
    expect(colapsado.trechos.filter((t) => t.dePontoId && t.aPontoId)).toHaveLength(1);
  });
});

describe("ajustarVao (por vão)", () => {
  it("+1 adiciona um poste no vão; -1 remove", () => {
    const proj = projeto([P1, P2], [trecho("t1", "p1", "p2", { p1: P1, p2: P2 })]);
    const dividido = dividirVaos(proj).projeto; // 3 sub-vãos
    const algum = dividido.trechos[0].id;
    const mais = ajustarVao(dividido, algum, +1)!;
    expect(mais.vaos).toBe(4);
    expect(mais.projeto.pontos.filter((p) => p.auto)).toHaveLength(3);
    // o vão inteiro continua entre p1 e p2
    const info = infoVao(mais.projeto, mais.trechoSelId)!;
    expect(info.vaos).toBe(4);
    const menos = ajustarVao(mais.projeto, mais.trechoSelId, -1)!;
    expect(menos.vaos).toBe(3);
  });

  it("não desce abaixo de 1 sub-vão", () => {
    const A = ponto("p1", -20.7, -50.0);
    const B = ponto("p2", -20.7 + 0.0005, -50.0); // ~55 m, 1 vão
    const proj = projeto([A, B], [trecho("t1", "p1", "p2", { p1: A, p2: B })]);
    const r = ajustarVao(proj, "t1", -1)!;
    expect(r.vaos).toBe(1);
  });
});
