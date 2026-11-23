import type { Ponto } from "./model";
import type { PosteModelado } from "./rede";
import { LIMITE_TANGENTE_GRAUS } from "./rede";

/**
 * Estruturas (B3 / T3) — rede compacta protegida Elektro (DIS-NOR-013 rev.08).
 *
 * A partir do modelo de rede (B1: papel + ângulo de deflexão + equipamento),
 * atribui a cada poste o **código de estrutura** da norma.
 *
 * Regras automáticas confirmadas (DIS-NOR-013):
 *   Ângulo/função de linha:
 *     - tangente (deflexão ≤ 6°) ............... CE1
 *     - ângulo  6° <  d ≤  60° ................. CE2
 *     - ângulo 60° <  d ≤  90° ................. CE4   (amarração)
 *     - ângulo 90° <  d ≤ 120° ................. CE3-CE3 (duplo encabeçamento)
 *     - ângulo > 120° .......................... CE3-CE3 (revisar traçado)
 *   Papel:
 *     - fim de rede ............................ CE3
 *     - fim de rede com transformador .......... CE3TR
 *   Transformador sob a rede (grau ≥ 2):
 *     - deflexão ≤ 60° ......................... CE2TR
 *     - deflexão 60–90° ........................ CE4TR
 *     - deflexão > 90° ......................... CE4TR (revisar)
 *   Derivação (grau ≥ 3) — revisar, tipos possíveis:
 *     CE2.3  (mesmo nível, mesmo lado)  |  CE2.CE3  (mesmo nível, lados opostos)
 *     CE2-CE3 (níveis diferentes)       |  CE2-CE3 CF (com chave fusível)
 *
 * Casos sem auto: fonte, poste isolado, ângulo > 120° com trafo.
 *
 * Sufixos padronizados: TR trafo, PR para-raios, CF chave fusível,
 * PU poste existente, SAH afastador, SUH seccionador.
 */

export type Confianca = "ok" | "revisar" | "manual";

export interface EstruturaAtribuida {
  /** Código da estrutura (ex.: "CE2", "CE3TR"). Vazio quando não se aplica. */
  codigo: string;
  /** Rótulo legível. */
  descricao: string;
  /** `ok` = regra confirmada; `revisar` = a norma não fecha só pelo ângulo; `manual` = definida pelo projetista. */
  confianca: Confianca;
  /** Por que revisar / observação (ou o que a norma sugere, no caso manual). */
  motivo?: string;
}

/**
 * Códigos de estrutura conhecidos (override). Fonte única = catálogo E-02
 * (`estruturas-catalogo.ts`); o campo "Outro" aceita qualquer código da norma.
 */
export { CODIGOS_ESTRUTURA } from "./estruturas-catalogo";

/** Limite superior (°) do CE2; acima disso (até 90°) é CE4. */
export const ANGULO_CE2_MAX = 60;
/** Limite superior (°) do CE4. Acima de 90° a norma pede análise (revisar). */
export const ANGULO_CE4_MAX = 90;

/** Ângulo máximo para duplo encabeçamento CE3-CE3 sem revisar. */
export const ANGULO_CE3CE3_MAX = 120;

/** Estrutura de um poste de LINHA (grau ≥ 2, sem equipamento) pelo ângulo. */
function porAngulo(d: number | undefined): EstruturaAtribuida {
  const g = d ?? 0;
  if (g <= LIMITE_TANGENTE_GRAUS) {
    return { codigo: "CE1", descricao: `Tangente (deflexão ${g.toFixed(1)}°)`, confianca: "ok" };
  }
  if (g <= ANGULO_CE2_MAX) {
    return { codigo: "CE2", descricao: `Ângulo ${g.toFixed(1)}° (6–60°)`, confianca: "ok" };
  }
  if (g <= ANGULO_CE4_MAX) {
    return { codigo: "CE4", descricao: `Ângulo ${g.toFixed(1)}° (60–90°, amarração)`, confianca: "ok" };
  }
  // > 90°: duplo encabeçamento CE3-CE3 (DIS-NOR-013)
  return {
    codigo: "CE3-CE3",
    descricao: `Ângulo ${g.toFixed(1)}° (> 90°, duplo encabeçamento)`,
    confianca: g <= ANGULO_CE3CE3_MAX ? "ok" : "revisar",
    motivo: g > ANGULO_CE3CE3_MAX
      ? `Ângulo ${g.toFixed(1)}° > 120° — traçado muito fechado; confirmar duplo encabeçamento ou rever rota.`
      : undefined,
  };
}

/**
 * Classifica a estrutura de um poste. Se o projetista definiu uma estrutura
 * **manual** (`estruturaManual`), ela manda — mesmo contra a norma — e mostramos
 * o que a norma sugeriria. Senão, usa a regra automática.
 */
export function classificarEstrutura(pm: PosteModelado, ponto: Ponto): EstruturaAtribuida {
  const manual = ponto.estruturaManual?.trim();
  if (manual) {
    const auto = estruturaAutomatica(pm, ponto);
    return {
      codigo: manual,
      descricao: "Definida pelo projetista",
      confianca: "manual",
      motivo: auto.codigo && auto.codigo !== manual ? `norma sugere ${auto.codigo}` : undefined,
    };
  }
  return estruturaAutomatica(pm, ponto);
}

/** Regra automática da norma (sem override). */
function estruturaAutomatica(pm: PosteModelado, ponto: Ponto): EstruturaAtribuida {
  const trafo = ponto.tipo === "transformador";

  // ── Transformador (DIS-NOR-013) ───────────────────────────────────────────
  if (trafo) {
    if (pm.grau <= 1) {
      // Fim de rede: CE3TR (ou CE3TRSC se sem CF — não temos esse dado automaticamente)
      return { codigo: "CE3TR", descricao: "Fim de rede com transformador", confianca: "ok" };
    }
    // Sob a rede: ângulo determina CE2TR ou CE4TR
    const g = pm.deflexaoGraus ?? 0;
    if (g <= ANGULO_CE2_MAX) {
      return { codigo: "CE2TR", descricao: `Transformador sob a rede (deflexão ${g.toFixed(1)}°)`, confianca: "ok" };
    }
    if (g <= ANGULO_CE4_MAX) {
      return { codigo: "CE4TR", descricao: `Transformador em ângulo (${g.toFixed(1)}°, amarração)`, confianca: "ok" };
    }
    return {
      codigo: "CE4TR",
      descricao: `Transformador em grande ângulo (${g.toFixed(1)}°)`,
      confianca: "revisar",
      motivo: `Ângulo ${g.toFixed(1)}° > 90° com trafo — confirmar CE4TR ou duplo encabeçamento.`,
    };
  }

  switch (pm.papel) {
    case "fonte":
      return {
        codigo: "",
        descricao: "Saída da rede existente",
        confianca: "revisar",
        motivo: "Estrutura da conexão à rede existente — depende do poste/derivação existente.",
      };
    case "isolado":
      return {
        codigo: "",
        descricao: "Poste solto (fora da rede)",
        confianca: "revisar",
        motivo: "Poste sem ligação — ligue-o à rede para classificar.",
      };
    case "fim":
      return { codigo: "CE3", descricao: "Fim de rede (encabeçamento)", confianca: "ok" };
    case "derivacao":
      return {
        codigo: "CE2.3",
        descricao: `Derivação (${pm.grau} saídas)`,
        confianca: "revisar",
        motivo: "Confirmar tipo: CE2.3 (mesmo nível/lado), CE2.CE3 (mesmo nível/lados opostos), CE2-CE3 (níveis diferentes), CE2-CE3 CF (com chave fusível).",
      };
    case "tangente":
    case "angulo":
    default:
      return porAngulo(pm.deflexaoGraus);
  }
}

/** Rótulo curto para o mapa (código + "?" quando é para revisar). */
export function rotuloEstrutura(e: EstruturaAtribuida): string {
  if (!e.codigo) return "";
  return e.confianca === "revisar" ? `${e.codigo}?` : e.codigo;
}
