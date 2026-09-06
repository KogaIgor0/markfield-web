/**
 * Contrato .mkf — Markfield Project File.
 *
 * Formato nativo do ecossistema (DRS RD-04). É um ZIP com:
 *   - manifest.json  → versão/app/data (metadados do pacote)
 *   - projeto.json   → o modelo íntegro COM IDs (domain/model.ts)
 *   - fotos/         → os arquivos de imagem referenciados
 *
 * ⚠️ CONTRATO COMPARTILHADO COM O APP. Qualquer mudança de campo aqui precisa
 * ser alinhada com o chat do app ANTES de implementar (DRS §5, "Regra de ouro").
 *
 * Este arquivo define o esquema e a leitura/escrita do JSON. O empacotamento
 * ZIP em si (com as fotos) fica numa camada de io/ que usa uma lib de zip;
 * aqui tratamos apenas da parte estruturada, que é a que exige contrato.
 */

import type { Projeto } from "./model";

/** Versão atual do contrato .mkf. Incrementar exige migração + alinhar com o app. */
export const MKF_VERSION = "1.0.0" as const;

/** Metadados do pacote .mkf (manifest.json). */
export interface MkfManifest {
  /** Versão do contrato .mkf que gerou este arquivo. */
  mkfVersion: string;
  /** Qual app/ferramenta gerou (ex.: "markfield-web/0.1.0", "markfield-app/1.0.2"). */
  geradoPor: string;
  /** Data de geração (ISO 8601). */
  geradoEm: string;
}

/** Estrutura completa do conteúdo estruturado de um .mkf. */
export interface MkfPayload {
  manifest: MkfManifest;
  projeto: Projeto;
}

/** Monta o payload estruturado a partir de um projeto em memória. */
export function montarMkf(projeto: Projeto, geradoPor: string): MkfPayload {
  return {
    manifest: {
      mkfVersion: MKF_VERSION,
      geradoPor,
      geradoEm: new Date().toISOString(),
    },
    projeto,
  };
}

/** Serializa o payload para os textos de manifest.json e projeto.json. */
export function serializarMkf(payload: MkfPayload): {
  manifestJson: string;
  projetoJson: string;
} {
  return {
    manifestJson: JSON.stringify(payload.manifest, null, 2),
    projetoJson: JSON.stringify(payload.projeto, null, 2),
  };
}

/**
 * Lê e valida (superficialmente) os JSONs de um .mkf.
 * A validação profunda de esquema entra depois (ex.: zod); por ora garantimos
 * o mínimo para falhar cedo e com mensagem clara.
 */
export function lerMkf(manifestJson: string, projetoJson: string): MkfPayload {
  const manifest = JSON.parse(manifestJson) as MkfManifest;
  const projeto = JSON.parse(projetoJson) as Projeto;

  if (!manifest.mkfVersion) {
    throw new Error("manifest.json inválido: falta mkfVersion.");
  }
  if (projeto.schemaVersion !== 1) {
    throw new Error(
      `projeto.json com schemaVersion não suportado: ${String(
        (projeto as { schemaVersion?: unknown }).schemaVersion,
      )}`,
    );
  }
  return { manifest, projeto };
}
