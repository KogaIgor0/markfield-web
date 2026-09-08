import { describe, it, expect } from "vitest";
import { projetoVazio, type Ponto } from "./model";
import {
  acharPonto,
  adicionarPonto,
  adicionarTrecho,
  editarPonto,
  moverPonto,
  proximoNumero,
  removerPonto,
  removerTrecho,
} from "./edicao";
import { deUtm, paraUtm } from "../geo/utm";

function comDoisPostes() {
  const projeto = projetoVazio("Rede");
  const a: Ponto = { id: "pt_a", tipo: "postePropostoo", numero: "1", wgs84: { lat: -20.71, lng: -50.06 }, origem: "campo" };
  const b: Ponto = { id: "pt_b", tipo: "postePropostoo", numero: "2", wgs84: { lat: -20.72, lng: -50.07 }, origem: "campo" };
  projeto.pontos.push(a, b);
  return { projeto, a, b };
}

function comPonto(): { projeto: ReturnType<typeof projetoVazio>; id: string } {
  const projeto = projetoVazio("Teste");
  const p: Ponto = {
    id: "pt_1",
    tipo: "postePropostoo",
    numero: "1",
    wgs84: { lat: -20.7142737, lng: -50.0617086 },
    origem: "campo",
  };
  projeto.pontos.push(p);
  return { projeto, id: p.id };
}

describe("motor de edição", () => {
  it("move um ponto sem mutar o projeto original", () => {
    const { projeto, id } = comPonto();
    const antesLat = projeto.pontos[0].wgs84.lat;
    const novo = moverPonto(projeto, id, { lat: -20.71, lng: -50.06 });
    expect(novo.pontos[0].wgs84).toEqual({ lat: -20.71, lng: -50.06 });
    expect(projeto.pontos[0].wgs84.lat).toBe(antesLat); // original intacto
    expect(novo).not.toBe(projeto);
    expect(novo.meta.atualizadoEm >= projeto.meta.atualizadoEm).toBe(true);
  });

  it("edita atributos preservando o resto", () => {
    const { projeto, id } = comPonto();
    const novo = editarPonto(projeto, id, { tipo: "transformador", observacao: "12600 trafo" });
    expect(novo.pontos[0].tipo).toBe("transformador");
    expect(novo.pontos[0].observacao).toBe("12600 trafo");
    expect(novo.pontos[0].numero).toBe("1"); // inalterado
    expect(novo.pontos[0].wgs84).toEqual(projeto.pontos[0].wgs84);
  });

  it("remove um ponto", () => {
    const { projeto, id } = comPonto();
    const novo = removerPonto(projeto, id);
    expect(novo.pontos).toHaveLength(0);
    expect(projeto.pontos).toHaveLength(1); // original intacto
  });

  it("adiciona ponto com origem web, id novo e número sugerido", () => {
    const { projeto } = comPonto();
    const { projeto: novo, id } = adicionarPonto(projeto, "generico", { lat: -20.7, lng: -50.06 });
    expect(novo.pontos).toHaveLength(2);
    const criado = acharPonto(novo, id)!;
    expect(criado.origem).toBe("web");
    expect(criado.tipo).toBe("generico");
    expect(criado.numero).toBe("2"); // maior (1) + 1
  });

  it("proximoNumero ignora números não numéricos", () => {
    const projeto = projetoVazio("X");
    projeto.pontos.push({ id: "a", tipo: "generico", numero: "abc", wgs84: { lat: 0, lng: 0 }, origem: "web" });
    projeto.pontos.push({ id: "b", tipo: "generico", numero: "7", wgs84: { lat: 0, lng: 0 }, origem: "web" });
    expect(proximoNumero(projeto)).toBe("8");
  });
});

describe("trechos ligando postes", () => {
  it("liga dois postes pegando as coordenadas exatas (snap)", () => {
    const { projeto, a, b } = comDoisPostes();
    const { projeto: novo, id } = adicionarTrecho(projeto, a.id, b.id);
    expect(id).not.toBe("");
    expect(novo.trechos).toHaveLength(1);
    const t = novo.trechos[0];
    expect(t.dePontoId).toBe(a.id);
    expect(t.aPontoId).toBe(b.id);
    expect(t.estilo).toBe("rede");
    expect(t.caminho).toEqual([a.wgs84, b.wgs84]);
  });

  it("não liga um poste a ele mesmo", () => {
    const { projeto, a } = comDoisPostes();
    const { id } = adicionarTrecho(projeto, a.id, a.id);
    expect(id).toBe("");
  });

  it("mover um poste leva junto a ponta do trecho ligado", () => {
    const { projeto, a, b } = comDoisPostes();
    const ligado = adicionarTrecho(projeto, a.id, b.id).projeto;
    const movido = moverPonto(ligado, a.id, { lat: -20.99, lng: -50.99 });
    expect(movido.trechos[0].caminho![0]).toEqual({ lat: -20.99, lng: -50.99 });
    expect(movido.trechos[0].caminho![1]).toEqual(b.wgs84); // outra ponta intacta
  });

  it("excluir um poste remove os trechos ligados a ele", () => {
    const { projeto, a, b } = comDoisPostes();
    const ligado = adicionarTrecho(projeto, a.id, b.id).projeto;
    const semA = removerPonto(ligado, a.id);
    expect(semA.trechos).toHaveLength(0);
  });

  it("removerTrecho tira só o trecho", () => {
    const { projeto, a, b } = comDoisPostes();
    const { projeto: ligado, id } = adicionarTrecho(projeto, a.id, b.id);
    const semTrecho = removerTrecho(ligado, id);
    expect(semTrecho.trechos).toHaveLength(0);
    expect(semTrecho.pontos).toHaveLength(2); // postes ficam
  });
});

describe("UTM ida-e-volta", () => {
  it("WGS84 → UTM → WGS84 fecha o ciclo", () => {
    const original = { lat: -20.7142737, lng: -50.0617086 };
    const volta = deUtm(paraUtm(original));
    expect(volta.lat).toBeCloseTo(original.lat, 9);
    expect(volta.lng).toBeCloseTo(original.lng, 9);
  });
});
