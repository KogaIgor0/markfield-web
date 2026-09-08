import JSZip from "jszip";
import { montarMkf, serializarMkf } from "../domain/mkf";
import type { Projeto } from "../domain/model";

/**
 * Exportação `.mkf` (Fase 2 — salvar).
 *
 * Reempacota o projeto editado no formato nativo: ZIP com `manifest.json`,
 * `projeto.json` (o modelo COM IDs) e `fotos/`. É o que dá permanência à edição
 * e o que fecha o ciclo importar → editar → salvar → reabrir sem perder nada.
 */

const APP_ID = "markfield-web/0.1.0";

/** Monta o ZIP do `.mkf` (testável fora do navegador). */
export function montarZipMkf(projeto: Projeto, fotos: Map<string, Uint8Array>): JSZip {
  const zip = new JSZip();
  const { manifestJson, projetoJson } = serializarMkf(montarMkf(projeto, APP_ID));
  zip.file("manifest.json", manifestJson);
  zip.file("projeto.json", projetoJson);
  for (const foto of projeto.fotos) {
    if (!foto.nome) continue;
    const data = fotos.get(foto.nome);
    if (data) zip.file(foto.arquivo, data);
  }
  return zip;
}

/** Gera o `.mkf` como Blob, pronto para download no navegador. */
export function exportarMkf(projeto: Projeto, fotos: Map<string, Uint8Array>): Promise<Blob> {
  return montarZipMkf(projeto, fotos).generateAsync({
    type: "blob",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
}

/** Nome de arquivo seguro a partir do nome do projeto. */
export function nomeArquivoMkf(projeto: Projeto): string {
  const base = (projeto.meta.nome || "projeto").replace(/[^\p{L}\p{N}_-]+/gu, "_");
  return `${base}.mkf`;
}

/** Dispara o download de um Blob no navegador. */
export function baixar(blob: Blob, nomeArquivo: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nomeArquivo;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
