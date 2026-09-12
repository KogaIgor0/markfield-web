import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { LatLng, Projeto } from "../domain/model";
import type { RedeEsforcos } from "../domain/esforco";
import type { ResumoMateriais } from "../domain/materiais";
import {
  bboxProjeto,
  dimFolha,
  dimensaoDesenhoMm,
  escalaParaCaber,
  ESCALAS_PADRAO,
  passoEscalaM,
  projetarCoord,
  type FolhaId,
  type Orientacao,
} from "../domain/prancha";

/**
 * Prancha (B6) — a folha de projeto em ESCALA (SVG em mm), com moldura, Norte,
 * escala gráfica, carimbo, simbologia e quadro de materiais. É a "saída" desenho
 * do projeto; imprime em PDF pelo navegador no tamanho da folha.
 *
 * v1: o **carimbo e a simbologia são provisórios** (marcados na folha) — o
 * formato exato vem da DIS-NOR-012 (Anexo I / VIII) quando o Igor mandar. O
 * motor de desenho (escala/projeção, `domain/prancha.ts`) já é o definitivo.
 */

interface Props {
  projeto: Projeto;
  esforcos: RedeEsforcos | null;
  rotulosEstrutura: Map<string, string>;
  materiais: ResumoMateriais | null;
  onFechar: () => void;
}

// Margens/blocos da folha, em mm.
const MARGEM = 8; // borda do papel até a moldura
const PAINEL_W = 58; // coluna direita (Norte, escala, simbologia, materiais)
const CARIMBO_H = 36; // faixa do carimbo (base)
const PAD = 4; // respiro interno da área de desenho

type EscalaModo = "auto" | number;

export function PranchaView({ projeto, esforcos, rotulosEstrutura, materiais, onFechar }: Props) {
  const [folha, setFolha] = useState<FolhaId>("A3");
  const [orientacao, setOrientacao] = useState<Orientacao>("paisagem");
  const [escalaModo, setEscalaModo] = useState<EscalaModo>("auto");
  const [mostrarNumeros, setMostrarNumeros] = useState(true);
  const [mostrarEstrutura, setMostrarEstrutura] = useState(true);
  const [mostrarEsforco, setMostrarEsforco] = useState(true);

  const { larguraMm: W, alturaMm: H } = dimFolha(folha, orientacao);

  // Regiões da folha (mm).
  const cx0 = MARGEM;
  const cy0 = MARGEM;
  const cx1 = W - MARGEM;
  const cy1 = H - MARGEM;
  const desenho = {
    x: cx0 + PAD,
    y: cy0 + PAD,
    w: cx1 - PAINEL_W - cx0 - 2 * PAD,
    h: cy1 - CARIMBO_H - cy0 - 2 * PAD,
  };
  const painel = { x: cx1 - PAINEL_W, y: cy0, w: PAINEL_W, h: cy1 - CARIMBO_H - cy0 };
  const carimbo = { x: cx0, y: cy1 - CARIMBO_H, w: cx1 - cx0, h: CARIMBO_H };

  const bbox = useMemo(() => bboxProjeto(projeto), [projeto]);

  const escalaAuto = useMemo(
    () => (bbox ? escalaParaCaber(bbox, desenho.w, desenho.h, 0.12) : 1000),
    [bbox, desenho.w, desenho.h],
  );
  const escala = escalaModo === "auto" ? escalaAuto : escalaModo;

  // Conteúdo centralizado na área de desenho.
  const dim = bbox ? dimensaoDesenhoMm(bbox, escala) : { larguraMm: 0, alturaMm: 0 };
  const padX = Math.max(0, (desenho.w - dim.larguraMm) / 2);
  const padY = Math.max(0, (desenho.h - dim.alturaMm) / 2);
  const cabe = dim.larguraMm <= desenho.w + 0.5 && dim.alturaMm <= desenho.h + 0.5;

  // WGS84 → coordenada SVG (mm), Norte pra cima.
  const toSvg = (c: LatLng): [number, number] => {
    if (!bbox) return [0, 0];
    const pm = projetarCoord(c, bbox, escala);
    return [desenho.x + padX + pm.xMm, desenho.y + desenho.h - padY - pm.yMm];
  };

  const porId = useMemo(() => new Map(projeto.pontos.map((p) => [p.id, p])), [projeto]);

  // @page com o tamanho da folha, pra o PDF do navegador sair no tamanho certo.
  useEffect(() => {
    const id = "prancha-page-style";
    let el = document.getElementById(id) as HTMLStyleElement | null;
    if (!el) {
      el = document.createElement("style");
      el.id = id;
      document.head.appendChild(el);
    }
    el.textContent = `@media print {
      @page { size: ${W}mm ${H}mm; margin: 0; }
      .prancha-svg { width: ${W}mm !important; height: ${H}mm !important; }
    }`;
    return () => {
      el?.remove();
    };
  }, [W, H]);

  // Escala gráfica (barra): passo redondo que cabe em ~70% do painel.
  const barraMaxMm = painel.w - 12;
  const passoM = passoEscalaM(barraMaxMm, escala);
  const barraMm = (passoM * 1000) / escala;

  return (
    <div className="prancha-overlay">
      <div className="prancha-barra">
        <strong>Prancha</strong>
        <label>
          Folha
          <select value={folha} onChange={(e) => setFolha(e.target.value as FolhaId)}>
            {(["A4", "A3", "A2", "A1"] as FolhaId[]).map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </label>
        <label>
          Orientação
          <select value={orientacao} onChange={(e) => setOrientacao(e.target.value as Orientacao)}>
            <option value="paisagem">Paisagem</option>
            <option value="retrato">Retrato</option>
          </select>
        </label>
        <label>
          Escala
          <select
            value={String(escalaModo)}
            onChange={(e) => setEscalaModo(e.target.value === "auto" ? "auto" : Number(e.target.value))}
          >
            <option value="auto">Auto (1:{escalaAuto})</option>
            {ESCALAS_PADRAO.map((s) => (
              <option key={s} value={s}>
                1:{s}
              </option>
            ))}
          </select>
        </label>
        <label className="prancha-chk">
          <input type="checkbox" checked={mostrarNumeros} onChange={(e) => setMostrarNumeros(e.target.checked)} />
          Nº
        </label>
        <label className="prancha-chk">
          <input type="checkbox" checked={mostrarEstrutura} onChange={(e) => setMostrarEstrutura(e.target.checked)} />
          Estrutura
        </label>
        <label className="prancha-chk">
          <input type="checkbox" checked={mostrarEsforco} onChange={(e) => setMostrarEsforco(e.target.checked)} />
          Esforço
        </label>
        <span className="prancha-barra-sep" />
        <button className="btn" onClick={() => window.print()}>
          Imprimir / PDF
        </button>
        <button className="btn" onClick={onFechar}>
          Fechar
        </button>
      </div>

      <div className="prancha-papel">
        <svg
          className="prancha-svg"
          viewBox={`0 0 ${W} ${H}`}
          width={`${W}mm`}
          height={`${H}mm`}
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <clipPath id="clip-desenho">
              <rect x={desenho.x} y={desenho.y} width={desenho.w} height={desenho.h} />
            </clipPath>
          </defs>

          {/* Fundo + moldura */}
          <rect x={0} y={0} width={W} height={H} fill="#ffffff" />
          <rect x={cx0} y={cy0} width={cx1 - cx0} height={cy1 - cy0} fill="none" stroke="#000" strokeWidth={0.5} />

          {/* Divisórias do painel direito e do carimbo */}
          <line x1={painel.x} y1={cy0} x2={painel.x} y2={carimbo.y} stroke="#000" strokeWidth={0.3} />
          <line x1={cx0} y1={carimbo.y} x2={cx1} y2={carimbo.y} stroke="#000" strokeWidth={0.5} />

          {/* --- Área de desenho (rede em escala) --- */}
          <g clipPath="url(#clip-desenho)">
            {!bbox && (
              <text x={desenho.x + desenho.w / 2} y={desenho.y + desenho.h / 2} fontSize={4} textAnchor="middle" fill="#666">
                Sem pontos para desenhar.
              </text>
            )}

            {/* Trechos */}
            {bbox &&
              projeto.trechos.map((t) => {
                const caminho =
                  t.caminho && t.caminho.length >= 2
                    ? t.caminho
                    : [porId.get(t.dePontoId ?? "")?.wgs84, porId.get(t.aPontoId ?? "")?.wgs84].filter(
                        Boolean,
                      ) as LatLng[];
                if (caminho.length < 2) return null;
                const pts = caminho.map((c) => toSvg(c).join(",")).join(" ");
                return (
                  <polyline
                    key={t.id}
                    points={pts}
                    fill="none"
                    stroke="#000"
                    strokeWidth={0.5}
                    strokeDasharray={t.tracaoReduzida ? "2 1.2" : undefined}
                    strokeLinejoin="round"
                  />
                );
              })}

            {/* Estais (poste → âncora, no sentido do esforço) */}
            {bbox &&
              esforcos &&
              projeto.pontos.map((p) => {
                const e = esforcos.postes.get(p.id);
                if (!e || e.estais.length === 0) return null;
                const [px, py] = toSvg(p.wgs84);
                return (
                  <g key={`estai-${p.id}`}>
                    {e.estais.map((es) => {
                      const [ax, ay] = toSvg(es.ate);
                      return (
                        <g key={es.id}>
                          <line x1={px} y1={py} x2={ax} y2={ay} stroke="#000" strokeWidth={0.35} />
                          <rect x={ax - 0.8} y={ay - 0.8} width={1.6} height={1.6} fill="#000" transform={`rotate(45 ${ax} ${ay})`} />
                        </g>
                      );
                    })}
                  </g>
                );
              })}

            {/* Postes + rótulos */}
            {bbox &&
              projeto.pontos.map((p) => {
                const [x, y] = toSvg(p.wgs84);
                const trafo = p.tipo === "transformador";
                const e = esforcos?.postes.get(p.id);
                const cod = rotulosEstrutura.get(p.id);
                const mostraEsf = mostrarEsforco && e && e.esforcoDaN >= 1 && (e.precisaEstai || e.estais.length > 0);
                return (
                  <g key={`pt-${p.id}`}>
                    {trafo ? (
                      <>
                        <circle cx={x} cy={y} r={1.6} fill="#fff" stroke="#000" strokeWidth={0.4} />
                        <circle cx={x} cy={y} r={0.6} fill="#000" />
                      </>
                    ) : (
                      <circle cx={x} cy={y} r={0.9} fill="#fff" stroke="#000" strokeWidth={0.4} />
                    )}
                    {mostrarNumeros && p.numero && (
                      <text x={x + 1.6} y={y - 1.4} fontSize={2.6} fill="#000">
                        {p.numero}
                      </text>
                    )}
                    {mostrarEstrutura && cod && (
                      <text x={x + 1.6} y={y + 2.6} fontSize={2.2} fill="#b00">
                        {cod}
                      </text>
                    )}
                    {mostraEsf && (
                      <text x={x + 1.6} y={y + 5.2} fontSize={2} fill="#333">
                        {Math.round(e!.esforcoDaN)} daN
                      </text>
                    )}
                  </g>
                );
              })}
          </g>

          {!cabe && (
            <text x={desenho.x + 1} y={desenho.y + desenho.h - 1} fontSize={2.6} fill="#b00">
              ⚠ A rede não cabe nesta escala/folha — aumente a folha ou a escala (pode precisar de mais de uma folha).
            </text>
          )}

          {/* --- Painel direito: Norte, escala, simbologia, materiais --- */}
          <PainelDireito
            x={painel.x}
            y={painel.y}
            w={painel.w}
            escala={escala}
            passoM={passoM}
            barraMm={barraMm}
            materiais={materiais}
          />

          {/* --- Carimbo (provisório) --- */}
          <Carimbo x={carimbo.x} y={carimbo.y} w={carimbo.w} h={carimbo.h} projeto={projeto} escala={escala} />
        </svg>
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------
// Painel direito
// --------------------------------------------------------------------------

function PainelDireito({
  x,
  y,
  w,
  escala,
  passoM,
  barraMm,
  materiais,
}: {
  x: number;
  y: number;
  w: number;
  escala: number;
  passoM: number;
  barraMm: number;
  materiais: ResumoMateriais | null;
}) {
  const cx = x + w / 2;
  const bx = x + 6; // início da barra de escala
  const by = y + 30;
  return (
    <g>
      {/* Norte */}
      <g>
        <line x1={cx} y1={y + 5} x2={cx} y2={y + 15} stroke="#000" strokeWidth={0.5} />
        <polygon points={`${cx},${y + 4} ${cx - 1.6},${y + 8} ${cx + 1.6},${y + 8}`} fill="#000" />
        <text x={cx} y={y + 20} fontSize={3} textAnchor="middle" fill="#000">
          N
        </text>
      </g>

      {/* Escala */}
      <text x={x + 3} y={by - 3} fontSize={2.6} fill="#000">
        Escala 1:{escala}
      </text>
      {barraMm > 0 && (
        <g>
          <rect x={bx} y={by} width={barraMm / 2} height={1.6} fill="#000" />
          <rect x={bx + barraMm / 2} y={by} width={barraMm / 2} height={1.6} fill="#fff" stroke="#000" strokeWidth={0.2} />
          <text x={bx} y={by + 5} fontSize={2.2} fill="#000">
            0
          </text>
          <text x={bx + barraMm} y={by + 5} fontSize={2.2} textAnchor="middle" fill="#000">
            {passoM} m
          </text>
        </g>
      )}

      {/* Simbologia (provisória) */}
      <text x={x + 3} y={by + 12} fontSize={2.8} fill="#000">
        Simbologia
      </text>
      <g transform={`translate(${x + 4}, ${by + 16})`}>
        <SimbLinha dy={0} label="Poste">
          <circle cx={1} cy={-0.8} r={0.9} fill="#fff" stroke="#000" strokeWidth={0.4} />
        </SimbLinha>
        <SimbLinha dy={5} label="Transformador">
          <circle cx={1} cy={-0.8} r={1.5} fill="#fff" stroke="#000" strokeWidth={0.4} />
          <circle cx={1} cy={-0.8} r={0.55} fill="#000" />
        </SimbLinha>
        <SimbLinha dy={10} label="Rede compacta">
          <line x1={-0.5} y1={-0.8} x2={2.5} y2={-0.8} stroke="#000" strokeWidth={0.5} />
        </SimbLinha>
        <SimbLinha dy={15} label="Tração reduzida">
          <line x1={-0.5} y1={-0.8} x2={2.5} y2={-0.8} stroke="#000" strokeWidth={0.5} strokeDasharray="1 0.8" />
        </SimbLinha>
        <SimbLinha dy={20} label="Estai">
          <line x1={-0.5} y1={0} x2={2} y2={-1.6} stroke="#000" strokeWidth={0.35} />
          <rect x={1.4} y={-2.2} width={1.2} height={1.2} fill="#000" transform="rotate(45 2 -1.6)" />
        </SimbLinha>
      </g>
      <text x={x + 3} y={by + 42} fontSize={1.8} fill="#888">
        (Provisória — Anexo VIII a validar)
      </text>

      {/* Quadro de materiais */}
      <text x={x + 3} y={by + 50} fontSize={2.8} fill="#000">
        Materiais
      </text>
      <g transform={`translate(${x + 3}, ${by + 54})`}>
        {materiais ? (
          <QuadroMateriais w={w - 6} materiais={materiais} />
        ) : (
          <text fontSize={2.2} fill="#888">
            —
          </text>
        )}
      </g>
    </g>
  );
}

function SimbLinha({ dy, label, children }: { dy: number; label: string; children: ReactNode }) {
  return (
    <g transform={`translate(0, ${dy})`}>
      {children}
      <text x={5} y={0} fontSize={2.2} fill="#000">
        {label}
      </text>
    </g>
  );
}

function QuadroMateriais({ w, materiais }: { w: number; materiais: ResumoMateriais }) {
  const linhas: { rot: string; val: string }[] = [];
  for (const e of materiais.estruturas) linhas.push({ rot: e.codigo, val: String(e.n) });
  for (const c of materiais.cabos)
    linhas.push({ rot: `Cabo ${c.codigo}${c.provisorio ? "*" : ""}`, val: `${Math.round(c.comprimentoM)} m` });
  linhas.push({ rot: `Espaçadores${materiais.espacadoresEstimado ? "*" : ""}`, val: String(materiais.espacadores) });
  if (materiais.estais) linhas.push({ rot: "Estais", val: String(materiais.estais) });
  if (materiais.pararaios) linhas.push({ rot: "Para-raios", val: String(materiais.pararaios) });
  if (materiais.estribos) linhas.push({ rot: "Estribos (300 m)", val: String(materiais.estribos) });
  const lh = 3.4;
  return (
    <g>
      {linhas.map((l, i) => (
        <g key={l.rot} transform={`translate(0, ${i * lh})`}>
          <text x={0} y={0} fontSize={2.2} fill="#000">
            {l.rot}
          </text>
          <text x={w} y={0} fontSize={2.2} textAnchor="end" fill="#000">
            {l.val}
          </text>
        </g>
      ))}
      <text x={0} y={linhas.length * lh + 2} fontSize={1.7} fill="#888">
        * estimado / tração provisória
      </text>
    </g>
  );
}

// --------------------------------------------------------------------------
// Carimbo (provisório — DIS-NOR-012 Anexo I a validar)
// --------------------------------------------------------------------------

function Carimbo({ x, y, w, h, projeto, escala }: { x: number; y: number; w: number; h: number; projeto: Projeto; escala: number }) {
  const meta = projeto.meta;
  const data = new Date(meta.atualizadoEm || meta.criadoEm || Date.now()).toLocaleDateString("pt-BR");
  // Colunas: bloco de identificação (esq.) | campos (dir.).
  const colDir = x + w - 70;
  const campos: { rot: string; val: string }[] = [
    { rot: "Projeto", val: meta.nome || "—" },
    { rot: "Concessionária", val: meta.concessionaria || "Neoenergia Elektro" },
    { rot: "Município / Cliente", val: "—" },
    { rot: "Responsável técnico / ART", val: "—" },
  ];
  const camposDir: { rot: string; val: string }[] = [
    { rot: "Escala", val: `1:${escala}` },
    { rot: "Folha", val: "1/1" },
    { rot: "Data", val: data },
    { rot: "Revisão", val: "0" },
  ];
  return (
    <g>
      {/* Título */}
      <text x={x + 3} y={y + 5} fontSize={3.2} fontWeight="bold" fill="#000">
        MARKFIELD · Projeto de rede de distribuição
      </text>
      <text x={x + 3} y={y + 9} fontSize={2} fill="#888">
        Carimbo provisório — a substituir pelo modelo da DIS-NOR-012 (Anexo I)
      </text>

      {/* Campos da esquerda */}
      {campos.map((c, i) => (
        <g key={c.rot} transform={`translate(${x + 3}, ${y + 15 + i * 5})`}>
          <text x={0} y={0} fontSize={1.9} fill="#888">
            {c.rot}
          </text>
          <text x={0} y={3.4} fontSize={2.6} fill="#000">
            {c.val}
          </text>
        </g>
      ))}

      {/* Linha divisória vertical */}
      <line x1={colDir - 4} y1={y} x2={colDir - 4} y2={y + h} stroke="#000" strokeWidth={0.3} />

      {/* Campos da direita */}
      {camposDir.map((c, i) => (
        <g key={c.rot} transform={`translate(${colDir}, ${y + 8 + i * 6.5})`}>
          <text x={0} y={0} fontSize={1.9} fill="#888">
            {c.rot}
          </text>
          <text x={0} y={3.6} fontSize={2.8} fill="#000">
            {c.val}
          </text>
        </g>
      ))}
    </g>
  );
}
