import { useState } from "react";
import type { Trecho } from "../domain/model";
import type { PatchTrecho } from "../domain/edicao";
import { VAO_MAXIMO_M, VAO_MINIMO_M } from "../domain/vaos";
import { CABOS, CABO_PADRAO, acharCabo } from "../domain/cabos";

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
  /** Redivide SÓ este vão para sub-vãos ≤ alvo (m). */
  onRedividirVao?: (alvoM: number) => void;
  onEditar: (patch: PatchTrecho) => void;
  onExcluir: () => void;
  onFechar: () => void;
}

export function PainelTrecho({
  trecho,
  comprimentoM,
  vaoInfo,
  onAjustarVao,
  onRedividirVao,
  onEditar,
  onExcluir,
  onFechar,
}: Props) {
  const longo = comprimentoM != null && comprimentoM > VAO_MAXIMO_M;
  const [alvo, setAlvo] = useState<number>(vaoInfo ? Math.round(vaoInfo.subVaoM) : VAO_MAXIMO_M);
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
        <span>Cabo</span>
        <select
          value={trecho.tipoCabo ?? CABO_PADRAO}
          onChange={(e) => onEditar({ tipoCabo: e.target.value })}
        >
          {CABOS.map((c) => (
            <option key={c.codigo} value={c.codigo}>
              {c.rotulo}
            </option>
          ))}
        </select>
      </label>
      {!acharCabo(trecho.tipoCabo ?? CABO_PADRAO).tracaoConfirmada && (
        <div className="vao-alerta">
          Tração deste cabo ainda <strong>provisória</strong> — a confirmar na norma (só o A35P está validado).
        </div>
      )}

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
              <div className="painel-sub">Redividir só este trecho</div>
              {onRedividirVao && (
                <div className="vao-alvo-linha">
                  <span>Vão alvo</span>
                  <input
                    type="number"
                    className="vao-input"
                    min={VAO_MINIMO_M}
                    max={VAO_MAXIMO_M}
                    step={5}
                    value={alvo}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      if (Number.isFinite(n)) {
                        setAlvo(Math.min(VAO_MAXIMO_M, Math.max(VAO_MINIMO_M, Math.round(n))));
                      }
                    }}
                  />
                  <span>m</span>
                  <button className="btn-mini-sec" onClick={() => onRedividirVao(alvo)}>
                    Aplicar
                  </button>
                </div>
              )}
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
