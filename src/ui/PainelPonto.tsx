import { useState } from "react";
import type { LatLng, Ponto, TipoPonto } from "../domain/model";
import type { PatchPonto } from "../domain/edicao";
import { rotuloPapel, type Papel } from "../domain/rede";
import { CODIGOS_ESTRUTURA, type EstruturaAtribuida } from "../domain/estrutura";
import { normalizarAzimute, type EsforcoPoste } from "../domain/esforco";
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
  /** Estrutura da norma (B3), quando modelada. */
  estrutura?: EstruturaAtribuida;
  /** Esforço + estai (B4), quando modelado. */
  esforco?: EsforcoPoste;
  /** Ponto de campo (GPS): coordenada protegida contra alteração acidental. */
  travado?: boolean;
  /** Ponto de campo com a coordenada temporariamente liberada (após confirmar). */
  destravado?: boolean;
  /** Este ponto está no modo "mover" (arraste habilitado no mapa). */
  movendo?: boolean;
  onEditar: (patch: PatchPonto) => void;
  onMover: (wgs84: LatLng) => void;
  /** Liga/desliga o modo mover deste ponto (arraste deliberado no mapa). */
  onMoverNoMapa: () => void;
  /** Libera a coordenada de um ponto de campo (já confirmado pelo usuário). */
  onDestravar: () => void;
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
  estrutura,
  esforco,
  travado,
  destravado,
  movendo,
  onEditar,
  onMover,
  onMoverNoMapa,
  onDestravar,
  onDefinirFonte,
  onExcluir,
  onFechar,
}: Props) {
  const utm = paraUtm(ponto.wgs84);
  // Coordenada bloqueada = ponto de campo ainda travado. Enquanto bloqueada,
  // não dá pra digitar coordenada nem entrar no modo mover.
  const bloqueado = Boolean(travado && !destravado);
  const [confirmando, setConfirmando] = useState(false);
  const [outroCE, setOutroCE] = useState(false);
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
              disabled={bloqueado}
              onChange={(e) => setLat(e.target.value)}
              onBlur={comitarLatLng}
              onKeyDown={enterBlur}
            />
          </label>
          <label className="campo campo-mini">
            <span>Longitude</span>
            <input
              value={lng}
              disabled={bloqueado}
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
              disabled={bloqueado}
              onChange={(e) => setEasting(e.target.value)}
              onBlur={comitarUtm}
              onKeyDown={enterBlur}
            />
          </label>
          <label className="campo campo-mini">
            <span>UTM N</span>
            <input
              value={northing}
              disabled={bloqueado}
              onChange={(e) => setNorthing(e.target.value)}
              onBlur={comitarUtm}
              onKeyDown={enterBlur}
            />
          </label>
        </div>
        <div className="painel-utm">{formatarUtm(utm)} · SIRGAS 2000</div>

        <div className="painel-mover">
          {bloqueado ? (
            confirmando ? (
              <div className="trava-confirm">
                <span>Alterar um ponto medido em campo (GPS)?</span>
                <div className="trava-acoes">
                  <button
                    className="btn-destravar"
                    onClick={() => {
                      setConfirmando(false);
                      onDestravar();
                    }}
                  >
                    Sim, destravar
                  </button>
                  <button className="btn-mini-sec" onClick={() => setConfirmando(false)}>
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="trava-nota">🔒 Ponto de campo — coordenada protegida.</div>
                <button className="btn-destravar" onClick={() => setConfirmando(true)}>
                  Destravar coordenada
                </button>
              </>
            )
          ) : (
            <>
              {travado && destravado && (
                <div className="trava-nota destravado">🔓 Destravado — corrija com cuidado.</div>
              )}
              <button
                className={`btn-mover${movendo ? " ativo" : ""}`}
                onClick={onMoverNoMapa}
              >
                {movendo ? "✓ Movendo — arraste no mapa (Esc)" : "Mover no mapa"}
              </button>
            </>
          )}
        </div>
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
        {estrutura && (
          <div className="rede-linha">
            <span>Estrutura</span>
            <strong className={estrutura.confianca === "revisar" ? "estr-revisar" : "estr-ok"}>
              {estrutura.codigo || "—"}
              {estrutura.confianca === "revisar" && estrutura.codigo ? " ⚠︎" : ""}
            </strong>
          </div>
        )}
        {estrutura && (
          <div className="estr-desc">
            {estrutura.descricao}
            {estrutura.motivo ? ` — ${estrutura.motivo}` : ""}
          </div>
        )}
        {papel && (
          <div className="estr-override">
            {(() => {
              const manual = ponto.estruturaManual?.trim();
              const conhecido = manual ? (CODIGOS_ESTRUTURA as readonly string[]).includes(manual) : false;
              const mostrarOutro = outroCE || Boolean(manual && !conhecido);
              const valorSel = mostrarOutro ? "__outro__" : conhecido ? manual! : "";
              return (
                <div className="coord-linha">
                  <label className="campo campo-mini">
                    <span>Estrutura (manual)</span>
                    <select
                      value={valorSel}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === "__outro__") {
                          setOutroCE(true);
                        } else if (v === "") {
                          setOutroCE(false);
                          onEditar({ estruturaManual: undefined });
                        } else {
                          setOutroCE(false);
                          onEditar({ estruturaManual: v });
                        }
                      }}
                    >
                      <option value="">Automático (norma)</option>
                      {CODIGOS_ESTRUTURA.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                      <option value="__outro__">Outro…</option>
                    </select>
                  </label>
                  {mostrarOutro && (
                    <label className="campo campo-mini">
                      <span>Código</span>
                      <input
                        type="text"
                        defaultValue={manual ?? ""}
                        placeholder="ex.: CE4-TR"
                        onBlur={(e) =>
                          onEditar({ estruturaManual: e.target.value.trim() || undefined })
                        }
                        onKeyDown={enterBlur}
                      />
                    </label>
                  )}
                </div>
              );
            })()}
          </div>
        )}
        {esforco && esforco.vaos > 0 && (
          <>
            <div className="rede-linha">
              <span>Esforço</span>
              <strong className={esforco.precisaEstai ? "estr-revisar" : "estr-ok"}>
                {esforco.esforcoDaN.toFixed(0)} daN
              </strong>
            </div>
            <div className="rede-linha">
              <span>Capacidade do poste</span>
              <span className="cap-campo">
                <input
                  type="number"
                  min={100}
                  step={100}
                  defaultValue={esforco.capacidadeDaN}
                  onBlur={(e) => {
                    const n = Number(e.target.value.replace(",", "."));
                    if (Number.isFinite(n) && n > 0) onEditar({ capacidadeDaN: n });
                  }}
                  onKeyDown={enterBlur}
                />
                <span>daN</span>
              </span>
            </div>
            {!esforco.precisaEstai && (
              <div className="estai-linha">Sem estai — esforço dentro da capacidade.</div>
            )}
            {esforco.pendente && (
              <>
                <div className="estai-linha ativo">
                  ⚡ Precisa de estai ({esforco.esforcoDaN.toFixed(0)} &gt; {esforco.capacidadeDaN} daN)
                </div>
                <button className="btn-estai" onClick={() => onEditar({ estaiInstalado: true })}>
                  Marcar estai instalado
                </button>
              </>
            )}
            {esforco.precisaEstai && esforco.estaiInstalado && (
              <>
                <div className="estai-linha resolvido">✓ Estai instalado — pendência resolvida.</div>
                {esforco.azimuteEstai != null && (
                  <div className="estai-girar">
                    <div className="estai-girar-topo">
                      <span>Direção do estai</span>
                      <strong>
                        {Math.round(esforco.azimuteEstai)}°{" "}
                        <span className="estai-girar-modo">
                          {esforco.estaiManual ? "manual" : "auto (oposto ao esforço)"}
                        </span>
                      </strong>
                    </div>
                    <div className="estai-girar-ctrl">
                      <button
                        className="btn-gira"
                        title="Girar 5° (anti-horário)"
                        onClick={() =>
                          onEditar({
                            estaiAzimuteManual: normalizarAzimute((esforco.azimuteEstai ?? 0) - 5),
                          })
                        }
                      >
                        ↺
                      </button>
                      <input
                        type="range"
                        min={0}
                        max={359}
                        step={1}
                        value={Math.round(esforco.azimuteEstai)}
                        onChange={(e) =>
                          onEditar({ estaiAzimuteManual: Number(e.target.value) })
                        }
                      />
                      <button
                        className="btn-gira"
                        title="Girar 5° (horário)"
                        onClick={() =>
                          onEditar({
                            estaiAzimuteManual: normalizarAzimute((esforco.azimuteEstai ?? 0) + 5),
                          })
                        }
                      >
                        ↻
                      </button>
                    </div>
                    {esforco.estaiManual && (
                      <button
                        className="btn-mini-sec"
                        onClick={() => onEditar({ estaiAzimuteManual: undefined })}
                      >
                        Voltar ao automático
                      </button>
                    )}
                  </div>
                )}
                <button className="btn-mini-sec" onClick={() => onEditar({ estaiInstalado: false })}>
                  Remover estai
                </button>
              </>
            )}
            <div className="estr-desc">Tração de projeto provisória (DIS-NOR-013) — a confirmar.</div>
          </>
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
