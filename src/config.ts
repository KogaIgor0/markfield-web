/**
 * Configuração de ambiente do Markfield Web.
 *
 * A chave do MapTiler é usada no cliente (o mapa roda no navegador), então ela
 * fica exposta no bundle — isso é normal para chaves de mapa. Para proteger:
 *   1. No painel do MapTiler (Account → Keys), restrinja por **Allowed origins**
 *      (domínios onde o app roda) para ninguém usar sua cota fora do seu app.
 *   2. Na produção, defina `VITE_MAPTILER_KEY` como variável de ambiente — o
 *      valor abaixo é só o fallback de desenvolvimento.
 */
export const MAPTILER_KEY =
  (import.meta.env.VITE_MAPTILER_KEY as string | undefined) ?? "uzHeG3MjScryOo45geMn";
