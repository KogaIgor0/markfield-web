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
   * @deprecated Compatibilidade com arquivos antigos (um estai só). Na leitura,
   * o motor converte `estaiInstalado`/`estaiAzimuteManual` para `estais[]`; ao
   * editar, o Web passa a gravar `estais` e limpa estes campos. Não usar em código novo.
   */
  estaiInstalado?: boolean;
  /** @deprecated ver `estais` — azimute do estai único dos arquivos antigos. */
  estaiAzimuteManual?: number;
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
// Projeto
// --------------------------------------------------------------------------

/** Metadados do projeto. */
export interface ProjetoMeta {
  /** Nome legível do projeto (não é a fonte de verdade — ver DRS RD-02). */
  nome: string;
  /** Concessionária / praça (piloto: "neoenergia"). Escolhe o domain pack. */
  concessionaria?: string;
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
}

/** Cria um projeto vazio e válido. */
export function projetoVazio(nome: string): Projeto {
  const agora = new Date().toISOString();
  return {
    schemaVersion: 1,
    meta: { nome, criadoEm: agora, atualizadoEm: agora },
    pontos: [],
    trechos: [],
    linhasLivres: [],
    fotos: [],
    referencias: [],
  };
}
