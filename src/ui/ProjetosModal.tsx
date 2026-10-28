/**
 * Modal de gerenciamento de projetos.
 *
 * Exibe a lista de projetos salvos localmente (IndexedDB), com busca por
 * nome/distribuidora, ação de abrir e exclusão da entrada local.
 * O arquivo .mkf baixado pelo usuário não é afetado pela exclusão.
 */

import { useEffect, useRef, useState } from "react";
import { listarProjetos, deletarProjetoDb, type ProjetoArquivado } from "../db/projetosDb";

interface Props {
  /** Chamado quando o usuário clica "Abrir" em um projeto da lista. */
  onAbrir: (entry: ProjetoArquivado) => void;
  /** Chamado quando o usuário quer abrir um arquivo do disco. */
  onAbrirArquivo: () => void;
  /** Fecha o modal sem fazer nada. */
  onFechar: () => void;
}

function formatarData(iso: string): string {
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function ProjetosModal({ onAbrir, onAbrirArquivo, onFechar }: Props) {
  const [projetos, setProjetos] = useState<ProjetoArquivado[]>([]);
  const [busca, setBusca] = useState("");
  const [carregando, setCarregando] = useState(true);
  const buscaRef = useRef<HTMLInputElement>(null);

  // Carrega lista da IndexedDB ao abrir o modal.
  useEffect(() => {
    listarProjetos()
      .then(setProjetos)
      .catch(() => setProjetos([]))
      .finally(() => setCarregando(false));
  }, []);

  // Foca o campo de busca e fecha com Esc.
  useEffect(() => {
    buscaRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onFechar();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onFechar]);

  const excluir = async (dbId: string, nome: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm(`Remover "${nome}" do histórico?\nO arquivo .mkf salvo no seu computador não é afetado.`))
      return;
    await deletarProjetoDb(dbId);
    setProjetos((p) => p.filter((x) => x.dbId !== dbId));
  };

  const filtrados =
    busca.trim() === ""
      ? projetos
      : projetos.filter(
          (p) =>
            p.nome.toLowerCase().includes(busca.toLowerCase()) ||
            p.distribuidoraId.toLowerCase().includes(busca.toLowerCase()),
        );

  return (
    <div
      className="pm-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onFechar();
      }}
    >
      <div className="pm-modal" role="dialog" aria-modal="true" aria-label="Projetos">
        {/* Cabeçalho */}
        <div className="pm-header">
          <span className="pm-title">Projetos</span>
          <button className="pm-fechar" onClick={onFechar} aria-label="Fechar">
            ×
          </button>
        </div>

        {/* Barra de ferramentas: busca + abrir arquivo */}
        <div className="pm-toolbar">
          <input
            ref={buscaRef}
            className="pm-busca"
            type="search"
            placeholder="Buscar por nome ou distribuidora…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
          <button
            className="pm-abrir-arquivo"
            onClick={() => {
              onAbrirArquivo();
              onFechar();
            }}
          >
            Abrir arquivo…
          </button>
        </div>

        {/* Lista */}
        <div className="pm-lista">
          {carregando && <div className="pm-vazio">Carregando…</div>}

          {!carregando && filtrados.length === 0 && (
            <div className="pm-vazio">
              {projetos.length === 0 ? (
                <>
                  <strong>Nenhum projeto no histórico ainda.</strong>
                  <br />
                  Crie um novo projeto ou abra um arquivo .mkf — ele aparecerá aqui após salvar.
                </>
              ) : (
                "Nenhum projeto encontrado para esta busca."
              )}
            </div>
          )}

          {filtrados.map((p) => (
            <div key={p.dbId} className="pm-item" onClick={() => onAbrir(p)}>
              <div className="pm-item-esquerda">
                <div className="pm-item-topo">
                  <span className="pm-item-dist">{p.distribuidoraId.toUpperCase()}</span>
                  <span className="pm-item-nome">{p.nome}</span>
                </div>
                <div className="pm-item-meta">
                  {p.pontos} poste{p.pontos !== 1 ? "s" : ""} ·{" "}
                  {p.trechos} trecho{p.trechos !== 1 ? "s" : ""} ·{" "}
                  {formatarData(p.atualizadoEm)}
                </div>
              </div>
              <div className="pm-item-direita" onClick={(e) => e.stopPropagation()}>
                <button className="pm-btn-abrir" onClick={() => onAbrir(p)}>
                  Abrir
                </button>
                <button
                  className="pm-btn-excluir"
                  title="Remover do histórico"
                  onClick={(e) => void excluir(p.dbId, p.nome, e)}
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
