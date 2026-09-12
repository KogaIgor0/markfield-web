import type { LatLng, Projeto } from "../domain/model";
import type { RedeEsforcos } from "../domain/esforco";
import type { ResumoMateriais } from "../domain/materiais";
import {
  bboxProjeto,
  layoutFolha,
  passoEscalaM,
  projecaoNaFolha,
  type FolhaId,
  type Orientacao,
} from "../domain/prancha";
import { acharPoste } from "../domain/postes-catalogo";

/**
 * DXF da PRANCHA (B6) — a folha formatada, em milímetros de papel.
 *
 * A norma pede a prancha em **DXF e PDF** (o PDF sai pela impressão do
 * navegador). Este DXF é a **folha 1:1 em mm**: moldura, a rede já em escala,
 * postes/rótulos/estai, Norte, escala gráfica, simbologia (DIS-NOR-012 Anexo
 * VIII) e o quadro de materiais, mais o espaço reservado de carimbo/aprovação.
 * Usa o MESMO layout/projeção do SVG (`domain/prancha.ts`), então a folha
 * impressa e o DXF batem. É o complemento do `io/dxf.ts` (aquele é o cadastro
 * georreferenciado em UTM; este é a folha desenhada).
 *
 * DXF R12 (AC1009) escrito à mão, unidades em mm. Eixo Y do DXF cresce pra
 * CIMA; as coordenadas de página vêm com Y pra baixo, então invertemos com
 * `fy(y) = H - y`.
 */

interface ParamsPrancha {
  projeto: Projeto;
  esforcos: RedeEsforcos | null;
  rotulosEstrutura: Map<string, string>;
  materiais: ResumoMateriais | null;
  folha: FolhaId;
  orientacao: Orientacao;
  escala: number;
}

// Camadas do DXF da folha.
const CAM = {
  moldura: { nome: "MF_MOLDURA", cor: 7 },
  rede: { nome: "MF_REDE", cor: 7 },
  redeReduzida: { nome: "MF_REDE_REDUZIDA", cor: 4 },
  poste: { nome: "MF_POSTE", cor: 7 },
  trafo: { nome: "MF_TRAFO", cor: 5 },
  estai: { nome: "MF_ESTAI", cor: 7 },
  numero: { nome: "MF_NUMERO", cor: 7 },
  estrutura: { nome: "MF_ESTRUTURA", cor: 1 },
  esforco: { nome: "MF_ESFORCO", cor: 8 },
  cota: { nome: "MF_COTAS", cor: 7 },
  carimbo: { nome: "MF_CARIMBO", cor: 7 },
} as const;

function rec(code: number, value: string | number): string {
  return `${code}\n${value}\n`;
}
function nn(v: number): string {
  return v.toFixed(3);
}

export function gerarDxfPrancha(p: ParamsPrancha): string {
  const L = layoutFolha(p.folha, p.orientacao);
  const H = L.H;
  const fy = (y: number) => H - y; // página (y↓) → DXF (y↑)

  const bbox = bboxProjeto(p.projeto);
  const proj = projecaoNaFolha(bbox, p.escala, L.desenho);

  let ent = "";

  const line = (cam: string, x1: number, y1: number, x2: number, y2: number) =>
    (ent +=
      rec(0, "LINE") + rec(8, cam) +
      rec(10, nn(x1)) + rec(20, nn(fy(y1))) + rec(30, "0.0") +
      rec(11, nn(x2)) + rec(21, nn(fy(y2))) + rec(31, "0.0"));

  const circle = (cam: string, cx: number, cy: number, r: number) =>
    (ent += rec(0, "CIRCLE") + rec(8, cam) + rec(10, nn(cx)) + rec(20, nn(fy(cy))) + rec(30, "0.0") + rec(40, nn(r)));

  const rect = (cam: string, x: number, y: number, w: number, h: number) => {
    line(cam, x, y, x + w, y);
    line(cam, x + w, y, x + w, y + h);
    line(cam, x + w, y + h, x, y + h);
    line(cam, x, y + h, x, y);
  };

  // halign: 0=esq 1=centro 2=dir. valign fixo em baseline (0).
  const text = (cam: string, x: number, y: number, h: number, s: string, halign = 0) => {
    ent +=
      rec(0, "TEXT") + rec(8, cam) +
      rec(10, nn(x)) + rec(20, nn(fy(y))) + rec(30, "0.0") +
      rec(40, nn(h)) + rec(1, s) + rec(72, halign) +
      rec(11, nn(x)) + rec(21, nn(fy(y))) + rec(31, "0.0");
  };

  // --- Moldura + divisórias ---
  rect(CAM.moldura.nome, L.moldura.x, L.moldura.y, L.moldura.w, L.moldura.h);
  line(CAM.moldura.nome, L.painel.x, L.moldura.y, L.painel.x, L.carimbo.y);
  line(CAM.moldura.nome, L.moldura.x, L.carimbo.y, L.moldura.x + L.moldura.w, L.carimbo.y);

  // --- Área de desenho ---
  const porId = new Map(p.projeto.pontos.map((pt) => [pt.id, pt]));

  if (bbox) {
    // Trechos.
    for (const t of p.projeto.trechos) {
      const caminho =
        t.caminho && t.caminho.length >= 2
          ? t.caminho
          : ([porId.get(t.dePontoId ?? "")?.wgs84, porId.get(t.aPontoId ?? "")?.wgs84].filter(
              Boolean,
            ) as LatLng[]);
      if (caminho.length < 2) continue;
      const cam = t.tracaoReduzida ? CAM.redeReduzida.nome : CAM.rede.nome;
      for (let i = 0; i + 1 < caminho.length; i++) {
        const [x1, y1] = proj.toXY(caminho[i]);
        const [x2, y2] = proj.toXY(caminho[i + 1]);
        line(cam, x1, y1, x2, y2);
      }
    }

    // Estais.
    if (p.esforcos) {
      for (const pt of p.projeto.pontos) {
        const e = p.esforcos.postes.get(pt.id);
        if (!e || e.estais.length === 0) continue;
        const [px, py] = proj.toXY(pt.wgs84);
        for (const es of e.estais) {
          const [ax, ay] = proj.toXY(es.ate);
          line(CAM.estai.nome, px, py, ax, ay);
          rect(CAM.estai.nome, ax - 0.7, ay - 0.7, 1.4, 1.4); // âncora
        }
      }
    }

    // Postes + rótulos.
    for (const pt of p.projeto.pontos) {
      const [x, y] = proj.toXY(pt.wgs84);
      if (pt.tipo === "transformador") {
        circle(CAM.trafo.nome, x, y, 1.6);
        circle(CAM.trafo.nome, x, y, 0.6);
      } else {
        circle(CAM.poste.nome, x, y, 0.9);
      }
      if (pt.numero) text(CAM.numero.nome, x + 1.6, y - 1.4, 2.6, pt.numero);
      const cod = p.rotulosEstrutura.get(pt.id);
      if (cod) text(CAM.estrutura.nome, x + 1.6, y + 2.6, 2.2, cod);
      const e = p.esforcos?.postes.get(pt.id);
      const mostraEsf = e && e.esforcoDaN >= 1 && (e.precisaEstai || e.estais.length > 0);
      if (mostraEsf) text(CAM.esforco.nome, x + 1.6, y + 5.2, 2, `${Math.round(e!.esforcoDaN)} daN`);
      const tp = acharPoste(pt.posteTipo);
      if (tp) text(CAM.numero.nome, x + 1.6, y + (mostraEsf ? 7.8 : 5.2), 2, `${tp.alturaM}/${tp.cargaDaN}`);
    }
  } else {
    text(CAM.cota.nome, L.desenho.x + L.desenho.w / 2, L.desenho.y + L.desenho.h / 2, 4, "Sem pontos", 1);
  }

  // --- Painel direito ---
  const pnl = L.painel;
  const cx = pnl.x + pnl.w / 2;
  // Norte.
  line(CAM.cota.nome, cx, pnl.y + 5, cx, pnl.y + 15);
  line(CAM.cota.nome, cx, pnl.y + 4, cx - 1.6, pnl.y + 8);
  line(CAM.cota.nome, cx, pnl.y + 4, cx + 1.6, pnl.y + 8);
  text(CAM.cota.nome, cx, pnl.y + 20, 3, "N", 1);
  // Escala.
  const by = pnl.y + 30;
  text(CAM.cota.nome, pnl.x + 3, by - 3, 2.6, `Escala 1:${p.escala}`);
  const barraMaxMm = pnl.w - 12;
  const passoM = passoEscalaM(barraMaxMm, p.escala);
  const barraMm = (passoM * 1000) / p.escala;
  const bx = pnl.x + 6;
  if (barraMm > 0) {
    rect(CAM.cota.nome, bx, by, barraMm, 1.6);
    line(CAM.cota.nome, bx + barraMm / 2, by, bx + barraMm / 2, by + 1.6);
    text(CAM.cota.nome, bx, by + 5, 2.2, "0");
    text(CAM.cota.nome, bx + barraMm, by + 5, 2.2, `${passoM} m`, 1);
  }
  // Simbologia (DIS-NOR-012 Anexo VIII).
  text(CAM.carimbo.nome, pnl.x + 3, by + 12, 2.8, "Simbologia");
  const simb: [string, string][] = [
    ["o", "Poste"],
    ["(o)", "Transformador"],
    ["---", "Rede compacta"],
    ["- -", "Traçao reduzida"],
    ["/#", "Estai"],
  ];
  simb.forEach(([g, r], i) => {
    const yy = by + 17 + i * 4.2;
    text(CAM.carimbo.nome, pnl.x + 4, yy, 2.2, g);
    text(CAM.carimbo.nome, pnl.x + 12, yy, 2.2, r);
  });
  text(CAM.carimbo.nome, pnl.x + 3, by + 41, 1.8, "DIS-NOR-012 Anexo VIII");
  // Materiais.
  text(CAM.carimbo.nome, pnl.x + 3, by + 49, 2.8, "Materiais");
  const linhas = linhasMateriais(p.materiais);
  linhas.forEach((l, i) => {
    const yy = by + 54 + i * 3.4;
    text(CAM.carimbo.nome, pnl.x + 3, yy, 2.2, l.rot);
    text(CAM.carimbo.nome, pnl.x + pnl.w - 3, yy, 2.2, l.val, 2);
  });

  // --- Carimbo / aprovação (só o espaço reservado) ---
  const c = L.carimbo;
  const divX = c.x + c.w * 0.62;
  line(CAM.carimbo.nome, divX, c.y, divX, c.y + c.h);
  text(CAM.carimbo.nome, c.x + 3, c.y + 6, 3.2, "MARKFIELD - Projeto de rede de distribuicao");
  text(CAM.carimbo.nome, c.x + 3, c.y + 11, 2, "Espaco reservado para carimbo (DIS-NOR-012 Anexo I)");
  const data = new Date(p.projeto.meta.atualizadoEm || p.projeto.meta.criadoEm || Date.now()).toLocaleDateString("pt-BR");
  text(CAM.carimbo.nome, c.x + 3, c.y + c.h - 3, 2.2, `${p.projeto.meta.nome || "-"}   Escala 1:${p.escala}   Folha 1/1   ${data}`);
  text(CAM.carimbo.nome, divX + 4, c.y + 6, 2.8, "APROVACAO");
  text(CAM.carimbo.nome, divX + 4, c.y + 11, 2, "Concessionaria");

  const camadas = Object.values(CAM);
  return montarDxf(ent, camadas);
}

function linhasMateriais(m: ResumoMateriais | null): { rot: string; val: string }[] {
  if (!m) return [{ rot: "Materiais", val: "-" }];
  const linhas: { rot: string; val: string }[] = [];
  for (const p of m.postesPorTipo) linhas.push({ rot: `Poste ${p.rotulo}`, val: String(p.n) });
  for (const e of m.estruturas) linhas.push({ rot: e.codigo, val: String(e.n) });
  for (const cb of m.cabos)
    linhas.push({ rot: `Cabo ${cb.codigo}${cb.provisorio ? "*" : ""}`, val: `${Math.round(cb.comprimentoM)} m` });
  linhas.push({ rot: `Espacadores${m.espacadoresEstimado ? "*" : ""}`, val: String(m.espacadores) });
  if (m.estais) linhas.push({ rot: "Estais", val: String(m.estais) });
  if (m.pararaios) linhas.push({ rot: "Para-raios", val: String(m.pararaios) });
  if (m.estribos) linhas.push({ rot: "Estribos (300 m)", val: String(m.estribos) });
  return linhas;
}

function montarDxf(entidades: string, camadas: { nome: string; cor: number }[]): string {
  const vistas = new Map<string, { nome: string; cor: number }>();
  vistas.set("0", { nome: "0", cor: 7 });
  for (const c of camadas) if (!vistas.has(c.nome)) vistas.set(c.nome, c);
  let tab = rec(0, "TABLE") + rec(2, "LAYER") + rec(70, vistas.size);
  for (const c of vistas.values()) {
    tab += rec(0, "LAYER") + rec(2, c.nome) + rec(70, 0) + rec(62, c.cor) + rec(6, "CONTINUOUS");
  }
  tab += rec(0, "ENDTAB");
  return (
    rec(0, "SECTION") + rec(2, "HEADER") +
    rec(9, "$ACADVER") + rec(1, "AC1009") +
    rec(9, "$INSUNITS") + rec(70, 4) + // 4 = milímetros
    rec(0, "ENDSEC") +
    rec(0, "SECTION") + rec(2, "TABLES") + tab + rec(0, "ENDSEC") +
    rec(0, "SECTION") + rec(2, "ENTITIES") + entidades + rec(0, "ENDSEC") +
    rec(0, "EOF")
  );
}
