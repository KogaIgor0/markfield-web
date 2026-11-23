import type { Ponto } from "./model";
import type { PosteModelado } from "./rede";
import { LIMITE_TANGENTE_GRAUS } from "./rede";

/**
 * Estruturas (B3 / T3) — rede com condutores nus até 36,2 kV (DIS-NOR-018 Rev.01).
 *
 * Motor paralelo ao `estrutura.ts` (rede compacta). A partir do modelo de rede
 * (B1: papel + ângulo de deflexão + equipamento), atribui o **código de estrutura**
 * da DIS-NOR-018 Anexo I (Est. 1-24, comuns a todos os distribuidores).
 *
 * Para Neoenergia Elektro (§6.10.3 e nota do Anexo I):
 *   N1, N3, N4, N3-N3, N4-N3, B1, B3, B4 → usam MEIO BECO (não beco completo).
 *
 * Regras automáticas (deduzidas dos títulos das estruturas e §6.10 da norma):
 *   Por ângulo de deflexão:
 *     - tangente (deflexão ≤ 6°) ............... N1  [meio beco Elektro]
 *     - ângulo  6° < d ≤ 60° ................... N4  [meio beco Elektro] (amarração simples)
 *     - ângulo d > 60° ......................... N3-N3 [meio beco Elektro] (duplo encabeçamento)
 *   Por papel no nó:
 *     - fim de rede (grau ≤ 1) ................. N3  [meio beco Elektro]
 *     - fim de rede com transformador .......... N3-TT
 *     - transformador sob a rede (grau ≥ 2) .... N1-TT
 *     - derivação sem CF (grau ≥ 3) ............ N4-N3 [meio beco] (manual)
 *
 * Mapeamento compacta → nua (referência cruzada DIS-NOR-013 ↔ DIS-NOR-018):
 *   CE1      → N1        CE2/CE4 → N4       CE3-CE3 → N3-N3
 *   CE3      → N3        CE3TR   → N3-TT    CE2TR/CE4TR → N1-TT
 *   CE2.3    → N4-N3
 *
 * Estruturas exclusivas Neoenergia Elektro (Anexos II-V) = somente MANUTENÇÃO,
 * não são atribuídas automaticamente. O projetista as define via `estruturaManual`.
 *
 * ⚠️ Regra de ângulo do N4/N3-N3 é deduzida da norma (threshold = 60°). A
 * DIS-NOR-012 (critérios gerais) ainda não foi recebida e pode refinar os limites.
 */

export type Confianca = "ok" | "revisar" | "manual";

export interface EstruturaAtribuida {
  /** Código da estrutura (ex.: "N1", "N3-N3"). Vazio quando não se aplica. */
  codigo: string;
  /** Rótulo legível. */
  descricao: string;
  /** `ok` = regra confirmada; `revisar` = confirmar no projeto; `manual` = definida pelo projetista. */
  confianca: Confianca;
  /** Observação ou motivo de revisão. */
  motivo?: string;
}

/** Limite (°) do N4; acima disso a norma pede N3-N3 (duplo encabeçamento). */
export const ANGULO_N4_MAX = 60;

/** Estrutura de um poste de LINHA pelo ângulo de deflexão (rede nua). */
function porAngulo(d: number | undefined): EstruturaAtribuida {
  const g = d ?? 0;
  if (g <= LIMITE_TANGENTE_GRAUS) {
    return {
      codigo: "N1",
      descricao: `Tangente (deflexão ${g.toFixed(1)}°) — meio beco`,
      confianca: "ok",
    };
  }
  if (g <= ANGULO_N4_MAX) {
    return {
      codigo: "N4",
      descricao: `Amarração ângulo ${g.toFixed(1)}° (6–60°) — meio beco`,
      confianca: "ok",
    };
  }
  // > 60°: duplo encabeçamento N3-N3
  return {
    codigo: "N3-N3",
    descricao: `Duplo encabeçamento ângulo ${g.toFixed(1)}° (> 60°) — meio beco`,
    confianca: g <= 90 ? "ok" : "revisar",
    motivo: g > 90
      ? `Ângulo ${g.toFixed(1)}° > 90° — traçado muito fechado; confirmar N3-N3 ou rever rota.`
      : undefined,
  };
}

/**
 * Classifica a estrutura de um poste de **rede nua** (DIS-NOR-018).
 * Se o projetista definiu `estruturaManual`, ela prevalece (mostramos o que a norma sugere).
 */
export function classificarEstruturaNua(pm: PosteModelado, ponto: Ponto): EstruturaAtribuida {
  const manual = ponto.estruturaManual?.trim();
  if (manual) {
    const auto = estruturaNuaAutomatica(pm, ponto);
    return {
      codigo: manual,
      descricao: "Definida pelo projetista",
      confianca: "manual",
      motivo: auto.codigo && auto.codigo !== manual ? `norma sugere ${auto.codigo}` : undefined,
    };
  }
  return estruturaNuaAutomatica(pm, ponto);
}

/** Regra automática da norma DIS-NOR-018 (sem override manual). */
function estruturaNuaAutomatica(pm: PosteModelado, ponto: Ponto): EstruturaAtribuida {
  const trafo = ponto.tipo === "transformador";

  // ── Transformador (DIS-NOR-018 Est. 11/12) ───────────────────────────────
  if (trafo) {
    if (pm.grau <= 1) {
      // Fim de rede: N3-TT (Est.12 = fim de rede com trafo)
      return { codigo: "N3-TT", descricao: "Fim de rede com transformador (N3-TT)", confianca: "ok" };
    }
    // Passante / sob a rede: N1-TT (Est.11 = trafo trifásico passante)
    const g = pm.deflexaoGraus ?? 0;
    return {
      codigo: "N1-TT",
      descricao: `Transformador sob a rede (deflexão ${g.toFixed(1)}°) — N1-TT`,
      confianca: g <= ANGULO_N4_MAX ? "ok" : "revisar",
      motivo: g > ANGULO_N4_MAX
        ? `Deflexão ${g.toFixed(1)}° > 60° com trafo passante — confirmar N1-TT ou N4-N3-TT.`
        : undefined,
    };
  }

  switch (pm.papel) {
    case "fonte":
      return {
        codigo: "",
        descricao: "Saída da rede existente",
        confianca: "revisar",
        motivo: "Estrutura da conexão à rede existente — verificar Est. existente ou M1-N3 (manutenção).",
      };
    case "isolado":
      return {
        codigo: "",
        descricao: "Poste solto (fora da rede)",
        confianca: "revisar",
        motivo: "Poste sem ligação — ligue-o à rede para classificar.",
      };
    case "fim":
      // Fim de rede sem trafo: N3 (Est.7 = ancoragem fim de linha)
      return { codigo: "N3", descricao: "Fim de rede — N3 (meio beco)", confianca: "ok" };
    case "derivacao":
      // Derivação: N4-N3 (Est.10, sem CF) — confirmar no projeto
      return {
        codigo: "N4-N3",
        descricao: `Derivação (${pm.grau} saídas) — N4-N3 (meio beco)`,
        confianca: "revisar",
        motivo: "Confirmar: N4-N3 (sem CF) ou N4-CFU (com chave fusível).",
      };
    case "tangente":
    case "angulo":
    default:
      return porAngulo(pm.deflexaoGraus);
  }
}

/** Rótulo curto para o mapa (código + "?" quando é para revisar). */
export function rotuloEstruturaNua(e: EstruturaAtribuida): string {
  if (!e.codigo) return "";
  return e.confianca === "revisar" ? `${e.codigo}?` : e.codigo;
}
