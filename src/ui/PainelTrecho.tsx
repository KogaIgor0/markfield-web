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

interface VaoInfo {
  /** Nº de sub-vãos do vão a que este trecho pertence. */
  vaos: number;
  /** Comprimento total do vão (entre as pontas reais), em metros. */
  comprimentoM: number;
  /** Comprimento de cada sub-vão, em metros. */
  subVaoM: number;
}

interface Props {
  trecho: Trecho;
  /** Comprimento deste sub-trecho em metros (quando liga dois postes). */
  comprimentoM?: number | null;
  /** Info do vão inteiro a que o trecho pertence (para o ajuste por vão). */
  vaoInfo?: VaoInfo | null;
  /** +1 adiciona um poste ao vão; -1 remove. */
  onAjustarVao?: (delta: number) => void;
  onEditar: (patch: PatchTrecho) => void;
  onExcluir: () => void;
  onFechar: () => void;
}

export function PainelTrecho({
  trecho,
  comprimentoM,
  vaoInfo,
  onAjustarVao,
  onEditar,
  onExcluir,
  onFechar,
}: Props) {
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
          {vaoInfo && onAjustarVao && (
            <div className="vao-ajuste">
              <div className="rede-linha">
                <span>Vão dividido em</span>
                <strong>
                  {vaoInfo.vaos}× ~{vaoInfo.subVaoM.toFixed(0)} m
                </strong>
              </div>
              <div className="vao-ajuste-btns">
                <button
                  className="btn-mini-sec"
                  onClick={() => onAjustarVao(-1)}
                  disabled={vaoInfo.vaos <= 1}
                  title="Um poste a menos neste vão (vãos mais longos)"
                >
                  − poste
                </button>
                <button
                  className="btn-mini-sec"
                  onClick={() => onAjustarVao(1)}
                  title="Um poste a mais neste vão (vãos mais curtos — ex.: interferência no campo)"
                >
                  + poste
                </button>
              </div>
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
