import type { ProjetoMeta } from "../domain/model";

interface Props {
  meta: ProjetoMeta;
  onEditar: (patch: Partial<ProjetoMeta>) => void;
  onFechar: () => void;
}

/** Painel de propriedades da rede: tipo (compacta/nua) e fases (1Ø/2Ø/3Ø). */
export function PainelRede({ meta, onEditar, onFechar }: Props) {
  const tipoRede = meta.tipoRede ?? "compacta";
  const fases = meta.fases ?? 3;

  return (
    <aside className="painel">
      <div className="painel-topo">
        <strong>Propriedades da rede</strong>
        <button className="painel-x" onClick={onFechar} aria-label="Fechar">
          ×
        </button>
      </div>

      <div className="campo">
        <span>Tipo de rede</span>
        <div className="toggle-grupo">
          <button
            className={`toggle-btn${tipoRede === "compacta" ? " ativo" : ""}`}
            onClick={() => onEditar({ tipoRede: "compacta" })}
            title="Rede Compacta — cabos cobertos, estruturas CE (DIS-NOR-013)"
          >
            Compacta
          </button>
          <button
            className={`toggle-btn${tipoRede === "nua" ? " ativo" : ""}`}
            onClick={() => onEditar({ tipoRede: "nua" })}
            title="Rede nua — condutores nus, estruturas N (DIS-NOR-018). Rural."
          >
            Rural / nua
          </button>
        </div>
      </div>

      <div className="painel-rede-desc">
        {tipoRede === "compacta"
          ? "Cabos cobertos (A35P…). Estruturas CE1/CE2/CE4/CE3-CE3. DIS-NOR-013."
          : "Condutores nus ACSR (SWAN/RAVEN/PENGUIN/LINNET). Estruturas N1/N4/N3. DIS-NOR-012/018. Rural."}
      </div>

      <div className="campo">
        <span>Fases do tronco principal</span>
        <div className="toggle-grupo">
          {([1, 2, 3] as const).map((f) => (
            <button
              key={f}
              className={`toggle-btn${fases === f ? " ativo" : ""}`}
              onClick={() => onEditar({ fases: f })}
              title={f === 1 ? "Monofásico" : f === 2 ? "Bifásico" : "Trifásico"}
            >
              {f}Ø
            </button>
          ))}
        </div>
      </div>

      <div className="painel-rede-desc">
        {fases === 1
          ? "Rede monofásica — 1 para-raio/poste PR, seccionadora unipolar."
          : fases === 2
            ? "Rede bifásica — 2 para-raios/poste PR, seccionadora bipolar."
            : "Rede trifásica — 3 para-raios/poste PR, seccionadora tripolar."}
      </div>
    </aside>
  );
}
