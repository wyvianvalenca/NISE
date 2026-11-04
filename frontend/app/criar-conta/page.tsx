"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, type FormEvent } from "react";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/Button";
import { CityField } from "@/components/CityField";
import { Field } from "@/components/Field";
import { GoogleButton } from "@/components/GoogleButton";
import { TextLink } from "@/components/TextLink";
import {
  buscarConvite,
  criarContaComEmail,
  SENHA_MINIMA,
  type Cidade,
} from "@/lib/cadastro";
import { emailValido, ERRO_SEM_DOMINIO } from "@/lib/email";
import { checarIdade } from "@/lib/idade";
import styles from "./page.module.css";

type Erros = {
  nome?: string;
  email?: string;
  senha?: string;
  dataNascimento?: string;
  cidade?: string;
  geral?: string;
};

const ERRO_DE_REDE = "Não deu pra criar sua conta agora. Tente de novo.";

/**
 * A02 "Crie sua conta" (Figma 511:505), issue #51.
 *
 * Serve aos dois fluxos: com convite (M1, `?convite=<codigo>`) e sem (M2).
 * O código do convite segue junto para o servidor, porque é ele que decide a
 * origem da conta e, mais adiante, o texto dos termos (RN-29, H3).
 *
 * Quando o grupo já importou o e-mail dela numa planilha, o campo chega
 * preenchido, para a conta ativar aquele registro em vez de criar outro
 * (RF-F2.02).
 */
function CriarConta() {
  const router = useRouter();
  const convite = useSearchParams().get("convite") ?? undefined;

  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [dataNascimento, setDataNascimento] = useState("");
  const [cidadeDigitada, setCidadeDigitada] = useState("");
  const [cidade, setCidade] = useState<Cidade | null>(null);
  const [erros, setErros] = useState<Erros>({});
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!convite) return;
    const controle = new AbortController();

    buscarConvite(convite, controle.signal)
      .then((dados) => {
        if (!controle.signal.aborted && dados?.emailImportado) {
          setEmail(dados.emailImportado);
        }
      })
      .catch(() => {
        /* Sem o convite, o cadastro segue como se ela tivesse vindo sozinha. */
      });

    return () => controle.abort();
  }, [convite]);

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();

    const novos: Erros = {};
    if (!nome.trim()) {
      novos.nome = "Preencha seu nome completo.";
    }
    if (!emailValido(email)) {
      novos.email = ERRO_SEM_DOMINIO;
    }
    if (senha.length < SENHA_MINIMA) {
      novos.senha = `A senha precisa de pelo menos ${SENHA_MINIMA} caracteres.`;
    }
    if (!dataNascimento) {
      novos.dataNascimento = "Preencha sua data de nascimento.";
    }
    if (!cidade) {
      novos.cidade = "Escolha uma cidade da lista.";
    }

    const idade = dataNascimento ? checarIdade(dataNascimento) : null;
    if (idade === "data_invalida") {
      novos.dataNascimento = "Confira sua data de nascimento.";
    }

    setErros(novos);
    if (Object.keys(novos).length > 0 || !cidade) {
      return;
    }

    if (idade === "menor_de_13") {
      setEnviando(true);
      router.replace("/cadastro/idade-minima");
      return;
    }

    setEnviando(true);
    try {
      const resultado = await criarContaComEmail({
        nome: nome.trim(),
        email: email.trim(),
        senha,
        dataNascimento,
        cidadeId: cidade.id,
        convite,
      });

      if (resultado.ok) {
        router.push("/cadastro/termos");
        return;
      }

      if (resultado.motivo === "menor_de_13") {
        router.replace("/cadastro/idade-minima");
        return;
      }

      setEnviando(false);
      switch (resultado.motivo) {
        case "conta_existente":
          setErros({ email: "Já existe uma conta com esse e-mail." });
          break;
        case "email_invalido":
          setErros({ email: ERRO_SEM_DOMINIO });
          break;
        case "senha_curta":
          setErros({
            senha: `A senha precisa de pelo menos ${SENHA_MINIMA} caracteres.`,
          });
          break;
        case "cidade_invalida":
          setErros({ cidade: "Escolha uma cidade da lista." });
          break;
        default:
          setErros({ geral: ERRO_DE_REDE });
      }
    } catch {
      setEnviando(false);
      setErros({ geral: ERRO_DE_REDE });
    }
  }

  return (
    <div className={styles.page}>
      <AppHeader>
        <TextLink href="/entrar">Já tenho conta</TextLink>
      </AppHeader>

      <main className={styles.main}>
        <h1 className={styles.title}>Crie sua conta</h1>
        <p className={styles.lead}>
          Um cadastro para acompanhar todo o seu percurso.
        </p>

        <div className={styles.google}>
          <GoogleButton convite={convite} />
          <p className={styles.divisor}>
            <span>ou preencha seus dados</span>
          </p>
        </div>

        <form className={styles.form} onSubmit={enviar} noValidate>
          <Field
            label="Nome completo"
            autoComplete="name"
            value={nome}
            onChange={(evento) => setNome(evento.target.value)}
            error={erros.nome}
            required
          />
          <Field
            label="E-mail"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(evento) => setEmail(evento.target.value)}
            error={erros.email}
            required
          />
          <Field
            label="Senha"
            type="password"
            autoComplete="new-password"
            value={senha}
            onChange={(evento) => setSenha(evento.target.value)}
            error={erros.senha}
            required
          />
          <Field
            label="Data de nascimento"
            type="date"
            value={dataNascimento}
            onChange={(evento) => setDataNascimento(evento.target.value)}
            error={erros.dataNascimento}
            required
          />
          <CityField
            value={cidadeDigitada}
            onChange={setCidadeDigitada}
            onSelect={setCidade}
            error={erros.cidade}
          />

          {erros.geral && (
            <p className={styles.erro} role="alert">
              {erros.geral}
            </p>
          )}

          <Button type="submit" loading={enviando} className={styles.fullWidth}>
            Criar conta
          </Button>
        </form>
      </main>
    </div>
  );
}

/**
 * Envelope da A02. O `useSearchParams` lá dentro só pode rodar sob um limite
 * de Suspense; sem ele, a página inteira deixa de ser gerada estaticamente.
 */
export default function CriarContaPage() {
  return (
    <Suspense>
      <CriarConta />
    </Suspense>
  );
}
