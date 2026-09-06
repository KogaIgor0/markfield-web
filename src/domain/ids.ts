/**
 * Geração de IDs estáveis para elementos do projeto.
 *
 * IDs precisam ser únicos e não colidir entre importações (o merge do .mkf
 * depende disso). Usamos `crypto.randomUUID()` quando disponível, com um
 * fallback simples para ambientes que não o exponham.
 */

export function novoId(prefixo = "el"): string {
  const uuid =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Date.now().toString(36);
  return `${prefixo}_${uuid}`;
}
