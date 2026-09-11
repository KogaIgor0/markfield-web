import { describe, expect, it } from "vitest";
import type { Projeto, Ponto, Trecho } from "./model";
import { modelarEsforcos, TRACAO_DAN, CAPACIDADE_PADRAO_DAN } from "./esforco";

// Ponto por metros (E/N) a partir de uma origem, convertendo pra lat/lng aprox.
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
  classe: "indefinida",
  estilo: "rede",
  dePontoId: de,
  aPontoId: a,
  origem: "web",
});
const projeto = (pontos: Ponto[], trechos: Trecho[]): Projeto => ({
  schemaVersion: 1,
  meta: { nome: "t", criadoEm: "2026-01-01T00:00:00Z", atualizadoEm: "2026-01-01T00:00:00Z" },
  pontos,
  trechos,
  linhasLivres: [],
  fotos: [],
  referencias: [],
});

const H = TRACAO_DAN.rural_medio_baixo; // 714

describe("modelarEsforcos — geometria", () => {
  it("fim de rede (1 vão): R = H", () => {
    // A—B, olhamos o esforço em B (grau 1)
    const proj = projeto([P("A", 0, 0), P("B", 100, 0)], [tr("t", "A", "B")]);
    const r = modelarEsforcos(proj);
    expect(r.postes.get("B")!.esforcoDaN).toBeCloseTo(H, 0);
    expect(r.postes.get("B")!.vaos).toBe(1);
  });

  it("tangente (2 vãos alinhados): R ≈ 0", () => {
    // A—M—C colineares no eixo x; M é tangente
    const proj = projeto(
      [P("A", 0, 0), P("M", 100, 0), P("C", 200, 0)],
      [tr("t1", "A", "M"), tr("t2", "M", "C")],
    );
    const r = modelarEsforcos(proj);
    expect(r.postes.get("M")!.esforcoDaN).toBeLessThan(1); // ~0
  });

  it("ângulo 90° (2 vãos): R = 2·H·sin(45°) = H·√2", () => {
    // M na origem; vizinhos a leste e ao norte → deflexão 90°
    const proj = projeto(
      [P("M", 0, 0), P("L", 100, 0), P("N", 0, 100)],
      [tr("t1", "M", "L"), tr("t2", "M", "N")],
    );
    const r = modelarEsforcos(proj);
    expect(r.postes.get("M")!.esforcoDaN).toBeCloseTo(H * Math.SQRT2, 0);
  });
});

describe("modelarEsforcos — estai", () => {
  it("fim de rede com poste 400 daN precisa de estai (H=714 > 400)", () => {
    const proj = projeto([P("A", 0, 0), P("B", 100, 0)], [tr("t", "A", "B")]);
    const r = modelarEsforcos(proj);
    const b = r.postes.get("B")!;
    expect(b.capacidadeDaN).toBe(CAPACIDADE_PADRAO_DAN);
    expect(b.precisaEstai).toBe(true);
  });

  it("tangente não precisa de estai", () => {
    const proj = projeto(
      [P("A", 0, 0), P("M", 100, 0), P("C", 200, 0)],
      [tr("t1", "A", "M"), tr("t2", "M", "C")],
    );
    expect(modelarEsforcos(proj).postes.get("M")!.precisaEstai).toBe(false);
  });

  it("capacidade maior no poste tira o estai do fim (600 > 714? não; 800 sim)", () => {
    const proj1 = projeto([P("A", 0, 0), P("B", 100, 0, { capacidadeDaN: 800 })], [tr("t", "A", "B")]);
    expect(modelarEsforcos(proj1).postes.get("B")!.precisaEstai).toBe(false); // 714 < 800
    const proj2 = projeto([P("A", 0, 0), P("B", 100, 0, { capacidadeDaN: 600 })], [tr("t", "A", "B")]);
    expect(modelarEsforcos(proj2).postes.get("B")!.precisaEstai).toBe(true); // 714 > 600
  });

  it("condição de vento muda a tração e o total de estais", () => {
    const proj = projeto([P("A", 0, 0), P("B", 100, 0)], [tr("t", "A", "B")]);
    const urbana = modelarEsforcos(proj, { condicao: "urbana" }); // H=438 > 400
    expect(urbana.tracaoDaN).toBe(438);
    expect(urbana.totalEstais).toBe(2); // A e B são as duas pontas (fim de rede)
  });

  it("marcar estai instalado tira a pendência (mas ainda 'precisa' fisicamente)", () => {
    const proj = projeto(
      [P("A", 0, 0), P("B", 100, 0, { estaiInstalado: true })],
      [tr("t", "A", "B")],
    );
    const r = modelarEsforcos(proj);
    const b = r.postes.get("B")!;
    expect(b.precisaEstai).toBe(true); // R ainda > capacidade
    expect(b.estaiInstalado).toBe(true);
    expect(b.pendente).toBe(false); // resolvido — não é mais erro de projeto
    // A (fim, sem estai) segue pendente
    expect(r.postes.get("A")!.pendente).toBe(true);
    expect(r.pendentes).toBe(1);
    expect(r.instalados).toBe(1);
    expect(r.totalEstais).toBe(2);
  });

  it("estai é desenhado no sentido OPOSTO ao esforço (âncora do lado contrário)", () => {
    // A(0,0)—B(100,0): em B a rede puxa pra oeste (rumo a A); o estai ancora a leste.
    const A = P("A", 0, 0);
    const B = P("B", 100, 0);
    const r = modelarEsforcos(projeto([A, B], [tr("t", "A", "B")]));
    const b = r.postes.get("B")!;
    expect(b.estaiAte).toBeDefined();
    // a ponta do estai fica MAIS LONGE de A do que o próprio poste B
    const dB = Math.hypot(B.wgs84.lng - A.wgs84.lng, B.wgs84.lat - A.wgs84.lat);
    const dEstai = Math.hypot(b.estaiAte!.lng - A.wgs84.lng, b.estaiAte!.lat - A.wgs84.lat);
    expect(dEstai).toBeGreaterThan(dB);
  });

  it("poste solto (grau 0) não tem esforço nem estai", () => {
    const proj = projeto([P("A", 0, 0), P("B", 100, 0)], []); // sem trecho
    const r = modelarEsforcos(proj);
    expect(r.postes.get("A")!.esforcoDaN).toBe(0);
    expect(r.postes.get("A")!.precisaEstai).toBe(false);
  });
});
