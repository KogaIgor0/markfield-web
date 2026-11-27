import type { PosteBdgd, TrafoExistente } from "../domain/model";

interface Props {
  tipo: "poste" | "trafo";
  poste?: PosteBdgd;
  trafo?: TrafoExistente;
  modoMover: boolean;
  onExcluir: () => void;
  onMover: () => void;
  onAdicionarPonto: () => void;
  onFechar: () => void;
}

/** Painel do elemento BDGD existente selecionado (poste ou trafo capturado da BDGD). */
export function PainelElementoExistente({ tipo, poste, trafo, modoMover, onExcluir, onMover, onAdicionarPonto, onFechar }: Props) {
  const titulo = tipo === "poste" ? "Poste existente (BDGD)" : "Transformador existente (BDGD)";

  return (
    <aside className="painel">
      <div className="painel-topo">
        <strong>{titulo}</strong>
        <button className="painel-x" onClick={onFechar} aria-label="Fechar">×</button>
      </div>

      {/* Propriedades */}
      {tipo === "poste" && poste && (
        <div className="painel-info-bloco">
          {poste.codId   && <div className="pi-linha"><span>Código</span><strong>{poste.codId}</strong></div>}
          {poste.tipEst  && <div className="pi-linha"><span>Estrutura</span><strong>{String(poste.tipEst)}</strong></div>}
          {poste.altEst  && <div className="pi-linha"><span>Altura</span><strong>{poste.altEst} m</strong></div>}
          {poste.tipOpe  && <div className="pi-linha"><span>Operação</span><strong>{String(poste.tipOpe)}</strong></div>}
          {!poste.codId && !poste.tipEst && (
            <div className="pi-vazio">Sem atributos BDGD disponíveis</div>
          )}
        </div>
      )}
      {tipo === "trafo" && trafo && (
        <div className="painel-info-bloco">
          {trafo.label && <div className="pi-linha"><span>Código</span><strong>{trafo.label}</strong></div>}
          {!trafo.label && <div className="pi-vazio">Sem atributos BDGD disponíveis</div>}
        </div>
      )}

      {/* Ações */}
      <div className="painel-acoes-bloco">
        <button
          className={`btn-acao-existente${modoMover ? " ativo" : ""}`}
          onClick={onMover}
          title="Clique aqui e depois no mapa para mover o elemento para a posição correta"
        >
          {modoMover ? "▶ Clique no mapa para mover…" : "Mover"}
        </button>
        <button
          className="btn-acao-existente destaque"
          onClick={onAdicionarPonto}
          title="Cria um ponto de projeto nesta posição — permite ligar rede a partir daqui"
        >
          + Ponto de projeto aqui
        </button>
      </div>

      <div className="painel-acoes-nota">
        Use <strong>+ Ponto de projeto aqui</strong> para poder ligar ou derivar rede a partir deste poste/trafo.
      </div>

      <button className="btn-excluir" onClick={onExcluir}>
        Excluir da área capturada
      </button>
    </aside>
  );
}
