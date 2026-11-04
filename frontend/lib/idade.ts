/**
 * Regra de idade da NISE (RN-03, RF-F7.01): só cria conta quem já tem 13 anos.
 *
 * Mora num lugar só porque o cadastro por e-mail (H1, #51) e o cadastro com o
 * Google (H2, #52) usam a mesma regra. A idade sai da data de hoje no fuso de
 * Maceió, e quem faz 13 hoje passa.
 *
 * O servidor refaz esta conta; aqui a gente só evita mandar o que seria
 * recusado, para nenhum dado da menina sair da tela à toa.
 */

export const IDADE_MINIMA = 13;

/** Hoje em Maceió, como "AAAA-MM-DD" (o formato que o `en-CA` produz). */
export function hojeEmMaceio(agora: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Maceio",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(agora);
}

/** Quebra "AAAA-MM-DD" em números, recusando data que não existe (como 30/02). */
function partes(data: string): [number, number, number] | null {
  const casa = /^(\d{4})-(\d{2})-(\d{2})$/.exec(data);
  if (!casa) {
    return null;
  }

  const ano = Number(casa[1]);
  const mes = Number(casa[2]);
  const dia = Number(casa[3]);
  const teste = new Date(Date.UTC(ano, mes - 1, dia));

  if (
    teste.getUTCFullYear() !== ano ||
    teste.getUTCMonth() !== mes - 1 ||
    teste.getUTCDate() !== dia
  ) {
    return null;
  }

  return [ano, mes, dia];
}

/**
 * Idade em anos completos na data de referência, ou `null` quando a data de
 * nascimento não serve: formato errado, dia inexistente ou no futuro.
 */
export function idadeEm(
  nascimento: string,
  referencia: string = hojeEmMaceio(),
): number | null {
  const nasceu = partes(nascimento);
  const hoje = partes(referencia);

  if (!nasceu || !hoje || nascimento > referencia) {
    return null;
  }

  const [anoNasceu, mesNasceu, diaNasceu] = nasceu;
  const [anoHoje, mesHoje, diaHoje] = hoje;
  const aindaNaoFezAniversario =
    mesHoje < mesNasceu || (mesHoje === mesNasceu && diaHoje < diaNasceu);

  return anoHoje - anoNasceu - (aindaNaoFezAniversario ? 1 : 0);
}

/**
 * O que fazer com a data que ela digitou.
 *
 * São três respostas, e não duas, de propósito: um booleano juntaria "data
 * errada" com "menor de 13", e quem digitasse 2090 no lugar de 2009 seria
 * mandada para a A02c como se fosse criança — perdendo a sessão no caminho.
 */
export type ChecagemIdade = "ok" | "menor_de_13" | "data_invalida";

/** Decide entre seguir, barrar por idade (RN-03) ou pedir a data de novo. */
export function checarIdade(
  nascimento: string,
  referencia: string = hojeEmMaceio(),
): ChecagemIdade {
  const idade = idadeEm(nascimento, referencia);

  if (idade === null) {
    return "data_invalida";
  }
  return idade >= IDADE_MINIMA ? "ok" : "menor_de_13";
}
