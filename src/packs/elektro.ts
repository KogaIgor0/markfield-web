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
 *  - DIS-NOR-012 rev.08  (critérios gerais rede de distribuição aérea — §6.5, §6.12–§6.13, Tab.14, Tab.20, Anexo X)
 *  - DIS-NOR-013 rev.08  (rede compacta MT — estruturas, cabos, amarração, estai)
 *  - DIS-NOR-018 rev.01  (estruturas rede nua até 36,2 kV — trações rurais a confirmar)
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
    /** Lance máximo sem amarração (m) — provisório, confirmar na DIS-NOR-018. */
    lanceMaxAmarracaoM: number;
    /** Espaçamento máximo do estribo de espera (m) — provisório (DIS-NOR-018). */
    lanceEstribosM: number;
    /**
     * Vão básico (m) usado no cálculo de tração reduzida.
     * Confirmado em DIS-NOR-012 Anexo X (exemplo usa VB = 40 m).
     */
    vanBasicoM: number;
    /**
     * Instalar para-raios a cada N km na rede rural.
     * DIS-NOR-012 §6.12.18i: a cada 3 km.
     */
    paraRaiosCadaKm: number;
    /**
     * Instalar chave seccionadora no início do alimentador rural
     * e a cada N km máximo no tronco.
     * DIS-NOR-012 §6.12.19: a cada 6 km.
     */
    seccionadorasCadaKm: number;
    /**
     * Vão máximo para RDC (rede compacta) em área rural.
     * Vãos > 100 m → rede nua permitida. DIS-NOR-012 §6.5.2 e §6.5.4c.
     */
    vaoMaxRdcRuralM: number;
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
  // Fonte: DIS-NOR-012 Rev.08 (critérios gerais) + DIS-NOR-018 Rev.01 (estruturas).
  normasNua: {
    lanceMaxAmarracaoM: 400,          // provisório — confirmar DIS-NOR-018
    lanceEstribosM: 300,              // provisório — confirmar DIS-NOR-018
    vanBasicoM: 40,                   // DIS-NOR-012 Anexo X (VB = 40 m)
    paraRaiosCadaKm: 3,               // DIS-NOR-012 §6.12.18i — rede rural
    seccionadorasCadaKm: 6,           // DIS-NOR-012 §6.12.19 — tronco rural
    vaoMaxRdcRuralM: 100,             // DIS-NOR-012 §6.5.2 + §6.5.4c
    codigosAmarracao: ["N3", "N4", "N3-N3", "N3-TT"],
    capacidadePadraoDaN: 400,         // provisório — confirmar DIS-NOR-018
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

  // ── Catálogo de cabos nus CAA — rede rural (DIS-NOR-012 + DIS-NOR-018) ────
  //
  // Dados físicos: DIS-NOR-012 Rev.08 Tabela 20 (designação AWG/MCM — padrão Elektro).
  //   ⚠️ Os cabos nus da Neoenergia Elektro usam designação AWG (#4, #1/0, #4/0, 336.4MCM),
  //   NÃO a designação métrica IEC (16, 25, 35, 95 mm²) — são cabos maiores!
  //
  // Trações:
  //   • Coluna "urbana": DIS-NOR-012 Tabela 14, vão básico VB = 40 m (§6.13 + Anexo X).
  //     Confirmadas: Anexo X usa explicitamente 347 daN/fase para 4/0 CAA no exemplo TR.
  //   • Colunas "rural_alto" e "rural_medio_baixo": estimadas pela mesma proporção
  //     da rede compacta (A35P urbana/rural ≈ 1,36/1,63×). ⚠️ CONFIRMAR na DIS-NOR-018.
  //
  // tração reduzida TR = (VR / VB)² × TB  (DIS-NOR-012 §6.13.10.2).
  //
  // Cabos de cobre excluídos: DIS-NOR-012 Tabela 23 nota — uso restrito a aterramento,
  // expressamente proibidos em redes primárias.
  cabosNus: [
    {
      // #4 CAA (AWG) — DIS-NOR-012 Tab.20: Ø 6,36 mm, ruptura 839 daN, 130 A
      // Tração Tab.14: 75 daN/fase a VB=40 m (rede urbana nua existente — base de cálculo)
      codigo: "SWAN",
      rotulo: "SWAN — #4 CAA (24,7 mm² total) — 15 kV",
      secaoMm2: 24.71,
      tensaoKv: 15,
      diametroMm: 6.36,
      rupturaDaN: 839,
      tracaoDaN: { urbana: 75, rural_alto: 102, rural_medio_baixo: 122 },
      tracaoReduzidaDaN: 37,          // ≈ 25 % de 122 (VR≈20m, VB=40m, TB=122)
      tracaoConfirmada: false,        // rural: aguarda Tab. DIS-NOR-018; urbana: ✓ Tab.14
    },
    {
      // #1/0 CAA (AWG) — DIS-NOR-012 Tab.20: Ø 10,11 mm, ruptura 1.935 daN, 230 A
      // Tração Tab.14: 173 daN/fase a VB=40 m
      codigo: "RAVEN",
      rotulo: "RAVEN — #1/0 CAA (62,4 mm² total) — 15 kV",
      secaoMm2: 62.44,
      tensaoKv: 15,
      diametroMm: 10.11,
      rupturaDaN: 1935,
      tracaoDaN: { urbana: 173, rural_alto: 235, rural_medio_baixo: 282 },
      tracaoReduzidaDaN: 85,          // ≈ 25 % de 282
      tracaoConfirmada: false,        // rural: aguarda DIS-NOR-018; urbana: ✓ Tab.14
    },
    {
      // #4/0 CAA (AWG) — DIS-NOR-012 Tab.20: Ø 14,31 mm, ruptura 2.941 daN, 350 A
      // Tração Tab.14: 347 daN/fase a VB=40 m — CONFIRMADO em Anexo X (3×347=1.041 daN)
      codigo: "PENGUIN",
      rotulo: "PENGUIN — #4/0 CAA (125,1 mm² total) — 15 kV",
      secaoMm2: 125.1,
      tensaoKv: 15,
      diametroMm: 14.31,
      rupturaDaN: 2941,
      tracaoDaN: { urbana: 347, rural_alto: 472, rural_medio_baixo: 566 },
      tracaoReduzidaDaN: 142,         // ≈ 25 % de 566 — Anexo X: TR=(20/40)²×1.211≈303 daN (3 fases)→101/fase
      tracaoConfirmada: false,        // rural: aguarda DIS-NOR-018; urbana: ✓ Tab.14 + Anexo X
    },
    {
      // 336.4 MCM CAA — DIS-NOR-012 Tab.20: Ø 18,31 mm, ruptura 6.273 daN, 510 A
      // Tração Tab.14: 551 daN/fase a VB=40 m
      codigo: "LINNET",
      rotulo: "LINNET — 336,4 MCM CAA (198,4 mm² total) — 15 kV",
      secaoMm2: 198.4,
      tensaoKv: 15,
      diametroMm: 18.31,
      rupturaDaN: 6273,
      tracaoDaN: { urbana: 551, rural_alto: 749, rural_medio_baixo: 898 },
      tracaoReduzidaDaN: 225,         // ≈ 25 % de 898
      tracaoConfirmada: false,        // rural: aguarda DIS-NOR-018; urbana: ✓ Tab.14
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
