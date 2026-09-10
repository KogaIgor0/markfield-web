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
 * Zoom máximo em que a Esri REALMENTE fornece imagem na área do projeto (D-09).
 *
 * O erro "Map data not yet available" é um tile cinza que a própria Esri devolve
 * quando pedimos um zoom sem cobertura — comum no interior rural. A solução é
 * NÃO pedir esses tiles: capamos a fonte neste zoom e deixamos o mapa esticar/
 * ampliar o último tile real (fica um pouco mais macio ao aproximar, mas SEM o
 * quadro cinza). Aproximar além disso continua funcionando, só perde nitidez.
 *
 * 17 é seguro para áreas habitadas do interior de SP (≈1,2 m/pixel — dá pra ver
 * estradas e cercas). Se a sua região tiver imagem mais fechada, pode subir para
 * 18 (mais nítido); se AINDA aparecer o cinza, baixe para 16.
 *
 * Para achar o número ideal da SUA região SEM mexer no código, acrescente
 * `?imgzoom=18` (ou 16, 19…) no fim do endereço do preview e recarregue — vale
 * na hora. O padrão abaixo (17) é o que fica valendo sem esse parâmetro.
 */
function lerEsriMaxzoom(): number {
  const PADRAO = 17;
  try {
    const v = new URLSearchParams(window.location.search).get("imgzoom");
    const n = v ? Number(v) : NaN;
    return Number.isFinite(n) && n >= 10 && n <= 20 ? Math.trunc(n) : PADRAO;
  } catch {
    return PADRAO;
  }
}

export const ESRI_MAXZOOM = lerEsriMaxzoom();

/**
 * Chave do MapTiler (usada só quando BASE_MAPA === "maptiler"). Como o mapa roda
 * no navegador, a chave fica exposta no bundle — normal para chave de mapa.
 * Restrinja por domínio (Allowed origins) no painel do MapTiler e, na produção,
 * use `VITE_MAPTILER_KEY` como variável de ambiente.
 */
export const MAPTILER_KEY =
  (import.meta.env.VITE_MAPTILER_KEY as string | undefined) ?? "uzHeG3MjScryOo45geMn";
