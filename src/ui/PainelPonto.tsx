import { useState } from "react";
import type { LatLng, Ponto, TipoPonto } from "../domain/model";
import type { PatchPonto } from "../domain/edicao";
import { rotuloPapel, type Papel } from "../domain/rede";
import { deUtm, formatarUtm, paraUtm } from "../geo/utm";

/**
 * Painel do ponto selecionado (Fase 2). Edita tipo, número e observação, e a
 * COORDENADA de forma exata — em lat/lng ou em UTM SIRGAS 2000 (o projetista
 * costuma ter a coordenada em UTM). Os campos comitam ao sair (blur)/Enter.
 */

const TIPOS: { valor: TipoPonto; rotulo: string }[] = [
  { valor: "postePropostoo", rotulo: "Poste proposto" },
  { valor: "generico", rotulo: "Genérico" },
  { valor: "transformador", rotulo: "Transformador" },
  { valor: "outro", rotulo: "Outro" },
];

interface Props {
  ponto: Ponto;
  /** Papel na rede (B1), quando modelado. */
  papel?: Papel;
  deflexaoGraus?: number;
  onEditar: (patch: PatchPonto) => void;
  onMover: (wgs84: LatLng) => void;
  onDefinirFonte: () => void;
  onExcluir: () => void;
  onFechar: () => void;
}

function numeroValido(s: string): number | null {
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export function PainelPonto({
  ponto,
  papel,
  deflexaoGraus,
  onEditar,
  onMover,
  onDefinirFonte,
  onExcluir,
  onFechar,
}: Props) {
  const utm = paraUtm(ponto.wgs84);
  // Buffers locais para os campos de coordenada (comitam no blur).
  const [lat, setLat] = useState(String(ponto.wgs84.lat));
  const [lng, setLng] = useState(String(ponto.wgs84.lng));
  const [easting, setEasting] = useState(utm.easting.toFixed(3));
  const [northing, setNorthing] = useState(utm.northing.toFixed(3));

  const comitarLatLng = () => {
    const la = numeroValido(lat);
    const lo = numeroValido(lng);
    if (la != null && lo != null && (la !== ponto.wgs84.lat || lo !== ponto.wgs84.lng)) {
      onMover({ lat: la, lng: lo });
    }
  };

  const comitarUtm = () => {
    const e = numeroValido(easting);
    const n = numeroValido(northing);
    if (e != null && n != null && (e !== utm.easting || n !== utm.northing)) {
      onMover(deUtm({ ...utm, easting: e, northing: n }));
    }
  };

  const enterBlur = (ev: React.KeyboardEvent) => {
    if (ev.key === "Enter") (ev.target as HTMLElement).blur();
  };

  return (
    <aside className="painel">
      <div className="painel-topo">
        <strong>{ponto.numero ? `Ponto P${ponto.numero}` : "Ponto"}</strong>
        <button className="painel-x" onClick={onFechar} aria-label="Fechar">
          ×
        </button>
      </div>

      <label className="campo">
        <span>Tipo</span>
        <select value={ponto.tipo} onChange={(e) => onEditar({ tipo: e.target.value as TipoPonto })}>
          {TIPOS.map((t) => (
            <option key={t.valor} value={t.valor}>
              {t.rotulo}
            </option>
          ))}
        </select>
      </label>

      <label className="campo">
        <span>Número</span>
        <input
          type="text"
          defaultValue={ponto.numero ?? ""}
          onBlur={(e) => onEditar({ numero: e.target.value })}
          onKeyDown={enterBlur}
        />
      </label>

      <label className="campo">
        <span>Observação</span>
        <textarea
          rows={2}
          defaultValue={ponto.observacao ?? ""}
          onBlur={(e) => onEditar({ observacao: e.target.value })}
        />
      </label>

      <div className="painel-coord">
        <div className="painel-sub">Coordenada</div>
        <div className="coord-linha">
          <label className="campo campo-mini">
            <span>Latitude</span>
            <input
              value={lat}
              onChange={(e) => setLat(e.target.value)}
              onBlur={comitarLatLng}
              onKeyDown={enterBlur}
            />
          </label>
          <label className="campo campo-mini">
            <span>Longitude</span>
            <input
              value={lng}
              onChange={(e) => setLng(e.target.value)}
              onBlur={comitarLatLng}
              onKeyDown={enterBlur}
            />
          </label>
        </div>
        <div className="coord-linha">
          <label className="campo campo-mini">
            <span>UTM E</span>
            <input
              value={easting}
              onChange={(e) => setEasting(e.target.value)}
              onBlur={comitarUtm}
              onKeyDown={enterBlur}
            />
          </label>
          <label className="campo campo-mini">
            <span>UTM N</span>
            <input
              value={northing}
              onChange={(e) => setNorthing(e.target.value)}
              onBlur={comitarUtm}
              onKeyDown={enterBlur}
            />
          </label>
        </div>
        <div className="painel-utm">{formatarUtm(utm)} · SIRGAS 2000</div>
      </div>

      <div className="painel-rede">
        <div className="painel-sub">Rede</div>
        <div className="rede-linha">
          <span>Papel</span>
          <strong>{papel ? rotuloPapel(papel) : "—"}</strong>
        </div>
        {deflexaoGraus != null && (
          <div className="rede-linha">
            <span>Deflexão</span>
            <strong>{deflexaoGraus.toFixed(1)}°</strong>
          </div>
        )}
        <button
          className={`btn-fonte${ponto.ehFonte ? " ativa" : ""}`}
          onClick={onDefinirFonte}
        >
          {ponto.ehFonte ? "✓ É a fonte da rede" : "Marcar como fonte"}
        </button>
      </div>

      <div className="painel-info">
        {ponto.origem === "web" ? "Criado no Web" : "Do campo"}
        {ponto.precisaoM != null && ` · precisão ${ponto.precisaoM} m`}
        {ponto.fonteCoordenada && ` · ${ponto.fonteCoordenada}`}
      </div>

      <button className="btn-excluir" onClick={onExcluir}>
        Excluir ponto
      </button>
    </aside>
  );
}
