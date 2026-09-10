import { describe, it, expect } from "vitest";
import { projetoVazio, type Ponto, type Trecho } from "./model";
import { modelarRede } from "./rede";

/**
 * Rede de teste (coordenadas ~lat/lng no interior de SP):
 *   F(fonte) — P1(reto) — P2(curva ~90°) — T(transformador, fim)
 * F e P1 e P2 na mesma latitude (linha leste-oeste); T ao norte de P2.
 */
function redeL() {
  const projeto = projetoVazio("Rede L");
  const F: Ponto = { id: "F", tipo: "postePropostoo", numero: "1", wgs84: { lat: -20.7, lng: -50.0 }, origem: "campo", ehFonte: true };
  const P1: Ponto = { id: "P1", tipo: "postePropostoo", numero: "2", wgs84: { lat: -20.7, lng: -49.999 }, origem: "campo" };
  const P2: Ponto = { id: "P2", tipo: "postePropostoo", numero: "3", wgs84: { lat: -20.7, lng: -49.998 }, origem: "campo" };
  const T: Ponto = { id: "T", tipo: "transformador", numero: "4", wgs84: { lat: -20.699, lng: -49.998 }, origem: "campo" };
  projeto.pontos.push(F, P1, P2, T);
  const liga = (de: string, a: string): Trecho => ({
    id: `t_${de}_${a}`, classe: "indefinida", estilo: "rede", dePontoId: de, aPontoId: a,
    caminho: [porId(de), porId(a)], origem: "web",
  });
  function porId(id: string) {
    return projeto.pontos.find((p) => p.id === id)!.wgs84;
  }
  projeto.trechos.push(liga("F", "P1"), liga("P1", "P2"), liga("P2", "T"));
  return projeto;
}

describe("modelarRede (B1)", () => {
  const rede = modelarRede(redeL());

  it("classifica os papéis certos", () => {
    expect(rede.postes.get("F")!.papel).toBe("fonte");
    expect(rede.postes.get("P1")!.papel).toBe("tangente"); // reto
    expect(rede.postes.get("P2")!.papel).toBe("angulo"); // curva
    expect(rede.postes.get("T")!.papel).toBe("trafo");
  });

  it("calcula deflexão ~0 no reto e ~90° na curva", () => {
    expect(rede.postes.get("P1")!.deflexaoGraus).toBeLessThan(1);
    expect(rede.postes.get("P2")!.deflexaoGraus).toBeGreaterThan(80);
    expect(rede.postes.get("P2")!.deflexaoGraus).toBeLessThan(100);
  });

  it("ordena a rota a partir da fonte", () => {
    expect(rede.temFonte).toBe(true);
    expect(rede.postes.get("F")!.ordem).toBe(0);
    expect(rede.postes.get("T")!.ordem).toBeGreaterThan(0);
  });

  it("resume a rede", () => {
    expect(rede.resumo.total).toBe(4);
    expect(rede.resumo.fonte).toBe(1);
    expect(rede.resumo.trafo).toBe(1);
    expect(rede.resumo.angulo).toBe(1);
    expect(rede.resumo.tangente).toBe(1);
  });

  it("sem fonte marcada, os extremos viram 'fim' e não há ordem", () => {
    const projeto = redeL();
    projeto.pontos.find((p) => p.id === "F")!.ehFonte = undefined;
    const r = modelarRede(projeto);
    expect(r.temFonte).toBe(false);
    expect(r.postes.get("F")!.papel).toBe("fim"); // extremo grau 1
    expect(r.postes.get("F")!.ordem).toBeUndefined();
  });

  it("avisa sobre linhas que não ligam postes", () => {
    const projeto = redeL();
    projeto.trechos.push({ id: "solto", classe: "indefinida", estilo: "cerca", caminho: [{ lat: -20.7, lng: -50 }, { lat: -20.7, lng: -49.99 }], origem: "campo" });
    const r = modelarRede(projeto);
    expect(r.avisos.some((a) => /não ligam postes/.test(a))).toBe(true);
  });
});
