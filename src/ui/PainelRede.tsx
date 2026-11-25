import type { ProjetoMeta } from "../domain/model";

interface Props {
  meta: Pick<ProjetoMeta, "tipoRede">;
  onEditar: (patch: { tipoRede: "compacta" | "nua" }) => void;
  onFechar: () => void;
}

/** Painel de propriedades da rede: tipo (compacta/nua) e fases (1Ø/2Ø/3Ø). */
export function PainelRede({ meta, onEditar, onFechar }: Props) {
  const tipoRede = meta.tipoRede ?? "compacta";

  return (
    <aside className="painel">
      <div className="painel-topo">
        <strong>Tipo de rede</strong>
        <button className="painel-x" onClick={onFechar} aria-label="Fechar">
          ×
        </button>
      </div>

      <div className="campo">
        <span>Tecnologia</span>
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
          : "Condutores nus ACSR (SWAN/RAVEN/PENGUIN/LINNET). Estruturas N1/N4/N3. DIS-NOR-012/018."}
      </div>
    </aside>
  );
}
