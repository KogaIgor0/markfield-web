/**
 * PainelCamadas — controle de visibilidade das camadas BDGD (rede existente).
 *
 * Mostra o nome da concessionária selecionada, os toggles de camada
 * (Rede MT / Rede BT / Transformadores / Postes) e o botão "Carregar rede".
 * Quando os dados ainda não estão processados, exibe o banner "em breve".
 */

import { BDGD_CAMADAS, BDGD_FONTES, type BdgdLayerId } from "../map/bdgd";

interface PainelCamadasProps {
  /** ID da distribuidora ativa (ex.: "elektro"). */
  fonteId: string;
  /** Camadas atualmente visíveis. */
  ativas: Set<string>;
  /** Carregamento de dados em curso. */
  carregando?: boolean;
  onToggle: (id: BdgdLayerId) => void;
  onCarregar: () => void;
  onFechar: () => void;
}

export function PainelCamadas({
  fonteId,
  ativas,
  carregando = false,
  onToggle,
  onCarregar,
  onFechar,
}: PainelCamadasProps) {
  const fonte = BDGD_FONTES.find((f) => f.id === fonteId);
  const temDados = Boolean(fonte?.urls);

  return (
    <div className="painel-camadas">
      {/* Cabeçalho */}
      <div className="painel-camadas-header">
        <div className="painel-camadas-titulo">
          <span className="painel-camadas-icon">🗺</span>
          <span>Rede existente</span>
        </div>
        <button
          className="btn-fechar-painel"
          onClick={onFechar}
          aria-label="Fechar painel de camadas"
          title="Fechar"
        >
          ✕
        </button>
      </div>

      {/* Concessionária */}
      {fonte && (
        <div className="painel-camadas-conc">
          <span className="conc-badge">{fonte.uf}</span>
          <span className="conc-nome">{fonte.nome}</span>
        </div>
      )}

      {/* Camadas */}
      <div className="painel-camadas-lista">
        <div className="painel-camadas-secao">CAMADAS</div>
        {BDGD_CAMADAS.map((c) => (
          <label key={c.id} className="camada-item">
            <input
              type="checkbox"
              checked={ativas.has(c.id)}
              onChange={() => onToggle(c.id)}
              className="camada-check"
            />
            <span
              className="camada-cor"
              style={{ background: c.cor }}
              aria-hidden="true"
            />
            <span className="camada-label">{c.label}</span>
          </label>
        ))}
      </div>

      {/* Status dos dados */}
      {!temDados && (
        <div className="bdgd-sem-dados">
          <div className="sem-dados-icon">⚡</div>
          <div className="sem-dados-texto">
            Dados BDGD em processamento.
            <br />
            <span className="sem-dados-sub">Estará disponível em breve.</span>
          </div>
        </div>
      )}

      {/* Botão carregar */}
      <button
        className={`btn-carregar-rede${!temDados ? " btn-desabilitado" : ""}`}
        onClick={onCarregar}
        disabled={!temDados || carregando}
        title={!temDados ? "Dados BDGD ainda não processados" : "Carregar rede nesta área"}
      >
        {carregando ? (
          <>
            <span className="spinner-mini" />
            Carregando…
          </>
        ) : (
          <>
            <span>↺</span>
            Carregar rede nesta área
          </>
        )}
      </button>

      {/* Rodapé: fonte do dado */}
      <div className="painel-camadas-fonte">
        Fonte: BDGD ANEEL{fonte ? ` · ${fonte.nome}` : ""} · snapshot anual
      </div>
    </div>
  );
}
