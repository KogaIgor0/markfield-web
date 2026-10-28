/**
 * Histórico local de projetos — IndexedDB.
 *
 * Cada entrada é um registro leve + o blob .mkf completo, suficiente para
 * reabrir o projeto exatamente como foi salvo pela última vez.
 */

const DB_NAME = "markfield-projetos";
const DB_VERSION = 1;
const STORE = "projetos";

export interface ProjetoArquivado {
  /** Chave primária — UUID gerado na criação. */
  dbId: string;
  /** Nome do projeto (espelho de projeto.meta.nome). */
  nome: string;
  /** Id da distribuidora BDGD associada (ex.: "elektro"). */
  distribuidoraId: string;
  /** ISO 8601 — atualizado a cada "Salvar". */
  atualizadoEm: string;
  /** Contagem de postes na última gravação. */
  pontos: number;
  /** Contagem de trechos na última gravação. */
  trechos: number;
  /**
   * Conteúdo completo do arquivo .mkf (Blob zip).
   * IDB armazena Blobs nativamente — sem codificação extra.
   */
  mkfBlob: Blob;
}

// ---------------------------------------------------------------------------
// Helpers internos
// ---------------------------------------------------------------------------

function abrirDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE, { keyPath: "dbId" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------

/** Lista todos os projetos salvos, do mais recente ao mais antigo. */
export async function listarProjetos(): Promise<ProjetoArquivado[]> {
  const db = await abrirDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => {
      const all = req.result as ProjetoArquivado[];
      all.sort((a, b) => b.atualizadoEm.localeCompare(a.atualizadoEm));
      resolve(all);
    };
    req.onerror = () => reject(req.error);
  });
}

/** Cria ou substitui um registro (upsert pelo dbId). */
export async function salvarProjetoDb(entry: ProjetoArquivado): Promise<void> {
  const db = await abrirDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(entry);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Carrega um registro pelo dbId (undefined se não existir). */
export async function carregarProjetoDb(dbId: string): Promise<ProjetoArquivado | undefined> {
  const db = await abrirDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(dbId);
    req.onsuccess = () => resolve(req.result as ProjetoArquivado | undefined);
    req.onerror = () => reject(req.error);
  });
}

/** Remove um registro permanentemente. */
export async function deletarProjetoDb(dbId: string): Promise<void> {
  const db = await abrirDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(dbId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Gera um UUID v4 para usar como dbId. */
export function gerarDbId(): string {
  return crypto.randomUUID();
}
