import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { LatLng, Projeto } from "../domain/model";
import type { PatchPonto } from "../domain/edicao";
import type { RedeEsforcos } from "../domain/esforco";
import type { ResumoMateriais } from "../domain/materiais";
import { ESRI_MAXZOOM } from "../config";
import {
  bboxProjeto,
  escalaParaCaber,
  ESCALAS_PADRAO,
  layoutFolha,
  passoEscalaM,
  projecaoNaFolha,
  type FolhaId,
  type Orientacao,
} from "../domain/prancha";
import { gerarDxfPrancha } from "../io/dxfPrancha";
import { acharPoste } from "../domain/postes-catalogo";
import { baixar } from "../io/exportar";
import { distanciaM } from "../domain/vaos";
import { espacadoresDoVao } from "../domain/materiais";
import { PACK_ELEKTRO } from "../packs/elektro";
import { textoOblongoTrafo, quebrarLinhasOblongo } from "../domain/trafo-catalogo";

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
  /** Persiste edições de ponto (ex.: posição do balão) para sobreviver à navegação. */
  onEditarPonto?: (id: string, patch: PatchPonto) => void;
}

type EscalaModo = "auto" | number;

export function PranchaView({ projeto, esforcos, rotulosEstrutura, materiais, onFechar, onEditarPonto }: Props) {
  const [folha, setFolha] = useState<FolhaId>("A3");
  const [orientacao, setOrientacao] = useState<Orientacao>("paisagem");
  const [escalaModo, setEscalaModo] = useState<EscalaModo>("auto");
  const [mostrarNumeros, setMostrarNumeros] = useState(true);
  const [mostrarEstrutura, setMostrarEstrutura] = useState(true);
  const [mostrarEsforco, setMostrarEsforco] = useState(true);
  const [mostrarTrechos, setMostrarTrechos] = useState(true);
  const [mostrarSatelite, setMostrarSatelite] = useState(false);
  const [mostrarOsmPrancha, setMostrarOsmPrancha] = useState(false);
  // posição do balão: lida de p.balaoPos (persiste no modelo)

  // Layout da folha (mm) — o mesmo do DXF (domain/prancha.ts).
  const layout = useMemo(() => layoutFolha(folha, orientacao), [folha, orientacao]);
  const { W, H, moldura, desenho, painel, carimbo } = layout;

  const bbox = useMemo(() => bboxProjeto(projeto), [projeto]);

  const escalaAuto = useMemo(
    () => (bbox ? escalaParaCaber(bbox, desenho.w, desenho.h, 0.12) : 1000),
    [bbox, desenho.w, desenho.h],
  );
  const escala = escalaModo === "auto" ? escalaAuto : escalaModo;

  // Projeção compartilhada (conteúdo centralizado na área de desenho).
  const proj = useMemo(() => projecaoNaFolha(bbox, escala, desenho), [bbox, escala, desenho]);
  const toSvg = proj.toXY;
  const cabe = proj.cabe;

  const porId = useMemo(() => new Map(projeto.pontos.map((p) => [p.id, p])), [projeto]);

  // Helper: gera grid de tiles raster para uma fonte qualquer no zoom correto.
  const buildTiles = useCallback((
    urlFn: (z: number, ty: number, tx: number) => string,
    prefixKey: string,
    zTarget: number,
  ) => {
    if (!bbox || projeto.pontos.length === 0) return null;
    const n = (z: number) => Math.pow(2, z);
    const lng2tx = (lng: number, z: number) => Math.floor((lng + 180) / 360 * n(z));
    const lat2ty = (lat: number, z: number) =>
      Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * n(z));
    const tx2lng = (x: number, z: number) => x / n(z) * 360 - 180;
    const ty2lat = (y: number, z: number) => {
      const ang = Math.PI - 2 * Math.PI * y / n(z);
      return 180 / Math.PI * Math.atan(0.5 * (Math.exp(ang) - Math.exp(-ang)));
    };
    let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
    for (const p of projeto.pontos) {
      if (p.wgs84.lat < minLat) minLat = p.wgs84.lat;
      if (p.wgs84.lat > maxLat) maxLat = p.wgs84.lat;
      if (p.wgs84.lng < minLng) minLng = p.wgs84.lng;
      if (p.wgs84.lng > maxLng) maxLng = p.wgs84.lng;
    }
    const tileDeg = 360 / n(zTarget);
    minLng -= tileDeg; maxLng += tileDeg;
    minLat -= tileDeg * 0.5; maxLat += tileDeg * 0.5;
    const txMin = lng2tx(minLng, zTarget);
    const txMax = lng2tx(maxLng, zTarget);
    const tyMin = lat2ty(maxLat, zTarget);
    const tyMax = lat2ty(minLat, zTarget);
    if ((txMax - txMin + 1) * (tyMax - tyMin + 1) > 200) return null;
    // Pré-calcula a posição x de cada coluna e y de cada linha com uma única
    // lat/lng de referência. Isso garante que tiles adjacentes compartilhem
    // EXATAMENTE a mesma coordenada de borda — sem fresta nem sobreposição.
    const refLat = (minLat + maxLat) / 2;
    const refLng = (minLng + maxLng) / 2;
    const colX: number[] = [];
    for (let col = txMin; col <= txMax + 1; col++) {
      colX.push(proj.toXY({ lat: refLat, lng: tx2lng(col, zTarget) })[0]);
    }
    const rowY: number[] = [];
    for (let row = tyMin; row <= tyMax + 1; row++) {
      rowY.push(proj.toXY({ lat: ty2lat(row, zTarget), lng: refLng })[1]);
    }
    const tiles: { key: string; url: string; x: number; y: number; w: number; h: number }[] = [];
    for (let tx = txMin; tx <= txMax; tx++) {
      for (let ty = tyMin; ty <= tyMax; ty++) {
        const xi = tx - txMin;
        const yi = ty - tyMin;
        // +0.5 mm de sobreposição: o tile seguinte cobre esta franja,
        // eliminando o artefato de 1 px que o renderer cria entre imagens SVG.
        tiles.push({
          key: `${prefixKey}-${zTarget}-${tx}-${ty}`,
          url: urlFn(zTarget, ty, tx),
          x: colX[xi],
          y: rowY[yi],
          w: colX[xi + 1] - colX[xi] + 0.5,
          h: rowY[yi + 1] - rowY[yi] + 0.5,
        });
      }
    }
    return tiles;
  }, [bbox, proj, projeto.pontos]);

  // Zoom do satélite: igual ao editor (ESRI_MAXZOOM), reduzindo para áreas grandes
  const zSat = useMemo(() => {
    const zMax = ESRI_MAXZOOM;
    if (escala > 10000) return Math.min(zMax, 13);
    if (escala > 5000)  return Math.min(zMax, 14);
    if (escala > 2000)  return Math.min(zMax, 15);
    return zMax; // 1:1000 e 1:2000 → zoom máximo disponível (16 ou 17)
  }, [escala]);

  const satTiles = useMemo(
    () => mostrarSatelite
      ? buildTiles((z, ty, tx) =>
          `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${ty}/${tx}`,
          "sat", zSat)
      : null,
    [mostrarSatelite, buildTiles, zSat],
  );

  // Mapa de ruas na prancha: Esri World Street Map — mesmo servidor do satélite,
  // sem chave, sem bloqueio de localhost (tile.openstreetmap.org bloqueia dev).
  const osmTiles = useMemo(() => {
    if (!mostrarOsmPrancha) return null;
    const z = Math.min(zSat, 17);
    return buildTiles(
      (_z, ty, tx) =>
        `https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/${_z}/${ty}/${tx}`,
      "osm", z,
    );
  }, [mostrarOsmPrancha, buildTiles, zSat]);

  const baixarDxf = () => {
    const dxf = gerarDxfPrancha({ projeto, esforcos, rotulosEstrutura, materiais, folha, orientacao, escala });
    const base = (projeto.meta.nome || "projeto").replace(/[^\p{L}\p{N}_-]+/gu, "_");
    baixar(new Blob([dxf], { type: "application/dxf" }), `${base}-prancha.dxf`);
  };

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
        <label className="prancha-chk">
          <input type="checkbox" checked={mostrarTrechos} onChange={(e) => setMostrarTrechos(e.target.checked)} />
          Vãos
        </label>
        <label className="prancha-chk">
          <input type="checkbox" checked={mostrarSatelite} onChange={(e) => setMostrarSatelite(e.target.checked)} />
          🛰 Satélite
        </label>
        <label className="prancha-chk">
          <input type="checkbox" checked={mostrarOsmPrancha} onChange={(e) => setMostrarOsmPrancha(e.target.checked)} />
          🌿 OSM
        </label>
        <span className="prancha-barra-sep" />
        <button className="btn" onClick={baixarDxf} title="Baixa a prancha em DXF (a folha em mm), como pede a norma junto do PDF">
          Baixar DXF
        </button>
        <button className="btn" onClick={() => window.print()} title="Imprime / salva em PDF no tamanho da folha">
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
          <rect x={moldura.x} y={moldura.y} width={moldura.w} height={moldura.h} fill="none" stroke="#000" strokeWidth={0.5} />

          {/* Divisórias do painel direito e do carimbo */}
          <line x1={painel.x} y1={moldura.y} x2={painel.x} y2={carimbo.y} stroke="#000" strokeWidth={0.3} />
          <line x1={moldura.x} y1={carimbo.y} x2={moldura.x + moldura.w} y2={carimbo.y} stroke="#000" strokeWidth={0.5} />

          {/* --- Área de desenho (rede em escala) --- */}
          <g clipPath="url(#clip-desenho)">
            {/* Fundo de satélite — tiles Esri individuais posicionados em escala */}
            {satTiles && satTiles.map((t) => (
              <image key={t.key} x={t.x} y={t.y} width={t.w} height={t.h}
                href={t.url} preserveAspectRatio="none" />
            ))}
            {/* Overlay mapa de ruas (Esri Street Map) — semi-trans sobre sat, opaco sozinho */}
            {osmTiles && osmTiles.map((t) => (
              <image key={t.key} x={t.x} y={t.y} width={t.w} height={t.h}
                href={t.url} preserveAspectRatio="none"
                opacity={mostrarSatelite ? 0.5 : 1.0} />
            ))}

            {!bbox && (
              <text x={desenho.x + desenho.w / 2} y={desenho.y + desenho.h / 2} fontSize={4} textAnchor="middle" fill="#666">
                Sem pontos para desenhar.
              </text>
            )}

            {/* Trechos — proposto = pontilhado, tração reduzida = traço-ponto menor */}
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
                // Proposto = pontilhado (DIS-NOR-012); tração reduzida = traço menor
                const dash = t.tracaoReduzida ? "1.5 1.5" : "3 2";
                return (
                  <polyline
                    key={t.id}
                    points={pts}
                    fill="none"
                    stroke="#000"
                    strokeWidth={0.5}
                    strokeDasharray={dash}
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
                      // Direção poste → âncora (normalizada)
                      const dxE = ax - px, dyE = ay - py;
                      const lenE = Math.sqrt(dxE * dxE + dyE * dyE);
                      if (lenE < 0.01) return null;
                      const uxE = dxE / lenE, uyE = dyE / lenE;
                      // Semicírculo ⊃: diâmetro ⊥ ao estai, arco voltado para fora do poste
                      // Pontos extremos do diâmetro: perp (-uyE, uxE) aplicada ao centro da âncora
                      const rA = 1.5;
                      const ap1x = ax - uyE * rA, ap1y = ay + uxE * rA;
                      const ap2x = ax + uyE * rA, ap2y = ay - uxE * rA;
                      return (
                        <g key={es.id}>
                          {/* Linha pontilhada proposta poste → âncora */}
                          <line x1={px} y1={py} x2={ax} y2={ay}
                            stroke="#000" strokeWidth={0.35} strokeDasharray="2.5 1.5" />
                          {/* Âncora: semicírculo ⊃ — arco CCW (sweep=0) = curva para fora do poste */}
                          <path
                            d={`M ${ap1x} ${ap1y} A ${rA} ${rA} 0 0 0 ${ap2x} ${ap2y}`}
                            fill="none" stroke="#000" strokeWidth={0.4}
                          />
                        </g>
                      );
                    })}
                  </g>
                );
              })}

            {/* Rótulos de trechos: cabo + espaçadores + distância, alinhados ao trecho */}
            {bbox && mostrarTrechos &&
              projeto.trechos.map((t) => {
                if (!t.dePontoId || !t.aPontoId) return null;
                const de = porId.get(t.dePontoId);
                const a = porId.get(t.aPontoId);
                if (!de || !a) return null;
                const distM = distanciaM(de.wgs84, a.wgs84);
                if (distM < 1) return null;
                const [ax2, ay2] = toSvg(de.wgs84);
                const [bx2, by2] = toSvg(a.wgs84);
                const nEsp = espacadoresDoVao(distM);
                const cabo = t.tipoCabo ?? "A35P";
                return (
                  <TrechoVao
                    key={`tv-${t.id}`}
                    ax={ax2} ay={ay2} bx={bx2} by={by2}
                    cabo={cabo}
                    distM={Math.round(distM)}
                    nEsp={nEsp}
                  />
                );
              })}

            {/* Postes + balões de identificação */}
            {bbox &&
              projeto.pontos.map((p) => {
                const [x, y] = toSvg(p.wgs84);
                const trafo = p.tipo === "transformador";
                const e = esforcos?.postes.get(p.id);
                const cod = rotulosEstrutura.get(p.id);
                const tp = acharPoste(p.posteTipo);
                const mostraEsf = mostrarEsforco && e && e.esforcoDaN >= 1 && (e.precisaEstai || e.estais.length > 0);

                // Texto do balão: "alturaM cargaDaN COD" — ex.: "11 400 CE2"
                const alturaM = tp?.alturaM ?? 11;
                const cargaDaN = tp?.cargaDaN ?? (p.capacidadeDaN ?? 400);
                const partesBalao: string[] = [];
                if (mostrarNumeros) {
                  partesBalao.push(`${alturaM} ${cargaDaN}`);
                }
                if (mostrarEstrutura && cod) {
                  partesBalao.push(cod);
                }
                const textoBalao = partesBalao.join(" ");

                // Linhas do balão oblongo (padrão Elektro DIS-NOR-013)
                // Trafo: texto completo do oblongo partido em linhas pelo helper.
                // Poste comum: texto simples em array unitário.
                let balaoLinhas: string[];
                if (trafo && p.trafo) {
                  const estruturaCod = cod ?? "";
                  const textoObl = textoOblongoTrafo(alturaM, cargaDaN, estruturaCod, p.trafo);
                  balaoLinhas = quebrarLinhasOblongo(textoObl, 26);
                } else {
                  balaoLinhas = textoBalao ? [textoBalao] : [];
                }

                const pos = p.balaoPos ?? 0;

                // Direção da rede no poste (para rotacionar triângulo do trafo)
                // Soma vetorial das direções de todos os trechos conectados.
                let txUx = 1, txUy = 0;
                if (trafo) {
                  let sumDx = 0, sumDy = 0;
                  for (const t of projeto.trechos) {
                    const vizId = t.dePontoId === p.id ? t.aPontoId
                                : t.aPontoId  === p.id ? t.dePontoId
                                : null;
                    const viz = vizId ? porId.get(vizId) : undefined;
                    if (!viz) continue;
                    const [vx, vy] = toSvg(viz.wgs84);
                    const dx = vx - x, dy = vy - y;
                    const len = Math.sqrt(dx * dx + dy * dy);
                    if (len > 0.01) { sumDx += dx / len; sumDy += dy / len; }
                  }
                  const ls = Math.sqrt(sumDx * sumDx + sumDy * sumDy);
                  if (ls > 0.01) { txUx = sumDx / ls; txUy = sumDy / ls; }
                }
                // Perpendicular da direção da rede apontando para SVG-y+ (sul = baixo)
                let txPx = -txUy, txPy = txUx;
                if (txPy < 0 || (Math.abs(txPy) < 0.001 && txPx < 0)) {
                  txPx = txUy; txPy = -txUx;
                }
                // Pontos do triângulo do trafo (H=8 mm altura, B=3 mm meia-base)
                const TH = 8, TB = 3;
                const bmx = x + TH * txPx, bmy = y + TH * txPy;      // centro da base
                const b1x = bmx + TB * txUx,  b1y = bmy + TB * txUy; // extremo direito
                const b2x = bmx - TB * txUx,  b2y = bmy - TB * txUy; // extremo esquerdo

                return (
                  <g key={`pt-${p.id}`}>
                    {/* Símbolo do poste — DIS-NOR-012 Anexo VIII, r=2 mm */}
                    {trafo ? (
                      /* Transformador "a instalar" — DIS-NOR-012 Anexo VIII:
                         VÉRTICE em (x,y) = centro do poste = fim da rede.
                         BASE paralela à rede, 8 mm na perpendicular (lado sul/baixo).
                         Metade ESQ branca / DIR preta. Círculo do poste por cima. */
                      <>
                        {/* === TRIÂNGULO rotacionado — base paralela à rede === */}
                        <polygon points={`${x},${y} ${bmx},${bmy} ${b2x},${b2y}`} fill="#fff" stroke="none" />
                        <polygon points={`${x},${y} ${b1x},${b1y} ${bmx},${bmy}`} fill="#000" stroke="none" />
                        <polygon
                          points={`${x},${y} ${b1x},${b1y} ${b2x},${b2y}`}
                          fill="none" stroke="#000" strokeWidth={0.4}
                        />
                        {/* === POSTE (circular tubular) centrado em (x,y) — por cima do triângulo === */}
                        <circle cx={x} cy={y} r={2.0} fill="#fff" stroke="#000" strokeWidth={0.4} />
                        <path
                          d={`M ${x} ${y-2.0} A 2.0 2.0 0 0 0 ${x} ${y+2.0} Z`}
                          fill="#000"
                        />
                        <circle cx={x} cy={y} r={2.0} fill="none" stroke="#000" strokeWidth={0.4} />
                        <circle cx={x} cy={y} r={1.2} fill="none" stroke="#000" strokeWidth={0.4} />
                      </>
                    ) : (
                      /* Poste circular TUBULAR "a instalar" — DIS-NOR-012 Anexo VIII:
                         dois círculos concêntricos (anel externo r=2 mm, interno r=1,2 mm),
                         metade ESQUERDA preenchida em preto. */
                      <>
                        {/* Fundo branco do anel externo */}
                        <circle cx={x} cy={y} r={2.0} fill="#fff" stroke="#000" strokeWidth={0.4} />
                        {/* Metade esquerda preta (arco horário de cima→baixo pelo lado esquerdo) */}
                        <path
                          d={`M ${x} ${y - 2.0} A 2.0 2.0 0 0 0 ${x} ${y + 2.0} Z`}
                          fill="#000"
                        />
                        {/* Contorno externo redesenhado sobre o preenchimento */}
                        <circle cx={x} cy={y} r={2.0} fill="none" stroke="#000" strokeWidth={0.4} />
                        {/* Anel interno (tubo) — visível sobre branco e sobre preto */}
                        <circle cx={x} cy={y} r={1.2} fill="none" stroke="#000" strokeWidth={0.4} />
                      </>
                    )}

                    {/* Balão oblongo — clique para rodar posição */}
                    {balaoLinhas.length > 0 && (
                      <BalaoPosto
                        x={x} y={y}
                        linhas={balaoLinhas}
                        reinstalacao={p.reinstalacao}
                        retirada={p.retirada}
                        observacao={p.observacao}
                        pos={pos}
                        onClick={() =>
                          onEditarPonto?.(p.id, { balaoPos: (pos + 1) % 4 })
                        }
                      />
                    )}

                    {/* Esforço (se habilitado) */}
                    {mostraEsf && (
                      <text x={x + 1.6} y={y + 4} fontSize={2} fill="#333">
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
        <SimbLinha dy={0} label="Poste circ. tubular">
          {/* Miniatura do símbolo DIS-NOR-012: dois anéis, metade esq. preta */}
          <circle cx={1} cy={-0.8} r={0.9} fill="#fff" stroke="#000" strokeWidth={0.35} />
          <path d={`M 1 ${-0.8 - 0.9} A 0.9 0.9 0 0 0 1 ${-0.8 + 0.9} Z`} fill="#000" />
          <circle cx={1} cy={-0.8} r={0.9} fill="none" stroke="#000" strokeWidth={0.35} />
          <circle cx={1} cy={-0.8} r={0.55} fill="none" stroke="#000" strokeWidth={0.35} />
        </SimbLinha>
        <SimbLinha dy={5} label="Transformador">
          {/* Mini: triângulo + linha + círculo tubular */}
          <polygon points={`${-0.5},${-3.5} ${2.5},${-3.5} ${1},${-1.8}`} fill="#fff" stroke="none" />
          <polygon points={`${1},${-3.5} ${2.5},${-3.5} ${1},${-1.8}`} fill="#000" stroke="none" />
          <polygon points={`${-0.5},${-3.5} ${2.5},${-3.5} ${1},${-1.8}`} fill="none" stroke="#000" strokeWidth={0.35} />
          <line x1={1} y1={-1.8} x2={1} y2={-0.8} stroke="#000" strokeWidth={0.35} />
          <circle cx={1} cy={-0.8} r={0.9} fill="#fff" stroke="#000" strokeWidth={0.3} />
          <path d={`M 1 ${-0.8-0.9} A 0.9 0.9 0 0 0 1 ${-0.8+0.9} Z`} fill="#000" />
          <circle cx={1} cy={-0.8} r={0.9} fill="none" stroke="#000" strokeWidth={0.3} />
          <circle cx={1} cy={-0.8} r={0.55} fill="none" stroke="#000" strokeWidth={0.3} />
        </SimbLinha>
        <SimbLinha dy={10} label="Rede compacta">
          <line x1={-0.5} y1={-0.8} x2={2.5} y2={-0.8} stroke="#000" strokeWidth={0.5} />
        </SimbLinha>
        <SimbLinha dy={15} label="Tração reduzida">
          <line x1={-0.5} y1={-0.8} x2={2.5} y2={-0.8} stroke="#000" strokeWidth={0.5} strokeDasharray="1 0.8" />
        </SimbLinha>
        <SimbLinha dy={20} label="Estai proposto">
          {/* Linha pontilhada + semicírculo âncora ⊃ */}
          <line x1={-0.5} y1={-0.5} x2={2} y2={-0.5} stroke="#000" strokeWidth={0.35} strokeDasharray="1.5 0.8" />
          <path d={`M 2 ${-0.5-0.8} A 0.8 0.8 0 0 0 2 ${-0.5+0.8}`} fill="none" stroke="#000" strokeWidth={0.35} />
        </SimbLinha>
      </g>
      <text x={x + 3} y={by + 42} fontSize={1.8} fill="#888">
        DIS-NOR-012 · Anexo VIII
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
  for (const p of materiais.postesPorTipo) linhas.push({ rot: `Poste ${p.rotulo}`, val: String(p.n) });
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
// Balão oblongo de identificação do poste (DIS-NOR-013)
// --------------------------------------------------------------------------

/**
 * Balão oblongo de identificação do poste (DIS-NOR-012 / DIS-NOR-013).
 *
 * Zonas (DIS-NOR-012 simbologia):
 *
 *   [observacao — texto acima do balão, texto livre]
 *   [retirada   — texto acima do balão com "X" (dois traços diagonais finos)]
 *   ┌─────────────────────────────┐
 *   │  linhas[] — INSTALAÇÃO      │  ← sempre presente, sem linha divisória
 *   ├─────────────────────────────┤  ← linha divisória, SÓ se reinstalacao definido
 *   │  reinstalacao — REINSTALAÇÃO│  ← abaixo da linha (opcional)
 *   └─────────────────────────────┘
 *
 * Retirada: "X" feito com dois traços diagonais finos cruzando o texto (DIS-NOR-012).
 * Observação/retirada ficam imediatamente acima do oblongo (~1 mm de folga).
 *
 * pos: 0=cima-dir, 1=cima-esq, 2=baixo-dir, 3=baixo-esq
 * Clique no balão para ciclar a posição.
 */
function BalaoPosto({
  x, y, linhas, reinstalacao, retirada, observacao, pos, onClick,
}: {
  x: number; y: number;
  linhas: string[];
  reinstalacao?: string;
  retirada?: string;
  observacao?: string;
  pos: number;
  onClick: () => void;
}) {
  const fontSize = 2.2;
  const lh = 2.6;        // espaçamento entre linhas dentro do oblongo (mm)
  const aboveLh = 2.6;   // espaçamento das linhas acima do oblongo
  const paddingV = 1.0;  // margem vertical interna topo/fundo
  const divH = 0.25;     // espessura da linha divisória

  // Linhas de reinstalação (quebradas pelo mesmo limite)
  const linhasReinst = reinstalacao ? quebrarLinhasOblongo(reinstalacao, 26) : [];

  // Linhas de observação
  const obsLinhas: string[] = observacao
    ? observacao.split("\n").map((l) => l.trim()).filter(Boolean)
    : [];

  // Largura do oblongo: linha mais longa entre instalação + reinstalação + acima
  const cadidatas = [...linhas, ...linhasReinst];
  if (retirada) cadidatas.push(retirada);
  obsLinhas.forEach((l) => cadidatas.push(l));
  const bw = Math.max(...cadidatas.map((l) => l.length * 1.35 + 3), 10);

  // Altura do oblongo
  const bhInst = paddingV + lh * linhas.length + paddingV;
  const bhReinst = linhasReinst.length > 0
    ? divH + paddingV + lh * linhasReinst.length + paddingV
    : 0;
  const bh = bhInst + bhReinst;

  const rx = 2.0;
  const offX = 8;
  const offY = 6;

  // Centro do oblongo por posição
  const configs = [
    { bx: x + offX + bw / 2, by: y - offY - bh },
    { bx: x - offX - bw / 2, by: y - offY - bh },
    { bx: x + offX + bw / 2, by: y + offY / 2 },
    { bx: x - offX - bw / 2, by: y + offY / 2 },
  ];
  const { bx, by } = configs[pos % 4];

  // Linha de chamada: canto mais próximo do poste
  const leaderCorners = [
    { lx: bx - bw / 2, ly: by + bh },
    { lx: bx + bw / 2, ly: by + bh },
    { lx: bx - bw / 2, ly: by },
    { lx: bx + bw / 2, ly: by },
  ];
  const { lx, ly } = leaderCorners[pos % 4];

  // Y dos textos dentro do oblongo
  const yInst0 = by + paddingV + fontSize;
  const yDivisoria = by + bhInst;
  const yReinst0 = yDivisoria + divH + paddingV + fontSize;

  // Posicionamento compacto dos textos acima do oblongo:
  // o último item acima fica a 1 mm do topo do oblongo (by).
  const gapAcima = 1.0;
  const nAcima = obsLinhas.length + (retirada ? 1 : 0);
  // baseline do ÚLTIMO item acima = by - gapAcima
  // baseline do item i (de cima para baixo) = by - gapAcima - (nAcima - 1 - i) * aboveLh
  const yAcima = (i: number) => by - gapAcima - (nAcima - 1 - i) * aboveLh;

  return (
    <g onClick={onClick} style={{ cursor: "pointer" }}>

      {/* ── Textos acima do oblongo ── */}

      {/* Observação (texto livre, sem marcação especial) */}
      {obsLinhas.map((linha, i) => (
        <text
          key={`obs-${i}`}
          x={bx} y={yAcima(i)}
          fontSize={fontSize} textAnchor="middle"
          fill="#000" fontFamily="Arial, sans-serif"
        >
          {linha}
        </text>
      ))}

      {/* Retirada: texto normal + "X" de dois traços diagonais finos (DIS-NOR-012) */}
      {retirada && (() => {
        const yr = yAcima(obsLinhas.length);
        // Caixa aproximada do texto (capitals + descenders)
        const rw = retirada.length * 1.35 + 2;
        const xt = bx - rw / 2;
        const xb = bx + rw / 2;
        const ytop = yr - fontSize * 0.82; // topo dos maiúsculos
        const ybot = yr + fontSize * 0.18; // linha de base
        return (
          <g>
            <text
              x={bx} y={yr}
              fontSize={fontSize} textAnchor="middle"
              fill="#000" fontFamily="Arial, sans-serif"
            >
              {retirada}
            </text>
            {/* X: traço superior-esq → inferior-dir */}
            <line x1={xt} y1={ytop} x2={xb} y2={ybot} stroke="#000" strokeWidth={0.22} />
            {/* X: traço superior-dir → inferior-esq */}
            <line x1={xb} y1={ytop} x2={xt} y2={ybot} stroke="#000" strokeWidth={0.22} />
          </g>
        );
      })()}

      {/* ── Linha de chamada (leader) ── */}
      <line x1={x} y1={y} x2={lx} y2={ly} stroke="#000" strokeWidth={0.25} />

      {/* ── Oblongo ── */}
      <rect
        x={bx - bw / 2} y={by}
        width={bw} height={bh}
        rx={rx} ry={rx}
        fill="#fff" stroke="#000" strokeWidth={0.3}
      />

      {/* INSTALAÇÃO — todas as linhas, mesma fonte */}
      {linhas.map((linha, i) => (
        <text
          key={`inst-${i}`}
          x={bx} y={yInst0 + i * lh}
          fontSize={fontSize} textAnchor="middle"
          fill="#000" fontFamily="Arial, sans-serif" fontWeight="bold"
        >
          {linha}
        </text>
      ))}

      {/* Linha divisória + REINSTALAÇÃO (só quando preenchida) */}
      {linhasReinst.length > 0 && (
        <>
          <line
            x1={bx - bw / 2 + 1} y1={yDivisoria}
            x2={bx + bw / 2 - 1} y2={yDivisoria}
            stroke="#000" strokeWidth={0.22}
          />
          {linhasReinst.map((linha, i) => (
            <text
              key={`reinst-${i}`}
              x={bx} y={yReinst0 + i * lh}
              fontSize={fontSize} textAnchor="middle"
              fill="#000" fontFamily="Arial, sans-serif" fontWeight="bold"
            >
              {linha}
            </text>
          ))}
        </>
      )}
    </g>
  );
}

// --------------------------------------------------------------------------
// Rótulo de trecho: cabo rotacionado + espaçadores + distância (DIS-NOR-012 Anexo VIII)
// --------------------------------------------------------------------------

/**
 * Renderiza sobre um trecho:
 * - Label do cabo acima da linha (rotacionado, formato "3xA35P(14,05) - 15 kV")
 * - Marcas de espaçador perpendiculares à linha
 * - Distância em metros + contagem de espaçadores abaixo da linha
 */
function TrechoVao({
  ax, ay, bx, by, cabo, distM, nEsp,
}: {
  ax: number; ay: number; bx: number; by: number;
  cabo: string; distM: number; nEsp: number;
}) {
  const mx = (ax + bx) / 2;
  const my = (ay + by) / 2;
  // Ângulo da linha em graus; normalizado para texto nunca ficar de cabeça para baixo
  let angle = Math.atan2(by - ay, bx - ax) * 180 / Math.PI;
  if (angle > 90) angle -= 180;
  if (angle < -90) angle += 180;

  // Label do cabo: "3xCOD(cordoalha) - tensão kV" — usa diâmetro da cordoalha
  const entry = PACK_ELEKTRO.cabos.find((c) => c.codigo === cabo);
  const diam = entry?.cordoalhaDiametroMm
    ? entry.cordoalhaDiametroMm.toFixed(2).replace(".", ",")
    : entry?.diametroMm.toFixed(2).replace(".", ",") ?? "?";
  const tensao = entry ? entry.tensaoKv : 15;
  const cableLabel = `3x${cabo}(${diam}) - ${tensao} kV`;

  const bw = Math.max(cableLabel.length * 1.1 + 2, 14);
  const bh = 3.2;

  return (
    <g transform={`rotate(${angle}, ${mx}, ${my})`}>
      {/* Label do cabo: acima da linha, próximo (offset 3 mm) */}
      <rect
        x={mx - bw / 2} y={my - 3 - bh}
        width={bw} height={bh}
        rx={1.0} ry={1.0}
        fill="#fff" stroke="#c00" strokeWidth={0.35}
      />
      <text
        x={mx} y={my - 3 - bh / 2 + 0.75}
        fontSize={1.8} textAnchor="middle"
        fill="#c00" fontFamily="Arial, sans-serif"
      >
        {cableLabel}
      </text>

      {/* Distância e espaçadores: abaixo da linha, próximo (offset 2 mm) */}
      <text x={mx} y={my + 3.5}
        fontSize={1.7} textAnchor="middle"
        fill="#444" fontFamily="Arial, sans-serif"
      >
        {distM} m  ({nEsp} espaçadores)
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
  // Divisão: espaço reservado do carimbo (esq.) | espaço de aprovação (dir.).
  const divX = x + w * 0.62;
  return (
    <g>
      {/* Divisória carimbo | aprovação */}
      <line x1={divX} y1={y} x2={divX} y2={y + h} stroke="#000" strokeWidth={0.3} />

      {/* Esquerda: espaço reservado do carimbo (sem campos inventados) */}
      <text x={x + 3} y={y + 6} fontSize={3.2} fontWeight="bold" fill="#000">
        MARKFIELD · Projeto de rede de distribuição
      </text>
      <text x={x + 3} y={y + 10.5} fontSize={2} fill="#888">
        Espaço reservado para o carimbo (DIS-NOR-012 · Anexo I)
      </text>
      {/* Rodapé factual: nome, escala, folha, data (não é campo do carimbo) */}
      <text x={x + 3} y={y + h - 3} fontSize={2.2} fill="#000">
        {(meta.nome || "—") + "   ·   Escala 1:" + escala + "   ·   Folha 1/1   ·   " + data}
      </text>

      {/* Direita: espaço de aprovação da concessionária (em branco) */}
      <text x={divX + 4} y={y + 6} fontSize={3} fontWeight="bold" fill="#000">
        APROVAÇÃO
      </text>
      <text x={divX + 4} y={y + 10.5} fontSize={2} fill="#888">
        {meta.concessionaria ? meta.concessionaria : "Concessionária"}
      </text>
    </g>
  );
}
