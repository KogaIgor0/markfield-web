import { useEffect, useRef, useState } from "react";
import { BDGD_FONTES, BDGD_FONTES_DISPONIVEIS } from "../map/bdgd";

interface Props {
  onCriar: (nome: string, distribuidoraId: string) => void;
  onCancelar: () => void;
}

export function NovoProjetoModal({ onCriar, onCancelar }: Props) {
  const [nome, setNome] = useState("");
  const [distribuidoraId, setDistribuidoraId] = useState(BDGD_FONTES_DISPONIVEIS[0]?.id ?? "elektro");
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus no campo nome ao abrir
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Esc fecha
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancelar();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onCancelar]);

  const podeCriar = nome.trim().length > 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!podeCriar) return;
    onCriar(nome.trim(), distribuidoraId);
  };

  return (
    <div className="np-overlay" onClick={(e) => { if (e.target === e.currentTarget) onCancelar(); }}>
      <div className="np-modal" role="dialog" aria-modal="true" aria-label="Novo projeto">
        <div className="np-header">
          <span className="np-title">Novo projeto</span>
          <button className="np-close" onClick={onCancelar} aria-label="Fechar">✕</button>
        </div>

        <form className="np-body" onSubmit={handleSubmit}>
          {/* Nome */}
          <label className="np-field">
            <span className="np-label">Nome do projeto</span>
            <input
              ref={inputRef}
              className="np-input"
              type="text"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="ex: Ampliação Vila Nova – Trecho 3"
              autoComplete="off"
            />
          </label>

          {/* Distribuidora */}
          <label className="np-field">
            <span className="np-label">Distribuidora (BDGD)</span>
            <select
              className="np-select"
              value={distribuidoraId}
              onChange={(e) => setDistribuidoraId(e.target.value)}
            >
              <optgroup label="Disponíveis">
                {BDGD_FONTES_DISPONIVEIS.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.nome} — {f.uf}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Em breve">
                {BDGD_FONTES.filter((f) => !f.urls).map((f) => (
                  <option key={f.id} value={f.id} disabled>
                    {f.nome} — {f.uf}
                  </option>
                ))}
              </optgroup>
            </select>
          </label>

          <div className="np-actions">
            <button type="button" className="np-btn-cancel" onClick={onCancelar}>
              Cancelar
            </button>
            <button type="submit" className="np-btn-criar" disabled={!podeCriar}>
              Criar projeto
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
