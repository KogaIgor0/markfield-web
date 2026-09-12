import { useState } from "react";
import type { LatLng, Ponto, TipoPonto } from "../domain/model";
import type { PatchPonto } from "../domain/edicao";
import { rotuloPapel, type Papel } from "../domain/rede";
import { type EstruturaAtribuida } from "../domain/estrutura";
import {
  CATALOGO_ESTRUTURAS,
  CODIGOS_ESTRUTURA,
  SUFIXOS_ESTRUTURA,
  comporEstrutura,
  separarEstrutura,
} from "../domain/estruturas-catalogo";
import { normalizarAzimute, type EsforcoPoste } from "../domain/esforco";
import {
  acharPoste,
  alturasDe,
  cargasDe,
  CATALOGO_POSTES,
  POSTE_PADRAO,
  type SecaoPoste,
} from "../domain/postes-catalogo";
import type { EstaiPonto } from "../domain/model";
import { novoId } from "../domain/ids";
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

  // Estais (E-01): lista editável. Gravar `estais` migra e limpa os campos legados.
  const estaisPonto = (): EstaiPonto[] =>
    (esforco?.estais ?? []).map((e) => ({ id: e.id, azimuteGraus: e.azimuteGraus, auto: e.auto }));
  const gravarEstais = (lista: EstaiPonto[]) =>
    onEditar({ estais: lista, estaiInstalado: undefined, estaiAzimuteManual: undefined });
  const adicionarEstai = () =>
    gravarEstais([
      ...estaisPonto(),
      { id: novoId("es"), azimuteGraus: esforco?.sugestaoAzimute ?? 0, auto: true },
    ]);
  const removerEstai = (id: string) => gravarEstais(estaisPonto().filter((e) => e.id !== id));
  const girarEstaiPara = (id: string, az: number) =>
    gravarEstais(
      estaisPonto().map((e) => (e.id === id ? { ...e, azimuteGraus: normalizarAzimute(az), auto: false } : e)),
    );

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
              const { base, sufixo } = separarEstrutura(manual ?? "");
              const baseConhecida = base ? (CODIGOS_ESTRUTURA as string[]).includes(base) : false;
              const mostrarOutro = outroCE || Boolean(manual && !baseConhecida);
              const valorBase = mostrarOutro ? "__outro__" : baseConhecida ? base : "";
              return (
                <div className="coord-linha">
                  <label className="campo campo-mini">
                    <span>Estrutura (manual)</span>
                    <select
                      value={valorBase}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === "__outro__") {
                          setOutroCE(true);
                        } else if (v === "") {
                          setOutroCE(false);
                          onEditar({ estruturaManual: undefined });
                        } else {
                          setOutroCE(false);
                          onEditar({ estruturaManual: comporEstrutura(v, sufixo) });
                        }
                      }}
                    >
                      <option value="">Automático (norma)</option>
                      {CATALOGO_ESTRUTURAS.map((c) => (
                        <option key={c.codigo} value={c.codigo}>
                          {c.rotulo}
                        </option>
                      ))}
                      <option value="__outro__">Outro…</option>
                    </select>
                  </label>
                  {baseConhecida && !mostrarOutro && (
                    <label className="campo campo-mini">
                      <span>Equipamento</span>
                      <select
                        value={sufixo}
                        onChange={(e) => onEditar({ estruturaManual: comporEstrutura(base, e.target.value) })}
                      >
                        <option value="">— nenhum —</option>
                        {SUFIXOS_ESTRUTURA.map((s) => (
                          <option key={s.sufixo} value={s.sufixo}>
                            {s.sufixo} — {s.rotulo}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  {mostrarOutro && (
                    <label className="campo campo-mini">
                      <span>Código</span>
                      <input
                        type="text"
                        defaultValue={manual ?? ""}
                        placeholder="ex.: CE4 CF"
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
            {(() => {
              const atual =
                acharPoste(ponto.posteTipo) ??
                CATALOGO_POSTES.find(
                  (p) => p.secao === "circular" && p.alturaM === 11 && p.cargaDaN === ponto.capacidadeDaN,
                ) ??
                acharPoste(POSTE_PADRAO)!;
              const definido = Boolean(acharPoste(ponto.posteTipo));
              const alturas = alturasDe(atual.secao);
              const cargas = cargasDe(atual.secao, atual.alturaM);
              const acha = (s: SecaoPoste, a: number, c: number) =>
                CATALOGO_POSTES.find((p) => p.secao === s && p.alturaM === a && p.cargaDaN === c) ??
                CATALOGO_POSTES.find((p) => p.secao === s && p.alturaM === a);
              const setTipo = (s: SecaoPoste, a: number, c: number) => {
                const t = acha(s, a, c);
                if (t) onEditar({ posteTipo: t.codigo });
              };
              const sug = esforco.posteSugerido ? acharPoste(esforco.posteSugerido) : undefined;
              const mostrarSug = sug && sug.codigo !== atual.codigo;
              return (
                <div className="poste-bloco">
                  <div className="rede-linha">
                    <span>Poste{!definido && <em className="poste-nao"> (padrão)</em>}</span>
                    <strong>{atual.alturaM}/{atual.cargaDaN}</strong>
                  </div>
                  <div className="poste-sels">
                    <label className="campo campo-mini">
                      <span>Seção</span>
                      <select
                        value={atual.secao}
                        onChange={(e) => setTipo(e.target.value as SecaoPoste, atual.alturaM, atual.cargaDaN)}
                      >
                        <option value="circular">Circular</option>
                        <option value="duploT">Duplo T</option>
                      </select>
                    </label>
                    <label className="campo campo-mini">
                      <span>Altura</span>
                      <select
                        value={atual.alturaM}
                        onChange={(e) => setTipo(atual.secao, Number(e.target.value), atual.cargaDaN)}
                      >
                        {alturas.map((a) => (
                          <option key={a} value={a}>{a} m</option>
                        ))}
                      </select>
                    </label>
                    <label className="campo campo-mini">
                      <span>Carga</span>
                      <select
                        value={atual.cargaDaN}
                        onChange={(e) => setTipo(atual.secao, atual.alturaM, Number(e.target.value))}
                      >
                        {cargas.map((c) => (
                          <option key={c} value={c}>{c} daN</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  {mostrarSug && (
                    <div className="poste-sug">
                      <span>
                        Sugerido p/ o esforço: <strong>{sug!.alturaM}/{sug!.cargaDaN}</strong>
                        {!esforco.posteSugeridoAguenta && " (nem o maior de 11 m aguenta — suba a altura ou use estai)"}
                      </span>
                      <button
                        className="btn-mini"
                        onClick={() => onEditar({ posteTipo: sug!.codigo })}
                      >
                        Usar
                      </button>
                    </div>
                  )}
                </div>
              );
            })()}
            {!esforco.precisaEstai && esforco.estais.length === 0 && (
              <div className="estai-linha">Sem estai — esforço dentro da capacidade.</div>
            )}
            {esforco.pendente && (
              <div className="estai-linha ativo">
                ⚡ Precisa de estai ({esforco.esforcoDaN.toFixed(0)} &gt; {esforco.capacidadeDaN} daN)
              </div>
            )}
            {esforco.precisaEstai && esforco.estais.length > 0 && (
              <div className="estai-linha resolvido">
                ✓ {esforco.estais.length} estai{esforco.estais.length > 1 ? "s" : ""} — pendência resolvida.
              </div>
            )}
            {esforco.estais.map((e, i) => (
              <div key={e.id} className="estai-girar">
                <div className="estai-girar-topo">
                  <span>Estai {i + 1}</span>
                  <strong>
                    {Math.round(e.azimuteGraus)}°{" "}
                    <span className="estai-girar-modo">{e.auto ? "sugerido" : "girado"}</span>
                  </strong>
                </div>
                <div className="estai-girar-ctrl">
                  <button
                    className="btn-gira"
                    title="Girar 5° (anti-horário)"
                    onClick={() => girarEstaiPara(e.id, e.azimuteGraus - 5)}
                  >
                    ↺
                  </button>
                  <input
                    type="range"
                    min={0}
                    max={359}
                    step={1}
                    value={Math.round(e.azimuteGraus)}
                    onChange={(ev) => girarEstaiPara(e.id, Number(ev.target.value))}
                  />
                  <button
                    className="btn-gira"
                    title="Girar 5° (horário)"
                    onClick={() => girarEstaiPara(e.id, e.azimuteGraus + 5)}
                  >
                    ↻
                  </button>
                  <button className="btn-estai-x" title="Remover este estai" onClick={() => removerEstai(e.id)}>
                    ✕
                  </button>
                </div>
              </div>
            ))}
            {(esforco.precisaEstai || esforco.estais.length > 0) && (
              <button className="btn-estai" onClick={adicionarEstai}>
                + Adicionar estai{esforco.estais.length > 0 ? " (outro)" : ""}
              </button>
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
