import JSZip from "jszip";
import { LIMITE_PRECISAO_CONFIAVEL_M, parseKml, type ConteudoKml } from "./kml";
import { novoId } from "../domain/ids";
import { lerMkf, MKF_VERSION } from "../domain/mkf";
import { projetoVazio, type Foto, type Projeto } from "../domain/model";
import { reconstruirRede } from "../domain/reconstruir";

/**
 * Importador do pacote "exportar tudo" do app (ZIP com KML + CSV/TXT + fotos/).
 *
 * Fonte de verdade por elemento:
 *  - Pontos e linhas → KML (tem ExtendedData estruturado).
 *  - Fotos → `fotos/fotos.csv` quando presente (precisão e data com mais
 *    dígitos que o KML, além da coluna de observação); senão, as fotos do KML.
 *  - Imagens → blobs `fotos/*.jpg`, servidas como object URLs no navegador.
 *  - `criado_em` dos pontos (segundos) → CSV principal, cruzado pelo número.
 */

export interface RelatorioImport {
  nomeProjeto?: string;
  pontos: number;
  fotos: number;
  fotosBaixaConfianca: number;
  trechos: number;
  linhasLivres: number;
  avisos: string[];
}

export interface ResultadoImport {
  projeto: Projeto;
  /**
   * nome-base da foto ("Foto1") → bytes da imagem. Guardamos os BYTES (não uma
   * object URL) para poder reempacotar no `.mkf` na exportação. A UI cria as
   * URLs de exibição a partir daqui.
   */
  imagens: Map<string, Uint8Array>;
  relatorio: RelatorioImport;
}

function semBom(s: string): string {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

function linhas(texto: string): string[] {
  return semBom(texto)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

/** Fotos a partir do fotos.csv: nome;latitude;longitude;precisao_m;data;observacao */
function fotosDeCsv(texto: string): Foto[] {
  const [, ...corpo] = linhas(texto); // descarta cabeçalho
  const out: Foto[] = [];
  for (const linha of corpo) {
    const p = linha.split(";");
    if (p.length < 3) continue;
    const lat = Number(p[1]);
    const lng = Number(p[2]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const precisaoM = p[3] ? Number(p[3]) : undefined;
    const nome = p[0];
    out.push({
      id: novoId("ft"),
      nome,
      arquivo: `fotos/${nome}.jpg`,
      wgs84: { lat, lng },
      precisaoM: Number.isFinite(precisaoM) ? precisaoM : undefined,
      capturadaEm: p[4] || undefined,
      observacao: p.slice(5).join(";") || undefined,
      baixaConfianca:
        precisaoM != null && Number.isFinite(precisaoM) && precisaoM >= LIMITE_PRECISAO_CONFIAVEL_M,
    });
  }
  return out;
}

/** Cruza o CSV principal para enriquecer `criadoEm` (segundos) por número. */
function criadoEmPorNumero(texto: string): Map<string, string> {
  const mapa = new Map<string, string>();
  const [, ...corpo] = linhas(texto);
  for (const linha of corpo) {
    const p = linha.split(";").length > 1 ? linha.split(";") : linha.split(",");
    if (p.length < 2) continue;
    const numero = String(Number(p[0])); // "001" → "1"
    mapa.set(numero, p[p.length - 1]); // Criado_em é a última coluna
  }
  return mapa;
}

function montarProjeto(conteudo: ConteudoKml, fotos: Foto[]): Projeto {
  const projeto = projetoVazio(conteudo.nomeProjeto ?? "Projeto importado");
  projeto.pontos = conteudo.pontos;
  projeto.trechos = conteudo.trechos;
  projeto.linhasLivres = conteudo.linhasLivres;
  projeto.fotos = fotos;
  // A rede do app vem como linha solta (sem ligar postes). Reconstrói a topologia
  // na importação para o motor (dividir/estrutura/esforço) já enxergar a rede.
  return reconstruirRede(projeto).projeto;
}

function montarRelatorio(projeto: Projeto, avisos: string[]): RelatorioImport {
  return {
    nomeProjeto: projeto.meta.nome,
    pontos: projeto.pontos.length,
    fotos: projeto.fotos.length,
    fotosBaixaConfianca: projeto.fotos.filter((f) => f.baixaConfianca).length,
    trechos: projeto.trechos.length,
    linhasLivres: projeto.linhasLivres.length,
    avisos,
  };
}

/** Importa um KML solto (sem imagens). */
export function importarKml(texto: string): ResultadoImport {
  const conteudo = parseKml(texto);
  const projeto = montarProjeto(conteudo, conteudo.fotos);
  return {
    projeto,
    imagens: new Map<string, Uint8Array>(),
    relatorio: montarRelatorio(projeto, conteudo.avisos),
  };
}

/** Lê os bytes das imagens de `fotos/*.jpg`, indexados pelo nome-base. */
async function lerImagens(arquivos: JSZip.JSZipObject[]): Promise<Map<string, Uint8Array>> {
  const imagens = new Map<string, Uint8Array>();
  for (const f of arquivos) {
    if (!/fotos\/.+\.jpe?g$/i.test(f.name)) continue;
    const base = f.name.replace(/^.*\//, "").replace(/\.[^.]+$/, "");
    imagens.set(base, await f.async("uint8array"));
  }
  return imagens;
}

/**
 * Reabre um `.mkf` gerado pelo próprio Web (ou pelo app). Aqui o `projeto.json`
 * JÁ é o nosso modelo com IDs — não há KML para interpretar, só validar e ler.
 */
export async function importarMkf(entrada: File | ArrayBuffer | Uint8Array): Promise<ResultadoImport> {
  const zip = await JSZip.loadAsync(entrada);
  const arquivos = Object.values(zip.files).filter((f) => !f.dir);
  const projetoF = arquivos.find((f) => /(^|\/)projeto\.json$/i.test(f.name));
  if (!projetoF) throw new Error("Arquivo .mkf inválido: falta projeto.json.");
  const manifestF = arquivos.find((f) => /(^|\/)manifest\.json$/i.test(f.name));
  const manifestJson = manifestF
    ? await manifestF.async("string")
    : JSON.stringify({ mkfVersion: MKF_VERSION, geradoPor: "desconhecido", geradoEm: "" });
  const { projeto } = lerMkf(manifestJson, await projetoF.async("string"));
  const imagens = await lerImagens(arquivos);
  return { projeto, imagens, relatorio: montarRelatorio(projeto, []) };
}

/** Importa o pacote completo do app (ZIP). */
export async function importarPacote(
  entrada: File | ArrayBuffer | Uint8Array,
): Promise<ResultadoImport> {
  const zip = await JSZip.loadAsync(entrada);
  const arquivos = Object.values(zip.files).filter((f) => !f.dir);

  const arqKml = arquivos.find((f) => /\.kml$/i.test(f.name));
  if (!arqKml) throw new Error("Pacote sem arquivo .kml — não é um export do Markfield?");
  const conteudo = parseKml(await arqKml.async("string"));

  // Imagens → bytes, indexados pelo nome-base ("Foto1").
  const imagens = await lerImagens(arquivos);

  // Fotos: prefere fotos.csv (mais rico); senão, as do KML.
  const arqFotosCsv = arquivos.find((f) => /fotos\.csv$/i.test(f.name));
  const fotos = arqFotosCsv ? fotosDeCsv(await arqFotosCsv.async("string")) : conteudo.fotos;

  // Enriquecimento: criado_em (segundos) do CSV principal.
  const arqCsv = arquivos.find((f) => /\.csv$/i.test(f.name) && !/fotos\.csv$/i.test(f.name));
  if (arqCsv) {
    const mapa = criadoEmPorNumero(await arqCsv.async("string"));
    for (const p of conteudo.pontos) {
      if (p.numero && mapa.has(p.numero)) p.criadoEm = mapa.get(p.numero);
    }
  }

  const projeto = montarProjeto(conteudo, fotos);
  return { projeto, imagens, relatorio: montarRelatorio(projeto, conteudo.avisos) };
}
