import { useMemo, useState } from "react";
import type { Ponto } from "../domain/model";
import type { DirecoesPonto } from "../domain/inserir";

/**
 * Barra do modo "Inserir ponto medido" (E-04). Depois de escolher o poste de
 * referência no mapa, o projetista escolhe a direção (sentido carga / para um
 * vizinho / azimute livre) e a distância; o poste é cravado no alinhamento.
 */

export type EspecInsercao =
  | { tipo: "vao"; vizinhoId: string; distanciaM: number }
  | { tipo: "estender"; azimuteGraus: number; distanciaM: number };

interface Props {
  refPonto: Ponto;
  direcoes: DirecoesPonto;
  onInserir: (spec: EspecInsercao) => void;
  onTrocarReferencia: () => void;
  onCancelar: () => void;
}

const ROTULO_SENTIDO: Record<string, string> = {
  carga: "sentido carga",
  fonte: "sentido fonte",
  lateral: "lateral",
};

export function PainelInserir({ refPonto, direcoes, onInserir, onTrocarReferencia, onCancelar }: Props) {
  // Opções de direção montadas a partir das ligações do poste + a rota.
  const opcoes = useMemo(() => {
    const arr: { chave: string; rotulo: string }[] = [];
    for (const v of direcoes.vizinhos) {
      arr.push({
        chave: `vao:${v.vizinhoId}`,
        rotulo: `→ P${v.numero ?? "?"} · ${ROTULO_SENTIDO[v.sentido]} · vão ${v.comprimentoM.toFixed(0)} m`,
      });
    }
    if (direcoes.estenderCargaAzimute != null) {
      arr.push({ chave: "estender:carga", rotulo: "Estender a linha (sentido carga)" });
    }
    arr.push({ chave: "azimute", rotulo: "Azimute livre…" });
    return arr;
  }, [direcoes]);

  // Padrão: prioriza o vizinho do lado da carga; senão estender-carga; senão o 1º.
  const padrao = useMemo(() => {
    const carga = direcoes.vizinhos.find((v) => v.sentido === "carga");
    if (carga) return `vao:${carga.vizinhoId}`;
    if (direcoes.estenderCargaAzimute != null) return "estender:carga";
    return opcoes[0]?.chave ?? "azimute";
  }, [direcoes, opcoes]);

  const [selecao, setSelecao] = useState(padrao);
  const [distancia, setDistancia] = useState("30");
  const [azimute, setAzimute] = useState("");

  const dist = Number(distancia.replace(",", "."));
  const distOk = Number.isFinite(dist) && dist > 0;
  const az = Number(azimute.replace(",", "."));
  const azOk = selecao !== "azimute" || (Number.isFinite(az) && azimute.trim() !== "");
  const podeInserir = distOk && azOk;

  const inserir = () => {
    if (!podeInserir) return;
    if (selecao.startsWith("vao:")) {
      onInserir({ tipo: "vao", vizinhoId: selecao.slice(4), distanciaM: dist });
    } else if (selecao === "estender:carga" && direcoes.estenderCargaAzimute != null) {
      onInserir({ tipo: "estender", azimuteGraus: direcoes.estenderCargaAzimute, distanciaM: dist });
    } else if (selecao === "azimute") {
      onInserir({ tipo: "estender", azimuteGraus: ((az % 360) + 360) % 360, distanciaM: dist });
    }
  };

  return (
    <div className="modo-bar modo-bar-inserir">
      <span className="inserir-ref">
        Inserir a partir de <strong>P{refPonto.numero ?? "?"}</strong>
      </span>
      <label className="inserir-campo">
        <span>Direção</span>
        <select value={selecao} onChange={(e) => setSelecao(e.target.value)}>
          {opcoes.map((o) => (
            <option key={o.chave} value={o.chave}>
              {o.rotulo}
            </option>
          ))}
        </select>
      </label>
      {selecao === "azimute" && (
        <label className="inserir-campo inserir-campo-mini">
          <span>Azimute °</span>
          <input
            type="number"
            min={0}
            max={359}
            value={azimute}
            placeholder="0–359"
            onChange={(e) => setAzimute(e.target.value)}
          />
        </label>
      )}
      <label className="inserir-campo inserir-campo-mini">
        <span>Distância m</span>
        <input
          type="number"
          min={1}
          step={1}
          value={distancia}
          onChange={(e) => setDistancia(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") inserir();
          }}
        />
      </label>
      <button className="btn btn-mini btn-primario" onClick={inserir} disabled={!podeInserir}>
        Inserir
      </button>
      <button className="btn btn-mini" onClick={onTrocarReferencia}>
        Trocar poste
      </button>
      <button className="btn btn-mini" onClick={onCancelar}>
        Sair (Esc)
      </button>
    </div>
  );
}
