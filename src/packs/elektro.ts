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
  /** Diâmetro nominal do cabo (mm) — DIS-NOR-013 Anexo I Tab.2. */
  diametroMm: number;
  /**
   * Diâmetro da cordoalha metálica (mm) — usado no rótulo da prancha:
   * "3xA35P(7,94) - 15 kV". Específico por distribuidora/norma.
   */
  cordoalhaDiametroMm?: number;
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

  // ── Constantes normativas — rede compacta (DIS-NOR-013) ────────────────────
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

  // ── Constantes normativas — rede nua/rural (DIS-NOR-018 / DIS-NOR-012) ─────
  normasNua?: {
    /** Lance máximo sem amarração (m) — provisório, confirmar na DIS-NOR-012. */
    lanceMaxAmarracaoM: number;
    /** Espaçamento máximo do estribo de espera (m) — provisório (DIS-NOR-012). */
    lanceEstribosM: number;
    /**
     * Códigos de estrutura rede nua que constituem ponto de amarração.
     * N3 = fim de rede, N4 = ângulo/ancoragem, N3-N3 = duplo encabeçamento.
     */
    codigosAmarracao: readonly string[];
    /** Capacidade padrão do poste (daN) — rede nua (DIS-NOR-012 Quadro). */
    capacidadePadraoDaN: number;
    /** Cabo padrão da rede nua. */
    caboPadrao: string;
    /** Condição de vento padrão da rede nua (pior caso rural). */
    condicaoPadrao: CondicaoVento;
  };

  // ── Catálogo de cabos — rede compacta ──────────────────────────────────────
  cabos: CaboEntry[];

  // ── Catálogo de cabos — rede nua / rural (DIS-NOR-018) ────────────────────
  /**
   * Condutores nus ACSR e cobre para projetos de rede rural (DIS-NOR-018).
   * Ausente nos packs que não operam rede nua.
   * ⚠️ Trações PROVISÓRIAS — confirmar na DIS-NOR-012 §6.4+ (ainda não recebida).
   */
  cabosNus?: CaboEntry[];

  // ── Catálogo de postes ──────────────────────────────────────────────────────
  /**
   * Tabelas de alturas × cargas por seção (DIS-ETE-011 rev.06, Anexo I).
   * `circular[alturaM] = [carga1, carga2, …]`
   */
  postes: {
    circular: Record<number, number[]>;
    duploT: Record<number, number[]>;
  };

  // ── Catálogo de estruturas — rede compacta (DIS-NOR-013) ───────────────────
  estruturas: {
    /** Estruturas BASE (DIS-NOR-013). */
    catalogo: EstruturaDef[];
    /** Sufixos de equipamento (DIS-NOR-013 §6.16/6.21, Tabela 1). */
    sufixos: SufixoDef[];
  };

  // ── Catálogo de estruturas — rede nua/rural (DIS-NOR-018 Anexo I) ──────────
  /**
   * Estruturas padronizadas para rede com condutores nus até 36,2 kV.
   * Aplica-se a todos os distribuidores (Anexo I, Est. 1-24).
   * Para Neoenergia Elektro: N1/N3/N4/N3-N3/N4-N3 usam **meio beco**
   * (§6.10.3 e nota do Anexo I).
   */
  estruturasNua?: {
    catalogo: EstruturaDef[];
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

  // ── Constantes normativas — rede nua/rural ─────────────────────────────
  // ⚠️ Valores provisórios — DIS-NOR-012 ainda não recebida.
  normasNua: {
    lanceMaxAmarracaoM: 400,          // provisório — confirmar DIS-NOR-012
    lanceEstribosM: 300,              // provisório — confirmar DIS-NOR-012
    codigosAmarracao: ["N3", "N4", "N3-N3", "N3-TT"],
    capacidadePadraoDaN: 400,         // provisório — confirmar DIS-NOR-012
    caboPadrao: "PENGUIN",
    condicaoPadrao: "rural_medio_baixo",
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
      cordoalhaDiametroMm: 7.94,  // Neoenergia Elektro — DIS-NOR-013
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

  // ── Catálogo de cabos nus ACSR — rede rural (DIS-NOR-018) ──────────────
  // Dados físicos: ABNT NBR 7270:2009 (ACSR).
  // ⚠️ TRAÇÕES PROVISÓRIAS — confirmar na DIS-NOR-012 §6.4+ (ainda não recebida).
  // Padrão Elektro para rede nua: PENGUIN (tronco/ramal) e LINNET (tronco principal).
  cabosNus: [
    {
      codigo: "SWAN",
      rotulo: "SWAN — ACSR 16+2,7 mm² nu (provisório)",
      secaoMm2: 16,
      tensaoKv: 15,
      diametroMm: 6.21,
      rupturaDaN: 480,
      tracaoDaN: { urbana: 120, rural_alto: 160, rural_medio_baixo: 190 },
      tracaoReduzidaDaN: 50,
      tracaoConfirmada: false,
    },
    {
      codigo: "RAVEN",
      rotulo: "RAVEN — ACSR 25+4,3 mm² nu (provisório)",
      secaoMm2: 25,
      tensaoKv: 15,
      diametroMm: 7.77,
      rupturaDaN: 720,
      tracaoDaN: { urbana: 180, rural_alto: 240, rural_medio_baixo: 290 },
      tracaoReduzidaDaN: 72,
      tracaoConfirmada: false,
    },
    {
      codigo: "PENGUIN",
      rotulo: "PENGUIN — ACSR 35+6 mm² nu (provisório)",
      secaoMm2: 35,
      tensaoKv: 15,
      diametroMm: 9.05,
      rupturaDaN: 1030,
      tracaoDaN: { urbana: 260, rural_alto: 345, rural_medio_baixo: 415 },
      tracaoReduzidaDaN: 105,
      tracaoConfirmada: false,
    },
    {
      codigo: "LINNET",
      rotulo: "LINNET — ACSR 95+16,3 mm² nu (provisório)",
      secaoMm2: 95,
      tensaoKv: 15,
      diametroMm: 15.04,
      rupturaDaN: 2800,
      tracaoDaN: { urbana: 700, rural_alto: 930, rural_medio_baixo: 1120 },
      tracaoReduzidaDaN: 280,
      tracaoConfirmada: false,
    },
    {
      // Cobre nu 35 mm² — também usado em ramais rurais
      codigo: "CU35",
      rotulo: "Cu nu 35 mm²",
      secaoMm2: 35,
      tensaoKv: 15,
      diametroMm: 6.75,
      rupturaDaN: 975,
      tracaoDaN: { urbana: 245, rural_alto: 325, rural_medio_baixo: 390 },
      tracaoReduzidaDaN: 98,
      tracaoConfirmada: false,
    },
    {
      codigo: "CU70",
      rotulo: "Cu nu 70 mm²",
      secaoMm2: 70,
      tensaoKv: 15,
      diametroMm: 9.5,
      rupturaDaN: 1950,
      tracaoDaN: { urbana: 490, rural_alto: 650, rural_medio_baixo: 780 },
      tracaoReduzidaDaN: 196,
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
      { codigo: "CE3",     rotulo: "CE3 — encabeçamento / fim de rede",         funcao: "fim",                                        auto: true  },
      { codigo: "CE3TR",   rotulo: "CE3TR — fim de rede com transformador",     funcao: "fim",                                        auto: true  },
      { codigo: "CE2TR",   rotulo: "CE2TR — transformador sob a rede (≤ 60°)", funcao: "angulo",       anguloMin: 0,  anguloMax: 60, auto: true  },
      { codigo: "CE4TR",   rotulo: "CE4TR — transformador em ângulo (60–90°)", funcao: "angulo",       anguloMin: 60, anguloMax: 90, auto: true  },
      { codigo: "CE2.3",   rotulo: "CE2.3 — derivação mesmo nível/lado",       funcao: "fim",                                        auto: false },
      { codigo: "CE2.CE3", rotulo: "CE2.CE3 — derivação mesmo nível/lados op.",funcao: "fim",                                        auto: false },
      { codigo: "CE2-CE3", rotulo: "CE2-CE3 — derivação níveis diferentes",    funcao: "fim",                                        auto: false },
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

  // ── Catálogo de estruturas — rede nua/rural (DIS-NOR-018 Anexo I) ──────
  // Estruturas padronizadas 1-24 (Anexo I) = todos os distribuidores.
  // Para Neoenergia Elektro: N1/N3/N4/N3-N3/N4-N3 usam MEIO BECO
  // (§6.10.3 e nota específica do Anexo I da DIS-NOR-018 Rev.01).
  //
  // Mapeamento compacta → nua:
  //   CE1      → N1        (tangente 0–6°)
  //   CE2/CE4  → N4        (ângulo 6–60°)
  //   CE3-CE3  → N3-N3     (duplo encabeçamento > 60°)
  //   CE3      → N3        (fim de rede)
  //   CE2TR/CE4TR → N1-TT  (trafo passante)
  //   CE3TR    → N3-TT     (trafo fim de rede)
  //   CE2.3    → N4-N3     (derivação sem CF)
  estruturasNua: {
    catalogo: [
      // Estruturas automáticas (classificação por ângulo de deflexão)
      { codigo: "N1",     rotulo: "N1 — tangente (0–6°) [meio beco]",              funcao: "tangente",      anguloMin: 0,  anguloMax: 6,  auto: true  },
      { codigo: "N4",     rotulo: "N4 — amarração / ângulo (6–60°) [meio beco]",   funcao: "angulo",        anguloMin: 6,  anguloMax: 60, auto: true  },
      { codigo: "N3-N3",  rotulo: "N3-N3 — duplo encabeçamento (> 60°) [meio beco]",funcao:"encabecamento", anguloMin: 60,               auto: true  },
      { codigo: "N3",     rotulo: "N3 — encabeçamento / fim de rede [meio beco]",  funcao: "fim",                                         auto: true  },
      // Transformadores (automáticos por grau do nó)
      { codigo: "N1-TT",  rotulo: "N1-TT — trafo passante (sob a rede)",           funcao: "tangente",      anguloMin: 0,  anguloMax: 6,  auto: true  },
      { codigo: "N3-TT",  rotulo: "N3-TT — trafo fim de rede",                    funcao: "fim",                                         auto: true  },
      // Estruturas manuais
      { codigo: "N4-N3",  rotulo: "N4-N3 — derivação sem chave fusível [meio beco]",funcao:"fim",                                        auto: false },
      { codigo: "N4-CFU", rotulo: "N4-CFU — chave fusível em alinhamento",         funcao: "angulo",        anguloMin: 0,  anguloMax: 60, auto: false },
      { codigo: "N3-TT-SOB", rotulo: "N3-TT-SOB — trafo fim de rede com CF sob rede",funcao:"fim",                                      auto: false },
      // Estruturas de baixa tensão (rede secundária) — DIS-NOR-018 §7
      { codigo: "B1",     rotulo: "B1 — tangente BT (0–6°) [meio beco]",           funcao: "tangente",      anguloMin: 0,  anguloMax: 6,  auto: false },
      { codigo: "B3",     rotulo: "B3 — encabeçamento BT [meio beco]",             funcao: "fim",                                         auto: false },
      { codigo: "B4",     rotulo: "B4 — ângulo BT (6–60°) [meio beco]",            funcao: "angulo",        anguloMin: 6,  anguloMax: 60, auto: false },
    ],
    sufixos: [
      // Sufixos comuns rede nua (DIS-NOR-018)
      { sufixo: "TT",   rotulo: "Transformador (rede nua)",      colado: true },
      { sufixo: "SOB",  rotulo: "Sob a rede (CF abaixo dos condutores)" },
      { sufixo: "CFU",  rotulo: "Chave fusível"                          },
      { sufixo: "PR",   rotulo: "Para-raios"                             },
      { sufixo: "SU",   rotulo: "Seccionador unipolar"                   },
      { sufixo: "DS",   rotulo: "Derivação subterrânea (descida)"        },
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
