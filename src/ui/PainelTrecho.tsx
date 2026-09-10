import type { Trecho } from "../domain/model";
import type { PatchTrecho } from "../domain/edicao";
import { VAO_MAXIMO_M } from "../domain/vaos";

/** Painel do trecho selecionado: classe elétrica, comprimento do vão, observação. */

const CLASSES: { valor: Trecho["classe"]; rotulo: string }[] = [
  { valor: "indefinida", rotulo: "Indefinida" },
  { valor: "primaria", rotulo: "Primária" },
  { valor: "secundaria", rotulo: "Secundária" },
  { valor: "ramal", rotulo: "Ramal" },
];

interface Props {
  trecho: Trecho;
  /** Comprimento do vão em metros (quando o trecho liga dois postes). */
  comprimentoM?: number | null;
  onEditar: (patch: PatchTrecho) => void;
  onExcluir: () => void;
  onFechar: () => void;
}

export function PainelTrecho({ trecho, comprimentoM, onEditar, onExcluir, onFechar }: Props) {
  const longo = comprimentoM != null && comprimentoM > VAO_MAXIMO_M;
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

      {comprimentoM != null && (
        <div className="painel-vao">
          <div className="rede-linha">
            <span>Comprimento do vão</span>
            <strong>{comprimentoM.toFixed(1)} m</strong>
          </div>
          {longo && (
            <div className="vao-alerta">
              Acima de {VAO_MAXIMO_M} m — divida os vãos (botão “Dividir vãos”).
            </div>
          )}
        </div>
      )}

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
