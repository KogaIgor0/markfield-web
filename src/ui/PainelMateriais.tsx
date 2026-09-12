import type { ResumoMateriais } from "../domain/materiais";

/**
 * Painel "Materiais" (B5, v1) — quantitativo do projeto que o sistema calcula
 * do modelo. Não é a lista de peças por estrutura (ND.01, a transcrever). Os
 * espaçadores são estimados (~a cada 9 m); refinar com o Quadro 6 da norma.
 */

interface Props {
  resumo: ResumoMateriais;
  onFechar: () => void;
}

export function PainelMateriais({ resumo, onFechar }: Props) {
  const m = (n: number) => `${n.toFixed(0)} m`;
  return (
    <aside className="painel painel-materiais">
      <div className="painel-topo">
        <strong>Materiais (quantitativo)</strong>
        <button className="painel-x" onClick={onFechar} aria-label="Fechar">
          ×
        </button>
      </div>

      <div className="mat-grid">
        <div className="mat-linha">
          <span>Postes</span>
          <strong>{resumo.postes}</strong>
        </div>
        <div className="mat-linha">
          <span>Trechos (ligados)</span>
          <strong>{resumo.trechos}</strong>
        </div>
        <div className="mat-linha">
          <span>Comprimento da rede</span>
          <strong>{m(resumo.comprimentoRedeM)}</strong>
        </div>
      </div>

      <div className="painel-sub">Postes por tipo (altura/carga)</div>
      <div className="mat-grid">
        {resumo.postesPorTipo.map((p) => (
          <div key={p.codigo} className="mat-linha">
            <span>{p.rotulo}</span>
            <strong>{p.n}</strong>
          </div>
        ))}
      </div>

      <div className="painel-sub">Estruturas</div>
      {resumo.estruturas.length === 0 ? (
        <div className="mat-vazio">Sem estruturas classificadas (marque a fonte e ligue os postes).</div>
      ) : (
        <div className="mat-grid">
          {resumo.estruturas.map((e) => (
            <div key={e.codigo} className="mat-linha">
              <span>{e.codigo}</span>
              <strong>{e.n}</strong>
            </div>
          ))}
        </div>
      )}

      <div className="painel-sub">Cabo (comprimento)</div>
      {resumo.cabos.length === 0 ? (
        <div className="mat-vazio">Sem trechos de rede.</div>
      ) : (
        <div className="mat-grid">
          {resumo.cabos.map((c) => (
            <div key={c.codigo} className="mat-linha">
              <span>
                {c.codigo}
                {c.provisorio ? " ⚠︎" : ""}
              </span>
              <strong>{m(c.comprimentoM)}</strong>
            </div>
          ))}
        </div>
      )}

      <div className="painel-sub">Itens</div>
      <div className="mat-grid">
        <div className="mat-linha">
          <span>Espaçadores (estimado)</span>
          <strong>{resumo.espacadores}</strong>
        </div>
        <div className="mat-linha">
          <span>Estais (+ isolador de estai)</span>
          <strong>{resumo.estais}</strong>
        </div>
        <div className="mat-linha">
          <span>Para-raios</span>
          <strong>{resumo.pararaios}</strong>
        </div>
        <div className="mat-linha">
          <span>Estribos de espera (300 m)</span>
          <strong>{resumo.estribos}</strong>
        </div>
      </div>

      <div className="painel-info">
        Quantitativo automático. Espaçadores estimados (~9 m) — a refinar pelo Quadro 6. Lista
        detalhada de peças por estrutura (ND.01) entra depois. Cabos ⚠︎ têm tração provisória.
      </div>
    </aside>
  );
}
