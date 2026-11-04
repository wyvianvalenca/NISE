/**
 * Rotas do cadastro com o Google (H2, #52).
 *
 * ATENÇÃO: o back-end destas rotas ainda não existe. Ele vem com os enablers
 * #47 (contas e sessão) e #50 (lista do IBGE). Os caminhos e os nomes abaixo
 * são a proposta de contrato desta história — se mudarem no PR do back, muda
 * só este arquivo.
 *
 * A sessão incompleta do Google fica num cookie httpOnly posto pelo callback,
 * então nada aqui guarda nome, e-mail ou data de nascimento.
 */

/** O que o Google devolveu e o back guardou na sessão incompleta. */
export type CadastroPendente = {
  nome: string;
  email: string;
};

/** Município da lista do IBGE (RN-17: nada de texto livre). */
export type Cidade = {
  /** Código do município no IBGE. */
  id: string;
  /** Como aparece na tela, ex.: "Maceió, AL". */
  nome: string;
};

export type ResultadoCompletar =
  | { ok: true; proximoPasso: "termos" }
  | { ok: false; motivo: "menor_de_13" | "cidade_invalida" | "falha" };

/**
 * Para onde mandar a menina ao clicar em "Criar conta com o Google".
 * O código do convite vai junto porque o back precisa dele no `state` do OAuth,
 * para a origem da conta sair certa na volta (RN-29).
 */
export function urlInicioGoogle(
  opcoes: { convite?: string; trocarConta?: boolean } = {},
): string {
  const busca = new URLSearchParams();

  if (opcoes.convite) {
    busca.set("convite", opcoes.convite);
  }
  if (opcoes.trocarConta) {
    busca.set("trocar_conta", "1");
  }

  const query = busca.toString();
  return query ? `/api/auth/google/inicio?${query}` : "/api/auth/google/inicio";
}

/** Nome e e-mail da sessão incompleta, ou `null` quando não há nenhuma. */
export async function buscarCadastroPendente(
  signal?: AbortSignal,
): Promise<CadastroPendente | null> {
  const resposta = await fetch("/api/auth/cadastro/pendente", { signal });

  if (resposta.status === 404) {
    return null;
  }
  if (!resposta.ok) {
    throw new Error(`cadastro pendente: ${resposta.status}`);
  }

  return (await resposta.json()) as CadastroPendente;
}

/** Municípios que casam com o que ela digitou (#50). */
export async function buscarCidades(
  busca: string,
  signal?: AbortSignal,
): Promise<Cidade[]> {
  const resposta = await fetch(
    `/api/cidades?busca=${encodeURIComponent(busca)}`,
    { signal },
  );

  if (!resposta.ok) {
    throw new Error(`cidades: ${resposta.status}`);
  }

  return (await resposta.json()) as Cidade[];
}

/** Completa o perfil e devolve o próximo passo do cadastro. */
export async function completarCadastro(dados: {
  dataNascimento: string;
  cidadeId: string;
}): Promise<ResultadoCompletar> {
  const resposta = await fetch("/api/auth/cadastro/completar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(dados),
  });

  if (resposta.ok) {
    return { ok: true, proximoPasso: "termos" };
  }

  if (resposta.status === 422) {
    const corpo = (await resposta.json().catch(() => null)) as {
      erro?: string;
    } | null;

    if (corpo?.erro === "under_13") {
      return { ok: false, motivo: "menor_de_13" };
    }
    if (corpo?.erro === "cidade_invalida") {
      return { ok: false, motivo: "cidade_invalida" };
    }
  }

  return { ok: false, motivo: "falha" };
}

/**
 * Joga fora a sessão incompleta e o que veio do Google, sem criar conta.
 * Usado no "Usar outra conta" e quando ela tem menos de 13 (RN-03).
 */
export async function descartarCadastro(): Promise<void> {
  await fetch("/api/auth/cadastro/descartar", { method: "POST" });
}

// ---------------------------------------------------------------------------
// Cadastro por e-mail e senha (H1, #51)
// ---------------------------------------------------------------------------

/** Tamanho mínimo da senha, checado de novo no servidor. */
export const SENHA_MINIMA = 8;

/**
 * O que o convite de um grupo devolve para montar a A01b.
 *
 * Só o nome do grupo, de propósito. A descrição da #51 previa devolver aqui
 * o e-mail do registro importado, para preencher o campo — mas esta rota é
 * pública, e código de convite adivinhado viraria uma forma de colher e-mail
 * de menina menor de idade. A ligação com o registro importado acontece no
 * servidor, pelo e-mail que ela mesma digitar (RF-F2.02, RN-29), sem a rota
 * pública precisar expor nada. A decidir com a #68 antes do back ser escrito.
 */
export type Convite = {
  /** Nome do grupo, como aparece no chip e no texto ("Rendeiras"). */
  grupoNome: string;
};

export type DadosCadastroEmail = {
  nome: string;
  email: string;
  senha: string;
  dataNascimento: string;
  cidadeId: string;
  /** Código do convite, quando ela veio por um; decide a origem da conta. */
  convite?: string;
};

export type ResultadoCadastroEmail =
  | { ok: true; proximoPasso: "termos" }
  | {
      ok: false;
      motivo:
        | "menor_de_13"
        | "email_invalido"
        | "conta_existente"
        | "cidade_invalida"
        | "senha_curta"
        | "falha";
    };

/**
 * Dados públicos de um código de convite, para a A01b (#51).
 * Devolve `null` quando o código não existe ou expirou — a tela cai na A01.
 */
export async function buscarConvite(
  codigo: string,
  signal?: AbortSignal,
): Promise<Convite | null> {
  const resposta = await fetch(
    `/api/convites/${encodeURIComponent(codigo)}`,
    { signal },
  );

  if (resposta.status === 404 || resposta.status === 410) {
    return null;
  }
  if (!resposta.ok) {
    throw new Error(`convite: ${resposta.status}`);
  }

  return (await resposta.json()) as Convite;
}

/**
 * Cria a conta com e-mail e senha (#51). A resposta já abre a sessão e o
 * próximo passo é sempre os termos (H3).
 */
export async function criarContaComEmail(
  dados: DadosCadastroEmail,
): Promise<ResultadoCadastroEmail> {
  const resposta = await fetch("/api/auth/cadastro/email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(dados),
  });

  if (resposta.ok) {
    return { ok: true, proximoPasso: "termos" };
  }

  if (resposta.status === 409) {
    return { ok: false, motivo: "conta_existente" };
  }

  // O servidor refaz idade, formato do e-mail, senha e cidade (RNF-G.03).
  if (resposta.status === 422) {
    const corpo = (await resposta.json().catch(() => null)) as {
      erro?: string;
    } | null;

    const conhecidos: Record<string, ResultadoCadastroEmail> = {
      under_13: { ok: false, motivo: "menor_de_13" },
      email_invalido: { ok: false, motivo: "email_invalido" },
      cidade_invalida: { ok: false, motivo: "cidade_invalida" },
      senha_curta: { ok: false, motivo: "senha_curta" },
    };
    const conhecido = corpo?.erro ? conhecidos[corpo.erro] : undefined;
    if (conhecido) {
      return conhecido;
    }
  }

  return { ok: false, motivo: "falha" };
}
