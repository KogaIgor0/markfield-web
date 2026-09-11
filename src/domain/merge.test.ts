import { describe, expect, it } from "vitest";
import type { Foto, Ponto, Projeto, Trecho } from "./model";
import { mesclarProjetos } from "./merge";

const lat0 = -20.71;
const lng0 = -50.06;
const P = (id: string, xm: number, ym = 0, extra: Partial<Ponto> = {}): Ponto => ({
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
const ft = (id: string, nome: string, xm: number): Foto => ({
  id,
  nome,
  arquivo: `fotos/${nome}.jpg`,
  wgs84: { lat: lat0, lng: lng0 + xm / 104000 },
});
const proj = (
  pontos: Ponto[],
  trechos: Trecho[] = [],
  fotos: Foto[] = [],
  nome = "p",
): Projeto => ({
  schemaVersion: 1,
  meta: { nome, criadoEm: "2026-01-01T00:00:00Z", atualizadoEm: "2026-01-01T00:00:00Z" },
  pontos,
  trechos,
  linhasLivres: [],
  fotos,
  referencias: [],
});

describe("mesclarProjetos — união por identidade", () => {
  it("arquivos disjuntos: une tudo (equipes começaram do zero)", () => {
    const base = proj([P("A", 0), P("B", 100)], [tr("t1", "A", "B")]);
    const novo = proj([P("C", 5000), P("D", 5100)], [tr("t2", "C", "D")], [], "equipe2");
    const r = mesclarProjetos(base, novo);
    expect(r.projeto.pontos.map((p) => p.id)).toEqual(["A", "B", "C", "D"]);
    expect(r.projeto.trechos).toHaveLength(2);
    expect(r.relatorio.pontosAdicionados).toBe(2);
    expect(r.relatorio.trechosAdicionados).toBe(1);
    expect(r.relatorio.compartilhados).toBe(0);
    expect(r.relatorio.duplicadasProximas).toHaveLength(0);
  });

  it("arquivo continuado (ids compartilhados): só entra o inédito, sem duplicar", () => {
    const base = proj([P("A", 0), P("B", 100)], [tr("t1", "A", "B")]);
    // Equipe 2 continuou o MESMO arquivo: A e B repetem id; C é novo.
    const novo = proj(
      [P("A", 0), P("B", 100), P("C", 200)],
      [tr("t1", "A", "B"), tr("t2", "B", "C")],
    );
    const r = mesclarProjetos(base, novo);
    expect(r.projeto.pontos.map((p) => p.id)).toEqual(["A", "B", "C"]);
    expect(r.relatorio.pontosAdicionados).toBe(1); // só C
    expect(r.relatorio.trechosAdicionados).toBe(1); // só t2
    expect(r.relatorio.compartilhados).toBe(2); // A e B
    expect(r.relatorio.duplicadasProximas).toHaveLength(0); // C não está perto de A/B
  });

  it("não muta a base", () => {
    const base = proj([P("A", 0)], []);
    const novo = proj([P("C", 5000)], []);
    mesclarProjetos(base, novo);
    expect(base.pontos).toHaveLength(1);
    expect(base.pontos[0].id).toBe("A");
  });
});

describe("mesclarProjetos — emenda por proximidade", () => {
  it("sinaliza postes quase no mesmo lugar (mesmo poste físico, ids diferentes)", () => {
    const base = proj([P("A", 0), P("B", 100)]);
    // C do arquivo novo está a ~1,5 m de B (a emenda entre as equipes).
    const novo = proj([P("C", 101.5), P("D", 300)]);
    const r = mesclarProjetos(base, novo);
    expect(r.relatorio.pontosAdicionados).toBe(2); // ambos entram (não apagamos)
    expect(r.relatorio.duplicadasProximas).toHaveLength(1);
    const dup = r.relatorio.duplicadasProximas[0];
    expect(dup.idNovo).toBe("C");
    expect(dup.idBase).toBe("B");
    expect(dup.distanciaM).toBeLessThan(3);
    expect(dup.distanciaM).toBeGreaterThan(1);
  });

  it("respeita a tolerância configurada", () => {
    const base = proj([P("A", 0)]);
    const novo = proj([P("C", 2)]); // 2 m de A
    expect(mesclarProjetos(base, novo, { tolDuplicataM: 1 }).relatorio.duplicadasProximas).toHaveLength(0);
    expect(mesclarProjetos(base, novo, { tolDuplicataM: 5 }).relatorio.duplicadasProximas).toHaveLength(1);
  });
});

describe("mesclarProjetos — fotos e blobs", () => {
  it("renomeia foto com nome-base em conflito e reindexa o blob", () => {
    const base = proj([], [], [ft("f1", "Foto1", 0)]);
    const novo = proj([], [], [ft("f2", "Foto1", 5000)]); // mesmo nome, id diferente
    const imagensBase = new Map<string, Uint8Array>([["Foto1", new Uint8Array([1])]]);
    const imagensNovo = new Map<string, Uint8Array>([["Foto1", new Uint8Array([2])]]);
    const r = mesclarProjetos(base, novo, { imagensBase, imagensNovo });
    expect(r.projeto.fotos).toHaveLength(2);
    const nova = r.projeto.fotos[1];
    expect(nova.nome).toBe("Foto1_2");
    expect(nova.arquivo).toBe("fotos/Foto1_2.jpg");
    expect(r.relatorio.fotosRenomeadas).toBe(1);
    // blobs: o da base intacto, o novo sob o nome novo
    expect(r.imagens.get("Foto1")).toEqual(new Uint8Array([1]));
    expect(r.imagens.get("Foto1_2")).toEqual(new Uint8Array([2]));
  });

  it("foto com id compartilhado não duplica", () => {
    const base = proj([], [], [ft("f1", "Foto1", 0)]);
    const novo = proj([], [], [ft("f1", "Foto1", 0)]); // mesmo id
    const r = mesclarProjetos(base, novo);
    expect(r.projeto.fotos).toHaveLength(1);
    expect(r.relatorio.fotosAdicionadas).toBe(0);
    expect(r.relatorio.compartilhados).toBe(1);
  });
});
