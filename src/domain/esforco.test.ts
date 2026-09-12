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

  it("compat: estaiInstalado antigo vira 1 estai e tira a pendência", () => {
    const proj = projeto(
      [P("A", 0, 0), P("B", 100, 0, { estaiInstalado: true })],
      [tr("t", "A", "B")],
    );
    const r = modelarEsforcos(proj);
    const b = r.postes.get("B")!;
    expect(b.precisaEstai).toBe(true); // R ainda > capacidade
    expect(b.estais).toHaveLength(1); // convertido do formato antigo
    expect(b.pendente).toBe(false); // resolvido — não é mais erro de projeto
    // A (fim, sem estai) segue pendente
    expect(r.postes.get("A")!.pendente).toBe(true);
    expect(r.pendentes).toBe(1);
    expect(r.instalados).toBe(1);
    expect(r.totalEstais).toBe(2);
  });

  it("sugestão de estai aponta no sentido OPOSTO ao esforço", () => {
    // A(0,0)—B(100,0): em B a rede puxa pra oeste; a sugestão ancora a leste (az≈90°).
    const r = modelarEsforcos(projeto([P("A", 0, 0), P("B", 100, 0)], [tr("t", "A", "B")]));
    const b = r.postes.get("B")!;
    expect(b.precisaEstai).toBe(true);
    expect(b.estais).toHaveLength(0); // nada instalado ainda
    expect(b.sugestaoAzimute).toBeCloseTo(90, 0); // leste = oposto a A (oeste)
  });

  it("vários estais: o poste desenha cada um na sua direção", () => {
    // B com dois estais (0° = Norte, 90° = Leste).
    const A = P("A", 0, 0);
    const B = P("B", 100, 0, {
      estais: [
        { id: "e1", azimuteGraus: 0, auto: false },
        { id: "e2", azimuteGraus: 90, auto: false },
      ],
    });
    const r = modelarEsforcos(projeto([A, B], [tr("t", "A", "B")]));
    const b = r.postes.get("B")!;
    expect(b.estais).toHaveLength(2);
    expect(b.pendente).toBe(false);
    const e1 = b.estais[0];
    const e2 = b.estais[1];
    // e1 ao Norte (lat maior, ~mesma lng); e2 a Leste (lng maior, ~mesma lat)
    expect(e1.ate.lat).toBeGreaterThan(B.wgs84.lat);
    expect(e1.ate.lng).toBeCloseTo(B.wgs84.lng, 4);
    expect(e2.ate.lng).toBeGreaterThan(B.wgs84.lng);
    expect(e2.ate.lat).toBeCloseTo(B.wgs84.lat, 4);
  });

  it("poste solto (grau 0) não tem esforço nem estai", () => {
    const proj = projeto([P("A", 0, 0), P("B", 100, 0)], []); // sem trecho
    const r = modelarEsforcos(proj);
    expect(r.postes.get("A")!.esforcoDaN).toBe(0);
    expect(r.postes.get("A")!.precisaEstai).toBe(false);
  });
});

describe("tração reduzida — transferência de esforço (E-05)", () => {
  it("marcar o vão como reduzido derruba o esforço e tira o estai", () => {
    const A = P("A", 0, 0);
    const B = P("B", 100, 0);
    const normal = modelarEsforcos(projeto([A, B], [tr("t", "A", "B")]));
    expect(normal.postes.get("B")!.precisaEstai).toBe(true); // 714 > 400

    const reduzido = modelarEsforcos(
      projeto([A, B], [{ ...tr("t", "A", "B"), tracaoReduzida: true }]),
    );
    const b = reduzido.postes.get("B")!;
    expect(b.esforcoDaN).toBeCloseTo(215, 0); // tração reduzida do A35P
    expect(b.precisaEstai).toBe(false); // 215 < 400 → sem estai
  });

  it("transfere o esforço: derivação com ramal frouxo não pede estai", () => {
    // A—D—C colineares (D tangente) + ramal D—B ao sul.
    const A = P("A", -100, 0);
    const D = P("D", 0, 0);
    const C = P("C", 100, 0);
    const B = P("B", 0, -100);
    const trs = [tr("t1", "A", "D"), tr("t2", "D", "C"), tr("t3", "D", "B")];
    const comNormal = modelarEsforcos(projeto([A, D, C, B], trs));
    expect(comNormal.postes.get("D")!.precisaEstai).toBe(true); // ramal cheio puxa D (714)

    const trsFrouxo = [trs[0], trs[1], { ...trs[2], tracaoReduzida: true }];
    const comFrouxo = modelarEsforcos(projeto([A, D, C, B], trsFrouxo));
    expect(comFrouxo.postes.get("D")!.precisaEstai).toBe(false); // ramal frouxo (215 < 400)
  });
});
