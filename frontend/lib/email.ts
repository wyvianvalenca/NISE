/**
 * Formato do e-mail no cadastro (RF-S2.03).
 *
 * A regra existe porque "alana@gmail" é erro comum e silencioso: a menina
 * acha que digitou certo e nunca recebe nada. O servidor refaz esta checagem;
 * aqui é só para ela saber antes de enviar.
 */

/** Mensagem exata da tela E01, usada no campo quando falta o domínio. */
export const ERRO_SEM_DOMINIO = "Inclua o domínio, como nome@exemplo.com";

/** `true` quando tem parte local, arroba e um domínio com ponto e final de 2+ letras. */
export function emailValido(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/.test(email.trim());
}
