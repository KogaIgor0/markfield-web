import type { TipoPonto } from "../domain/model";

/**
 * Domain Pack — Neoenergia Elektro (SP). Fonte única de TODOS os valores
 * normativos e de catálogo específicos desta distribuidora.
 *
 * Princípio Motor × Pacote: o motor (domain/) contém a lógica; o pacote
 * contém os dados (camadas DXF, constantes da norma, catálogos). Trocar de
 * distribuidora = trocar de pacote; o motor não muda.
 *
 * Normas de origem:
 *  - DIS-NOR-013 rev.08  (rede compacta MT — estruturas, cabos, amarração, estai)
 *  - DIS-ETE-011 rev.06  (catálogo de postes de concreto armado)
 *  - ND-25               (cálculo mecânico: R = √(F₁²+F₂²+2·F₁·F₂·cos β))
 */

// ─── DXF ─────────────────────────────────────────────────────────────────────

export interface CamadaDxf {
  nome: string;
  /** Cor ACI (índice de cor do AutoCAD). */
  cor: number;
}

// ─── Cabos ───────────────────────────────────────────────────────────────────

/** Condição de vento/zona — escolhe a coluna da tabela de tração. */
export type CondicaoVento = "urbana" | "rural_alto" | "rural_medio_baixo";

export interface CaboEntry {
  /** Código no sistema (ex.: "A35P"). */
  codigo: string;
  /** Rótulo legível (ex.: "A35P — 35 mm² coberto 15 kV"). */
  rotulo: string;
  secaoMm2: number;
  tensaoKv: number;
  /** Diâmetro nominal (mm) — DIS-NOR-013 Anexo I Tab.2. */
  diametroMm: number;
  /** Carga de ruptura do condutor (daN). */
  rupturaDaN: number;
  /** Tração de projeto H (daN) por condição, vão de referência 50 m (Tab.7–9). */
  tracaoDaN: Record<CondicaoVento, number>;
  /**
   * Tração REDUZIDA (daN) para vão "frouxo" de transferência de esforço (E-05):
   * ~30% da tração de projeto rural média — provisório, a confirmar.
   */
  tracaoReduzidaDaN: number;
  /** As trações foram confirmadas contra a norma? (só A35P por ora). */
  tracaoConfirmada: boolean;
}

// ─── Postes ──────────────────────────────────────────────────────────────────

export type SecaoPoste = "circular" | "duploT";

// ─── Estruturas ──────────────────────────────────────────────────────────────

export type FuncaoEstrutura =
  | "tangente"
  | "angulo"
  | "encabecamento"
  | "fim"
  | "afastador";

export interface EstruturaDef {
  codigo: string;
  rotulo: string;
  funcao: FuncaoEstrutura;
  anguloMin?: number;
  anguloMax?: number;
  auto: boolean;
}

export interface SufixoDef {
  sufixo: string;
  rotulo: string;
  colado?: boolean;
}

// ─── PackConcessionaria ──────────────────────────────────────────────────────

export interface PackConcessionaria {
  id: string;
  nome: string;
  /** Unidade do DXF gerado. "m" = coordenadas UTM em metros (georreferenciado). */
  unidade: "m";

  // ── DXF ────────────────────────────────────────────────────────────────────
  camadas: {
    poste: CamadaDxf;
    posteGenerico: CamadaDxf;
    transformador: CamadaDxf;
    redePrimaria: CamadaDxf;
    linhaAuxiliar: CamadaDxf;
    numero: CamadaDxf;
  };
  /** Raio (m) dos símbolos no georreferenciado (visíveis ~1:1000). */
  raioPosteM: number;
  raioTrafoM: number;
  alturaTextoM: number;

  // ── Constantes normativas ───────────────────────────────────────────────────
  normas: {
    /** Lance máximo sem amarração (m) — DIS-NOR-013 §6.17.3. */
    lanceMaxAmarracaoM: number;
    /** Espaçamento máximo do estribo de espera (m) — DIS-NOR-013 §6.15.2. */
    lanceEstribosM: number;
    /**
     * Códigos de estrutura que constituem ponto de amarração (encabeçamento /
     * ancoragem). Usado pelo motor de amarração para identificar fins de lance.
     */
    codigosAmarracao: readonly string[];
    /** Capacidade nominal padrão do poste (daN) — Quadro 8, colunar circular. */
    capacidadePadraoDaN: number;
    /** Comprimento do símbolo de estai no mapa (m). */
    estaiComprimentoM: number;
    /** Cabo padrão do piloto (rural MT). */
    caboPadrao: string;
    /** Condição de vento padrão do piloto (pior caso — mais exposto). */
    condicaoPadrao: CondicaoVento;
    /** Seção padrão do poste (rural MT). */
    postePadraoSecao: SecaoPoste;
    /** Altura padrão do poste (m) — mín. rural DIS-NOR-012 6.8.2. */
    postePadraoAlturaM: number;
  };

  // ── Catálogo de cabos ───────────────────────────────────────────────────────
  cabos: CaboEntry[];

  // ── Catálogo de postes ──────────────────────────────────────────────────────
  /**
   * Tabelas de alturas × cargas por seção (DIS-ETE-011 rev.06, Anexo I).
   * `circular[alturaM] = [carga1, carga2, …]`
   */
  postes: {
    circular: Record<number, number[]>;
    duploT: Record<number, number[]>;
  };

  // ── Catálogo de estruturas ──────────────────────────────────────────────────
  estruturas: {
    /** Estruturas BASE (DIS-NOR-013). */
    catalogo: EstruturaDef[];
    /** Sufixos de equipamento (DIS-NOR-013 §6.16/6.21, Tabela 1). */
    sufixos: SufixoDef[];
  };
}

// ─── PACK_ELEKTRO ────────────────────────────────────────────────────────────

export const PACK_ELEKTRO: PackConcessionaria = {
  id: "neoenergia-elektro-sp",
  nome: "Neoenergia Elektro (SP)",
  unidade: "m",

  // ── DXF ──────────────────────────────────────────────────────────────────
  camadas: {
    poste: { nome: "111-PONTO_SIGNIFICATIVO", cor: 50 },
    posteGenerico: { nome: "112-PONTO_SIGNIFICATIVO", cor: 50 },
    transformador: { nome: "115-UNIDADE_TRANSFORMADORA", cor: 80 },
    redePrimaria: { nome: "113-ALIMENTADOR_PRIMARIO", cor: 86 },
    linhaAuxiliar: { nome: "MKF-AUXILIAR", cor: 8 },
    numero: { nome: "3-PONTOS_SIGNIFICATIVO", cor: 10 },
  },
  raioPosteM: 1.5,
  raioTrafoM: 3,
  alturaTextoM: 2.5,

  // ── Constantes normativas ───────────────────────────────────────────────
  normas: {
    lanceMaxAmarracaoM: 500,          // DIS-NOR-013 §6.17.3
    lanceEstribosM: 300,              // DIS-NOR-013 §6.15.2
    codigosAmarracao: ["CE3", "CE4", "CE3-CE3", "CE3TR"],
    capacidadePadraoDaN: 400,         // Quadro 8, colunar circular, A35P
    estaiComprimentoM: 10,            // footprint aproximado no mapa
    caboPadrao: "A35P",
    condicaoPadrao: "rural_medio_baixo",
    postePadraoSecao: "circular",
    postePadraoAlturaM: 11,           // mín. rural DIS-NOR-012 6.8.2
  },

  // ── Catálogo de cabos (DIS-NOR-013) ────────────────────────────────────
  // ⚠️ Só o A35P está confirmado (438/595/714 daN — validado contra a norma).
  // Os demais: físico (diâmetro/ruptura) da norma, tração provisória.
  cabos: [
    {
      codigo: "A35P",
      rotulo: "A35P — 35 mm² coberto 15 kV",
      secaoMm2: 35,
      tensaoKv: 15,
      diametroMm: 14.05,
      rupturaDaN: 455,
      tracaoDaN: { urbana: 438, rural_alto: 595, rural_medio_baixo: 714 },
      tracaoReduzidaDaN: 215, // ~30% de 714 (vão frouxo) — provisório
      tracaoConfirmada: true,
    },
    {
      codigo: "A70P",
      rotulo: "A70P — 70 mm² coberto 15 kV (provisório)",
      secaoMm2: 70,
      tensaoKv: 15,
      diametroMm: 16.75,
      rupturaDaN: 910,
      tracaoDaN: { urbana: 511, rural_alto: 668, rural_medio_baixo: 793 },
      tracaoReduzidaDaN: 240,
      tracaoConfirmada: false,
    },
    {
      codigo: "A185P",
      rotulo: "A185P — 185 mm² coberto 15 kV (provisório)",
      secaoMm2: 185,
      tensaoKv: 15,
      diametroMm: 23.05,
      rupturaDaN: 2405,
      tracaoDaN: { urbana: 714, rural_alto: 871, rural_medio_baixo: 990 },
      tracaoReduzidaDaN: 300,
      tracaoConfirmada: false,
    },
  ],

  // ── Catálogo de postes (DIS-ETE-011 rev.06, Anexo I) ───────────────────
  postes: {
    circular: {
      9:  [400, 600, 1000, 1500],
      11: [400, 600, 1000, 1500],
      12: [400, 600, 1000, 1500, 2000],
      14: [1000, 1500, 2000],
      16: [1000, 1500],
    },
    duploT: {
      9:  [200, 300],
      11: [200, 300],
      12: [200, 300],
      14: [300],
      16: [300],
    },
  },

  // ── Catálogo de estruturas (DIS-NOR-013) ───────────────────────────────
  estruturas: {
    catalogo: [
      { codigo: "CE1",     rotulo: "CE1 — tangente (0–6°)",                    funcao: "tangente",     anguloMin: 0,  anguloMax: 6,  auto: true  },
      { codigo: "CE1A",    rotulo: "CE1A — tangente antibalanço",               funcao: "tangente",     anguloMin: 0,  anguloMax: 6,  auto: false },
      { codigo: "CE2",     rotulo: "CE2 — ângulo (6–60°)",                      funcao: "angulo",       anguloMin: 6,  anguloMax: 60, auto: true  },
      { codigo: "CE4",     rotulo: "CE4 — ancoragem / ângulo (60–90°)",         funcao: "angulo",       anguloMin: 60, anguloMax: 90, auto: true  },
      { codigo: "CE3-CE3", rotulo: "CE3-CE3 — duplo encabeçamento (> 90°)",    funcao: "encabecamento",anguloMin: 90,                auto: true  },
      { codigo: "CE3",     rotulo: "CE3 — encabeçamento / fim / derivação",    funcao: "fim",                                        auto: true  },
      { codigo: "CEJ1",    rotulo: "CEJ1 — tangente com afastador",            funcao: "afastador",    anguloMin: 0,  anguloMax: 6,  auto: false },
      { codigo: "CEJ1-SAH",rotulo: "CEJ1 SAH — afastador 2500 mm",            funcao: "afastador",    anguloMin: 0,  anguloMax: 6,  auto: false },
      { codigo: "CEJ2",    rotulo: "CEJ2 — ângulo com afastador",              funcao: "afastador",    anguloMin: 6,  anguloMax: 60, auto: false },
      { codigo: "CEJ2-SAH",rotulo: "CEJ2 SAH — afastador 2500 mm",            funcao: "afastador",    anguloMin: 6,  anguloMax: 60, auto: false },
    ],
    sufixos: [
      { sufixo: "TR",   rotulo: "Transformador",                 colado: true },
      { sufixo: "TRSC", rotulo: "Transformador sem chave fusível",colado: true },
      { sufixo: "CF",   rotulo: "Chave fusível"                              },
      { sufixo: "PR",   rotulo: "Para-raios"                                 },
      { sufixo: "SU",   rotulo: "Seccionador unipolar"                       },
      { sufixo: "SUH",  rotulo: "Seccionador unipolar horizontal"            },
      { sufixo: "SUI",  rotulo: "Seccionador unipolar inclinado"             },
      { sufixo: "DS",   rotulo: "Derivação subterrânea (descida)"            },
      { sufixo: "SAH",  rotulo: "Suporte afastador horizontal"               },
      { sufixo: "PU",   rotulo: "Poste existente (elevação)"                 },
    ],
  },
};

// ─── Helpers DXF ─────────────────────────────────────────────────────────────

/** Camada DXF de um ponto conforme seu tipo. */
export function camadaDoPonto(pack: PackConcessionaria, tipo: TipoPonto): CamadaDxf {
  if (tipo === "transformador") return pack.camadas.transformador;
  if (tipo === "generico") return pack.camadas.posteGenerico;
  return pack.camadas.poste; // postePropostoo e outros
}
