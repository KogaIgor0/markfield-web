import { describe, it, expect } from "vitest";
import { projetoVazio, type Ponto, type Trecho } from "../domain/model";
import { gerarDxfCadastro } from "./dxf";
import { paraUtm } from "../geo/utm";

describe("DXF de cadastro (Elektro)", () => {
  const projeto = projetoVazio("Teste");
  const poste: Ponto = {
    id: "p1",
    tipo: "postePropostoo",
    numero: "1",
    wgs84: { lat: -20.7142737, lng: -50.0617086 },
    origem: "campo",
  };
  const trafo: Ponto = {
    id: "p2",
    tipo: "transformador",
    numero: "2",
    wgs84: { lat: -20.7104644, lng: -50.0598797 },
    origem: "web",
  };
  projeto.pontos.push(poste, trafo);
  const trecho: Trecho = {
    id: "t1",
    classe: "indefinida",
    estilo: "rede",
    dePontoId: "p1",
    aPontoId: "p2",
    caminho: [poste.wgs84, trafo.wgs84],
    origem: "web",
  };
  projeto.trechos.push(trecho);
  const dxf = gerarDxfCadastro(projeto);

  it("é um DXF R12 com as seções e EOF", () => {
    expect(dxf).toContain("AC1009");
    expect(dxf).toContain("HEADER");
    expect(dxf).toContain("ENTITIES");
    expect(dxf.trimEnd().endsWith("EOF")).toBe(true);
  });

  it("declara as camadas do pack Elektro", () => {
    expect(dxf).toContain("111-PONTO_SIGNIFICATIVO");
    expect(dxf).toContain("115-UNIDADE_TRANSFORMADORA");
    expect(dxf).toContain("113-ALIMENTADOR_PRIMARIO");
    expect(dxf).toContain("3-PONTOS_SIGNIFICATIVO");
  });

  it("posiciona o poste na coordenada UTM (metros) exata", () => {
    const u = paraUtm(poste.wgs84);
    expect(dxf).toContain(u.easting.toFixed(3)); // 597703.181
    expect(dxf).toContain(u.northing.toFixed(3)); // 7709190.960
  });

  it("gera CIRCLE (pontos), LINE (rede) e TEXT (número)", () => {
    expect(dxf).toContain("CIRCLE");
    expect(dxf).toContain("LINE");
    expect(dxf).toContain("TEXT");
  });
});
