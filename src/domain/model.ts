/**
 * Modelo de domínio do Markfield Web.
 *
 * Esta é a espinha do produto: a representação interna de um projeto de rede,
 * independente de qualquer formato de arquivo (KML, DXF, .mkf). Todos os
 * parsers (io/) convertem PARA este modelo; todos os renderizadores convertem
 * A PARTIR dele.
 *
 * Regra de ouro (DRS §5): TODO elemento tem um `id` estável. É o que o formato
 * .mkf preserva e o que hoje o app NÃO exporta — sem isso não há merge, diff,
 * versão nem vínculo confiável foto→ponto.
 */

// --------------------------------------------------------------------------
// Coordenadas
// --------------------------------------------------------------------------

/** Coordenada geográfica WGS84 (o que vem do GPS e do KML). */
export interface LatLng {
  /** Latitude em graus decimais. */
  lat: number;
  /** Longitude em graus decimais. */
  lng: number;
}

/**
 * Coordenada projetada UTM SIRGAS 2000 (o sistema dos entregáveis).
 * A zona é calculada pela longitude; guardamos junto para não haver ambiguidade.
 */
export interface UtmPoint {
  /** Este (X), em metros. */
  easting: number;
  /** Norte (Y), em metros. */
  northing: number;
  /** Zona UTM (ex.: 24). */
  zone: number;
  /** Hemisfério — no Brasil, quase sempre "S". */
  hemisphere: "N" | "S";
}

// --------------------------------------------------------------------------
// Tipos de elementos coletados
// --------------------------------------------------------------------------

/**
 * Símbolo/tipo de um ponto. Espelha os `styleUrl` do KML do app.
 *
 * D-03 (fechada Set/2026): hoje o app oferece exatamente três símbolos —
 * Poste proposto, Genérico e Transformador. `outro` é a rede de segurança para
 * símbolos novos que o app venha a exportar antes de o modelo conhecê-los.
 *
 * ATENÇÃO ao valor `postePropostoo` — a grafia com DOIS "o" é intencional e
 * mantida por compatibilidade com o `styleUrl` que o app já gera. Não "corrigir".
 */
export type TipoPonto =
  | "postePropostoo" // sic — dois "o", compatibilidade com o app ("Poste proposto")
  | "generico" // "Genérico"
  | "transformador" // "Transformador"
  | "outro";

/**
 * Mapeia o símbolo como o app o exporta (rótulo em ExtendedData `simbolo`, ou
 * o id do `styleUrl`) para o `TipoPonto` interno. Tolerante a acento/caixa.
 */
export function tipoPontoDeApp(valor: string | undefined | null): TipoPonto {
  const v = (valor ?? "").trim().toLowerCase();
  if (v.includes("propost")) return "postePropostoo"; // "Poste proposto" / "postePropostoo"
  if (v.includes("transformador")) return "transformador";
  if (v.includes("gen") || v.includes("generico")) return "generico"; // "Genérico"
  return "outro";
}

/** Rótulo legível de um `TipoPonto`, para legenda e popups. */
export function rotuloTipo(t: TipoPonto): string {
  switch (t) {
    case "postePropostoo":
      return "Poste proposto";
    case "generico":
      return "Genérico";
    case "transformador":
      return "Transformador";
    default:
      return "Outro";
  }
}

/** Origem de um elemento: coletado em campo, importado, ou criado no Web. */
export type Origem = "campo" | "rede_existente" | "web";

/** Um ponto do projeto (poste, transformador, equipamento…). */
export interface Ponto {
  id: string;
  tipo: TipoPonto;
  /** Numeração exibida ao usuário (ex.: "1"). Pode diferir do id interno. */
  numero?: string;
  wgs84: LatLng;
  /** UTM derivado; opcional porque é calculável a partir do WGS84. */
  utm?: UtmPoint;
  observacao?: string;
  origem: Origem;
  /**
   * Como a coordenada foi obtida, conforme o app ("GPS", "Manual", "Mapa"…).
   * Distinto de `origem` (que é a proveniência: campo/web).
   */
  fonteCoordenada?: string;
  /** Precisão do GPS em metros, quando veio do campo. */
  precisaoM?: number;
  /** Data/hora de criação no app (ISO 8601 ou "YYYY-MM-DD HH:MM"), se houver. */
  criadoEm?: string;
  /**
   * Marca este poste como a **fonte** da rede (saída da rede existente). É o
   * ponto de partida da modelagem (B1) — a rota é traçada a partir dele.
   */
  ehFonte?: boolean;
  /**
   * Poste inserido **automaticamente** pela divisão de vãos (B2). É um poste
   * comum (pode mover/editar/excluir), mas a marca permite ao sistema
   * **redividir** — desfazer a divisão automática e refazer com outro alvo —
   * sem apagar os postes de campo/manuais.
   */
  auto?: boolean;
  /**
   * Capacidade nominal (resistência) do poste em daN (B4). Padrão do sistema
   * = 400 (concreto circular, A35P rural — DIS-NOR-013 Quadro 8). O projetista
   * pode subir (ex.: 600) para conferir se o estai deixa de ser necessário.
   */
  capacidadeDaN?: number;
  /**
   * Tipo de poste do catálogo (B8 / DIS-ETE-011) — código altura/carga, ex.:
   * "C-11/600" (11 m, 600 daN, circular). Quando definido, a **carga do tipo é a
   * capacidade** que o esforço usa (tem prioridade sobre `capacidadeDaN`).
   * Ausente = usa `capacidadeDaN` ou o padrão do sistema.
   */
  posteTipo?: string;
  /**
   * Estrutura definida **manualmente** pelo projetista (B3), sobrepondo a
   * sugestão automática da norma. Ex.: forçar CE4 (ancoragem) numa travessia de
   * estrada, ou CE3-CE3 num ângulo > 90°. Vazio/ausente = automático (norma).
   */
  estruturaManual?: string;
  /**
   * Estais instalados neste poste (B4 / E-01). Um poste pode ter **mais de um**
   * (fim + trafo, ângulo forte, duplo encabeçamento). Vazio/ausente = nenhum.
   * Ter ≥ 1 estai **tira a pendência** de projeto quando o esforço pede estai.
   */
  estais?: EstaiPonto[];
  /**
   * Equipamento transformador (E-06) — preenchido quando `tipo === "transformador"`.
   * Ausente = equipamento ainda não configurado.
   */
  trafo?: DadosTransformador;
  /**
   * Equipamentos de proteção/manobra do poste (para-raio, chave fusível,
   * aterramento). Disponível para TODOS os tipos de ponto. No transformador,
   * esses dados ficam em `trafo`; nos demais, ficam aqui.
   */
  equipamentos?: EquipamentoPosto;
  /**
   * Posição do balão oblongo na prancha: 0=cima-dir, 1=cima-esq,
   * 2=baixo-dir, 3=baixo-esq. Persiste o ciclo escolhido pelo projetista.
   */
  balaoPos?: number;
  /**
   * Distância do balão oblongo em relação ao símbolo do poste:
   * 0=normal (padrão), 1=médio, 2=longe. Shift+clique no balão cicla o valor.
   */
  balaoDist?: number;
  /**
   * Texto de **retirada** — exibido ACIMA do balão riscado (DIS-NOR-012).
   * Indica o poste/equipamento existente que será retirado. Ex.: "11300DT - M1".
   */
  retirada?: string;
  /**
   * Texto de **reinstalação** — exibido ABAIXO da linha divisória dentro do balão.
   * A linha divisória aparece SOMENTE quando este campo está preenchido (DIS-NOR-012).
   * Ex.: "ESTAI" ou "CHFU15 - 3 LÂMINAS".
   */
  reinstalacao?: string;
  /**
   * Estribo de espera ferragem confirmada (DIS-NOR-013 §6.15.2).
   * `true` = projetista confirmou que a ferragem estará neste poste.
   * O motor sugere os postes candidatos a cada 300 m; o engenheiro confirma um a um.
   */
  estriboEspera?: boolean;
  /**
   * @deprecated Compatibilidade com arquivos antigos (um estai só). Na leitura,
   * o motor converte `estaiInstalado`/`estaiAzimuteManual` para `estais[]`; ao
   * editar, o Web passa a gravar `estais` e limpa estes campos. Não usar em código novo.
   */
  estaiInstalado?: boolean;
  /** @deprecated ver `estais` — azimute do estai único dos arquivos antigos. */
  estaiAzimuteManual?: number;
}

/**
 * Equipamentos de proteção/manobra que podem estar em QUALQUER tipo de poste
 * (poste proposto, genérico, transformador com derivação, etc.).
 * Para o transformador, esses mesmos dados ficam em `DadosTransformador`; este
 * campo é usado nos demais tipos (onde não há trafo, mas pode haver CHFU/PR).
 */
export interface EquipamentoPosto {
  /** Para-raio instalado. */
  paraRaio?: boolean;
  /** Especificação do para-raio (ex.: "12K" → "NxPR12K"). */
  paraRaioSpec?: string;
  /** Chave fusível instalada. */
  chaveFusivel?: boolean;
  /** Especificação da chave fusível (ex.: "15K" → "NxCHFU15K"). */
  chaveFusivelSpec?: string;
  /** Aterramento instalado. */
  aterramento?: boolean;
  /**
   * Elo fusível da chave (ex.: "5K", "8K"). Campo independente, aparece
   * junto com a chave fusível no oblongo (ex.: "1CHFU15K - 1ELO5K").
   */
  eloFusivel?: string;
  /**
   * Quantidade de para-raios.
   * `undefined` = **automático**: 3 quando o poste está em rede primária, 1 caso contrário.
   */
  qtdParaRaio?: number;
  /**
   * Quantidade de chaves fusíveis (e elos).
   * `undefined` = **automático**: 3 quando o poste está em rede primária, 1 caso contrário.
   */
  qtdChaveFusivel?: number;
}

/**
 * Dados do equipamento transformador instalado num poste (E-06).
 *
 * O campo `trafo` é populado automaticamente quando o tipo do ponto é
 * "transformador" e o projetista preenche o painel de equipamentos.
 * Todos os campos booleanos têm default `false`, exceto `paraRaio` que é `true`
 * (norma — trafo sempre leva para-raio).
 */
export interface DadosTransformador {
  /** Fases: mono (1F), bi (1F c/ neutro) ou trifásico (3F). */
  fases: "monofasico" | "bifasico" | "trifasico";
  /** Potência nominal em kVA. */
  potenciaKva: number;
  /** Chaves fusíveis instaladas (default false). */
  chaveFusivel: boolean;
  /**
   * Especificação da chave fusível (ex.: "15K"). A quantidade é automática
   * pelo número de fases (1/2/3). Renderizado no oblongo como "NxCHFU15K".
   */
  chaveFusivelSpec?: string;
  /** Para-raio instalado (default true — norma exige em trafo). */
  paraRaio: boolean;
  /**
   * Especificação do para-raio (ex.: "12K"). Quantidade automática por fases.
   * Renderizado no oblongo como "NxPR12K".
   */
  paraRaioSpec?: string;
  /** Aterramento instalado. */
  aterramento: boolean;
  /**
   * Elo fusível (ex.: "5K", "8K"). Auto-sugerido pelo catálogo a partir das
   * fases e da potência; pode ser sobrescrito pelo projetista.
   * Renderizado no oblongo como "NxELO5K".
   */
  eloFusivel?: string;
  /** `true` = elo definido manualmente (não será recalculado). */
  eloFusivelManual?: boolean;
  /** Estrutura da rede secundária (ex.: "EDB1", "EM1"). */
  estruturaSecundaria?: string;
  /** Iluminação pública instalada neste ponto. */
  iluminacaoPublica: boolean;
  /** Tipo/potência da luminária, quando `iluminacaoPublica` = true (ex.: "LED 100W"). */
  iluminacaoTipo?: string;
  /** Compartilhamento de infraestrutura (telecom, etc.). */
  compartilhamento: boolean;
  /** Descrição do compartilhamento quando `compartilhamento` = true. */
  compartilhamentoDetalhe?: string;
}

/**
 * Um estai instalado num poste (B4 / E-01). O comprimento do símbolo é fixo
 * (ESTAI_COMPRIMENTO_M); o que varia é a **direção** (azimute da âncora).
 */
export interface EstaiPonto {
  id: string;
  /** Azimute (° 0=N, horário) da ÂNCORA vista do poste — a direção do estai. */
  azimuteGraus: number;
  /**
   * `true` = ainda na direção **sugerida** pela norma (oposto ao esforço);
   * `false` = o projetista **girou** para desviar de obstáculo/limite.
   */
  auto?: boolean;
}

/**
 * Estilo de traçado da linha, espelhando o `styleUrl` do app. Define a cor/
 * simbologia no mapa: `rede` (âmbar), `cerca` (vermelho), `continua` (verde),
 * `pontoTraco` (azul). Preservado para o Web desenhar como o campo enxergou.
 */
export type EstiloLinha = "rede" | "cerca" | "continua" | "pontoTraco" | "outro";

/** Um trecho de rede ligando dois pontos (ou uma polilinha de coordenadas). */
export interface Trecho {
  id: string;
  /** Classe elétrica do trecho. */
  classe: "primaria" | "secundaria" | "ramal" | "indefinida";
  /** Ids dos pontos de origem e destino, quando o trecho liga pontos. */
  dePontoId?: string;
  aPontoId?: string;
  /** Geometria explícita, quando o trecho não é apenas ponto-a-ponto. */
  caminho?: LatLng[];
  estilo?: EstiloLinha;
  observacao?: string;
  /**
   * Cabo do trecho (E-03) — código do catálogo (`cabos.ts`, ex.: "A35P"). Define
   * a tração H usada no esforço/estai. Ausente = cabo padrão do piloto (A35P). Ao
   * criar/ligar/inserir um trecho, herda o cabo do trecho a montante (sentido fonte).
   */
  tipoCabo?: string;
  /**
   * Vão de **tração reduzida** (E-05) — o "vão frouxo" que sai de uma tomada/
   * derivação. Marca este lance para o esforço usar a tração REDUZIDA do cabo
   * (`Cabo.tracaoReduzidaDaN`), transferindo o esforço da tomada para o poste da
   * frente (evita estai no poste sem espaço). Ausente = tração de projeto normal.
   */
  tracaoReduzida?: boolean;
  origem: Origem;
}

/** Uma linha livre desenhada (traçado auxiliar, não necessariamente rede). */
export interface LinhaLivre {
  id: string;
  caminho: LatLng[];
  estilo?: EstiloLinha;
  observacao?: string;
  origem: Origem;
}

/**
 * Uma foto georreferenciada.
 *
 * D-03: no app, a foto é um ponto geográfico INDEPENDENTE — tem coordenada
 * própria e NÃO carrega vínculo a um poste. A associação foto→ponto é um
 * recurso do Web (por proximidade ou manual), não um dado que vem do app.
 */
export interface Foto {
  id: string;
  /** Nome-base exibido no app (ex.: "Foto1"). */
  nome?: string;
  /** Caminho do arquivo dentro do pacote (ex.: "fotos/Foto1.jpg"). */
  arquivo: string;
  wgs84: LatLng;
  /** Precisão do GPS em metros. */
  precisaoM?: number;
  /** Data/hora de captura (ISO 8601), quando disponível. */
  capturadaEm?: string;
  observacao?: string;
  /**
   * GPS sem sinal confiável (ex.: precisão de 300 m): a coordenada é lixo e não
   * deve puxar o enquadramento do mapa. Marcada na importação.
   */
  baixaConfianca?: boolean;
  /**
   * Vínculo ao ponto correspondente — recurso do Web, preenchido depois.
   * Ao importar do app fica indefinido (a foto não traz esse vínculo).
   */
  pontoId?: string;
}

/**
 * Ponto de referência da rede existente (amarração ao cadastro da concessionária).
 * Ex.: código "CAR00833" lido da camada REFERENCIA do DXF.
 */
export interface Referencia {
  id: string;
  codigo: string;
  wgs84?: LatLng;
}

// --------------------------------------------------------------------------
// Rede existente / BDGD
// --------------------------------------------------------------------------

/** Atributos do condutor conforme SSDMT (disponíveis quando exportados via PMTiles). */
export interface CaboMT {
  /** Tipo/material do condutor (TIP_CND no SSDMT, ex.: "CA", "ACSR", "CU"). */
  tipo?: string;
  /** Seção nominal em mm² (CRS_CND no SSDMT, ex.: 50, 70, 95, 120). */
  secaoMm2?: number;
  /** Tensão de operação em kV (TEN_OPE no SSDMT, ex.: 13.8, 34.5). */
  tensaoKv?: number;
}

/** Um segmento da Rede MT existente (dois vértices WGS84). */
export interface SegmentoMT {
  de: LatLng;
  ate: LatLng;
  /** Atributos do condutor — disponíveis quando os campos SSDMT estão no PMTiles. */
  cabo?: CaboMT;
  /** Inserido manualmente pelo usuário (não capturado da BDGD). */
  manual?: boolean;
}

/**
 * Poste real da BDGD (camada PONNOT) ou inserido manualmente.
 */
export interface PosteBdgd {
  /** Posição WGS84 do poste. */
  wgs84: LatLng;
  /**
   * Tipo de estrutura (TIP_EST).
   * Código ANEEL: 1=Madeira, 2=Concreto, 3=Metálico, 4=Fibra de vidro.
   */
  tipEst?: string | number;
  /** Altura da estrutura em metros (ALT_EST), ex.: 9, 11, 13. */
  altEst?: number;
  /**
   * Tipo de operação (TIP_OPE).
   * Código ANEEL: 1=Derivação, 2=Passagem, 3=Término, 4=Ancoragem.
   */
  tipOpe?: string | number;
  /** Identificador único do registro (COD_ID). */
  codId?: string;
  /** Inserido manualmente pelo usuário (não capturado da BDGD). */
  manual?: boolean;
}

/** Transformador existente na área BDGD (capturado da BDGD ou inserido manualmente). */
export interface TrafoExistente {
  /** Posição WGS84 do transformador. */
  wgs84: LatLng;
  /** Rótulo exibido na prancha (ex.: "TR-15kVA"). */
  label?: string;
  /** Potência nominal em kVA, quando disponível. */
  potKva?: number;
  /** Inserido manualmente pelo usuário (não capturado da BDGD). */
  manual?: boolean;
}

/**
 * Área BDGD do projeto — retângulo georreferenciado com snapshot completo da
 * rede existente dentro dele. Substitui o antigo `contextoBdgd` (snapshot
 * efêmero de viewport); aqui os dados são do projeto (persistem no .mkf).
 *
 * Em projetos novos: bbox é desenhado pelo usuário no mapa → sistema captura
 * automaticamente os dados BDGD dentro do retângulo. O usuário pode também
 * inserir elementos manualmente (manual=true) quando não há BDGD disponível.
 */
export interface AreaBdgd {
  /** Retângulo de captura (WGS84 graus). Null = ainda não definido. */
  bbox?: { norte: number; sul: number; leste: number; oeste: number };
  /** Postes reais (PONNOT) dentro da área — capturados da BDGD ou inseridos manualmente. */
  postesBdgd: PosteBdgd[];
  /** Segmentos da Rede MT dentro da área. */
  segmentosMT: SegmentoMT[];
  /** Transformadores dentro da área. */
  trafos: TrafoExistente[];
}

// --------------------------------------------------------------------------
// Projeto
// --------------------------------------------------------------------------

/** Metadados do projeto. */
export interface ProjetoMeta {
  /** Nome legível do projeto (não é a fonte de verdade — ver DRS RD-02). */
  nome: string;
  /** Concessionária / praça (piloto: "neoenergia"). Escolhe o domain pack. */
  concessionaria?: string;
  /**
   * Tipo de rede elétrica do projeto.
   *
   * - `"compacta"` — Rede de Distribuição Compacta com cabos cobertos (DIS-NOR-013).
   *   Estruturas CE1/CE2/CE4/CE3-CE3/CE3TR/etc. É o padrão para projetos novos
   *   da Neoenergia Elektro em áreas urbanas e expansão.
   * - `"nua"` — Rede com condutores nus até 36,2 kV (DIS-NOR-018). Estruturas
   *   N1/N4/N3-N3/N3/etc. Usada em projetos rurais e manutenção onde a rede
   *   compacta não é aplicável (Elektro). Cabos: ACSR SWAN/RAVEN/PENGUIN/LINNET.
   *
   * Ausente ou `undefined` → interpreta como `"compacta"` (compatibilidade com
   * projetos existentes que não tinham este campo).
   */
  tipoRede?: "compacta" | "nua";
  criadoEm: string; // ISO 8601
  atualizadoEm: string; // ISO 8601
}

/**
 * O projeto inteiro em memória. É isto que a UI edita, o motor calcula e os
 * renderizadores consomem.
 */
export interface Projeto {
  /** Versão do esquema deste modelo, para migração futura. */
  schemaVersion: 1;
  meta: ProjetoMeta;
  pontos: Ponto[];
  trechos: Trecho[];
  linhasLivres: LinhaLivre[];
  fotos: Foto[];
  referencias: Referencia[];
  /**
   * Área BDGD do projeto — snapshot da rede existente capturado pelo usuário.
   * Persiste no .mkf. Substituiu o antigo `contextoRedeExistente` (legado).
   */
  areaBdgd?: AreaBdgd;
}

/** Cria um projeto vazio e válido. */
export function projetoVazio(
  nome: string,
  tipoRede?: "compacta" | "nua",
): Projeto {
  const agora = new Date().toISOString();
  return {
    schemaVersion: 1,
    meta: { nome, criadoEm: agora, atualizadoEm: agora, tipoRede },
    pontos: [],
    trechos: [],
    linhasLivres: [],
    fotos: [],
    referencias: [],
  };
}
