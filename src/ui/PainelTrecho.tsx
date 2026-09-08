import type { Trecho } from "../domain/model";
import type { PatchTrecho } from "../domain/edicao";

/** Painel do trecho selecionado: classe elétrica, observação e excluir. */

const CLASSES: { valor: Trecho["classe"]; rotulo: string }[] = [
  { valor: "indefinida", rotulo: "Indefinida" },
  { valor: "primaria", rotulo: "Primária" },
  { valor: "secundaria", rotulo: "Secundária" },
  { valor: "ramal", rotulo: "Ramal" },
];

interface Props {
  trecho: Trecho;
  onEditar: (patch: PatchTrecho) => void;
  onExcluir: () => void;
  onFechar: () => void;
}

export function PainelTrecho({ trecho, onEditar, onExcluir, onFechar }: Props) {
  return (
    <aside className="painel">
      <div className="painel-topo">
        <strong>Trecho de rede</strong>
        <button className="painel-x" onClick={onFechar} aria-label="Fechar">
          ×
        </button>
      </div>

      <label className="campo">
        <span>Classe elétrica</span>
        <select
          value={trecho.classe}
          onChange={(e) => onEditar({ classe: e.target.value as Trecho["classe"] })}
        >
          {CLASSES.map((c) => (
            <option key={c.valor} value={c.valor}>
              {c.rotulo}
            </option>
          ))}
        </select>
      </label>

      <label className="campo">
        <span>Observação</span>
        <textarea
          rows={2}
          defaultValue={trecho.observacao ?? ""}
          onBlur={(e) => onEditar({ observacao: e.target.value })}
        />
      </label>

      <div className="painel-info">
        {trecho.origem === "web" ? "Criado no Web" : "Do campo"}
        {trecho.caminho && ` · ${trecho.caminho.length} vértices`}
      </div>

      <button className="btn-excluir" onClick={onExcluir}>
        Excluir trecho
      </button>
    </aside>
  );
}
