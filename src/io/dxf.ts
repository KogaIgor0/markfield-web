import type { LatLng, Projeto } from "../domain/model";
import { paraUtm } from "../geo/utm";
import { camadaDoPonto, PACK_ELEKTRO, type CamadaDxf, type PackConcessionaria } from "../packs/elektro";

/**
 * Renderizador de DXF de cadastro (Fase 3, fatia 1).
 *
 * Gera um DXF **georreferenciado em UTM SIRGAS 2000 (metros)** — postes, rede e
 * transformadores nas camadas do pack da concessionária. É DXF R12 (AC1009)
 * escrito à mão: formato texto simples, universalmente aceito por qualquer CAD,
 * sem dependências. As convenções (camadas, cores, símbolos) vêm do Domain Pack.
 *
 * Nota: R12 é "unitless"; as coordenadas saem em metros (UTM). Ao abrir no CAD,
 * um ZOOM EXTENTS mostra a rede na posição real do mundo.
 */

function rec(code: number, value: string | number): string {
  return `${code}\n${value}\n`;
}

/** Converte WGS84 → [X,Y] em UTM metros (X=Este, Y=Norte). */
function xy(c: LatLng): [number, number] {
  const u = paraUtm(c);
  return [u.easting, u.northing];
}

function n(v: number): string {
  return v.toFixed(3);
}

function linha(cam: string, a: [number, number], b: [number, number]): string {
  return (
    rec(0, "LINE") +
    rec(8, cam) +
    rec(10, n(a[0])) + rec(20, n(a[1])) + rec(30, "0.0") +
    rec(11, n(b[0])) + rec(21, n(b[1])) + rec(31, "0.0")
  );
}

function circulo(cam: string, c: [number, number], raio: number): string {
  return (
    rec(0, "CIRCLE") +
    rec(8, cam) +
    rec(10, n(c[0])) + rec(20, n(c[1])) + rec(30, "0.0") +
    rec(40, n(raio))
  );
}

function texto(cam: string, c: [number, number], altura: number, s: string): string {
  return (
    rec(0, "TEXT") +
    rec(8, cam) +
    rec(10, n(c[0])) + rec(20, n(c[1])) + rec(30, "0.0") +
    rec(40, n(altura)) +
    rec(1, s)
  );
}

function tabelaCamadas(camadas: CamadaDxf[]): string {
  // "0" sempre presente + as do pack (sem repetir).
  const vistas = new Map<string, CamadaDxf>();
  vistas.set("0", { nome: "0", cor: 7 });
  for (const c of camadas) if (!vistas.has(c.nome)) vistas.set(c.nome, c);
  let out = rec(0, "TABLE") + rec(2, "LAYER") + rec(70, vistas.size);
  for (const c of vistas.values()) {
    out +=
      rec(0, "LAYER") + rec(2, c.nome) + rec(70, 0) + rec(62, c.cor) + rec(6, "CONTINUOUS");
  }
  out += rec(0, "ENDTAB");
  return out;
}

/** Gera o DXF de cadastro do projeto. */
export function gerarDxfCadastro(
  projeto: Projeto,
  pack: PackConcessionaria = PACK_ELEKTRO,
): string {
  const cam = pack.camadas;
  const usadas: CamadaDxf[] = [
    cam.poste,
    cam.posteGenerico,
    cam.transformador,
    cam.redePrimaria,
    cam.linhaAuxiliar,
    cam.numero,
  ];

  let ent = "";

  // Trechos de rede (primária).
  for (const t of projeto.trechos) {
    const caminho = t.caminho ?? [];
    for (let i = 0; i + 1 < caminho.length; i++) {
      ent += linha(cam.redePrimaria.nome, xy(caminho[i]), xy(caminho[i + 1]));
    }
  }
  // Linhas livres / cercas (contexto).
  for (const l of projeto.linhasLivres) {
    for (let i = 0; i + 1 < l.caminho.length; i++) {
      ent += linha(cam.linhaAuxiliar.nome, xy(l.caminho[i]), xy(l.caminho[i + 1]));
    }
  }
  // Pontos (poste/genérico/transformador) + número.
  for (const p of projeto.pontos) {
    const c = xy(p.wgs84);
    const camada = camadaDoPonto(pack, p.tipo);
    const raio = p.tipo === "transformador" ? pack.raioTrafoM : pack.raioPosteM;
    ent += circulo(camada.nome, c, raio);
    if (p.numero) {
      ent += texto(cam.numero.nome, [c[0] + raio, c[1] + raio], pack.alturaTextoM, p.numero);
    }
  }

  return (
    rec(0, "SECTION") + rec(2, "HEADER") +
    rec(9, "$ACADVER") + rec(1, "AC1009") +
    rec(9, "$INSUNITS") + rec(70, 6) + // 6 = metros
    rec(0, "ENDSEC") +
    rec(0, "SECTION") + rec(2, "TABLES") +
    tabelaCamadas(usadas) +
    rec(0, "ENDSEC") +
    rec(0, "SECTION") + rec(2, "ENTITIES") +
    ent +
    rec(0, "ENDSEC") +
    rec(0, "EOF")
  );
}
