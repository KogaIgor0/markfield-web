/**
 * Configuração de ambiente do Markfield Web.
 */

/**
 * Qual base de satélite usar (D-09).
 *  - "esri": Esri World Imagery — gratuita, sem chave, imagem nítida onde tem
 *    cobertura; pode faltar imagem em zoom muito fechado no interior rural.
 *  - "maptiler": MapTiler satellite-v2 — cobertura global e sem placeholder,
 *    mas em algumas áreas a imagem é menos nítida que a da Esri.
 *
 * Para trocar, mude só esta palavra e salve.
 */
export const BASE_MAPA: "esri" | "maptiler" = "esri";

/**
 * Chave do MapTiler (usada só quando BASE_MAPA === "maptiler"). Como o mapa roda
 * no navegador, a chave fica exposta no bundle — normal para chave de mapa.
 * Restrinja por domínio (Allowed origins) no painel do MapTiler e, na produção,
 * use `VITE_MAPTILER_KEY` como variável de ambiente.
 */
export const MAPTILER_KEY =
  (import.meta.env.VITE_MAPTILER_KEY as string | undefined) ?? "uzHeG3MjScryOo45geMn";
