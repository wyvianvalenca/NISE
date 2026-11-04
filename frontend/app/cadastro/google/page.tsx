"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { AccountCard } from "@/components/AccountCard";
import { Button } from "@/components/Button";
import { CityField } from "@/components/CityField";
import { Field } from "@/components/Field";
import { GoogleButton } from "@/components/GoogleButton";
import {
  buscarCadastroPendente,
  completarCadastro,
  descartarCadastro,
  urlInicioGoogle,
  type CadastroPendente,
  type Cidade,
} from "@/lib/cadastro";
import { checarIdade } from "@/lib/idade";
import styles from "./page.module.css";

type Conta = CadastroPendente | "carregando" | "nenhuma";

const ERRO_DE_REDE = "Não deu pra concluir agora. Tente de novo.";

/**
 * A02b "Só mais um passo" (#52): depois de autorizar o Google, ela confirma
 * data de nascimento e cidade. Nome e e-mail já vêm do Google e não se editam
 * aqui.
 */
export default function ContaGoogle() {
  const router = useRouter();
  const [conta, setConta] = useState<Conta>("carregando");
  const [dataNascimento, setDataNascimento] = useState("");
  const [cidadeDigitada, setCidadeDigitada] = useState("");
  const [cidade, setCidade] = useState<Cidade | null>(null);
  const [erroData, setErroData] = useState<string>();
  const [erroCidade, setErroCidade] = useState<string>();
  const [erroGeral, setErroGeral] = useState<string>();
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    const controle = new AbortController();

    buscarCadastroPendente(controle.signal)
      .then((pendente) => setConta(pendente ?? "nenhuma"))
      .catch(() => {
        if (!controle.signal.aborted) {
          setConta("nenhuma");
        }
      });

    return () => controle.abort();
  }, []);

  /** Descarta a sessão incompleta e manda para a A02c (RN-03). */
  const recusarPorIdade = useCallback(async () => {
    try {
      await descartarCadastro();
    } catch {
      // Mesmo sem conseguir avisar o servidor, ela não pode seguir adiante.
    }
    router.replace("/cadastro/idade-minima");
  }, [router]);

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setErroData(undefined);
    setErroCidade(undefined);
    setErroGeral(undefined);

    if (!dataNascimento) {
      setErroData("Preencha sua data de nascimento.");
      return;
    }

    const idade = checarIdade(dataNascimento);

    // Data impossível (ano trocado, 30/02) não é o mesmo que ser nova demais:
    // aqui ela corrige o campo, sem perder a sessão do Google.
    if (idade === "data_invalida") {
      setErroData("Confira sua data de nascimento.");
      return;
    }

    // Menos de 13: nada do que ela preencheu sai da tela (RN-03).
    if (idade === "menor_de_13") {
      setEnviando(true);
      await recusarPorIdade();
      return;
    }

    if (!cidade) {
      setErroCidade("Escolha uma cidade da lista.");
      return;
    }

    setEnviando(true);
    try {
      const resultado = await completarCadastro({
        dataNascimento,
        cidadeId: cidade.id,
      });

      if (resultado.ok) {
        router.push("/cadastro/termos");
        return;
      }

      if (resultado.motivo === "menor_de_13") {
        await recusarPorIdade();
        return;
      }

      setEnviando(false);
      if (resultado.motivo === "cidade_invalida") {
        setErroCidade("Escolha uma cidade da lista.");
      } else {
        setErroGeral(ERRO_DE_REDE);
      }
    } catch {
      // Internet caiu no meio: libera o botão e explica, em vez de travar.
      setEnviando(false);
      setErroGeral(ERRO_DE_REDE);
    }
  }

  async function usarOutraConta() {
    setErroGeral(undefined);
    setEnviando(true);
    try {
      await descartarCadastro();
    } catch {
      setEnviando(false);
      setErroGeral(ERRO_DE_REDE);
      return;
    }
    window.location.href = urlInicioGoogle({ trocarConta: true });
  }

  if (conta === "carregando") {
    return (
      <div className={styles.screen}>
        <p className={styles.status}>Carregando...</p>
      </div>
    );
  }

  // Sem sessão do Google não há o que completar: ela recomeça por aqui mesmo.
  if (conta === "nenhuma") {
    return (
      <div className={styles.screen}>
        <h1 className={styles.title}>Vamos de novo?</h1>
        <p className={styles.lead}>
          Sua conta do Google não ficou conectada. Entre de novo para continuar
          o cadastro.
        </p>
        <div className={styles.spacer} />
        <div className={styles.actions}>
          <GoogleButton label="Entrar com o Google" />
        </div>
      </div>
    );
  }

  return (
    <form className={styles.screen} onSubmit={enviar} noValidate>
      <h1 className={styles.title}>Só mais um passo</h1>
      <p className={styles.lead}>
        Com sua data de nascimento e cidade, mostramos oportunidades certas para
        você.
      </p>

      <div className={styles.card}>
        <AccountCard name={conta.nome} email={conta.email} provider="google" />
      </div>

      <div className={styles.campos}>
        <Field
          label="Data de nascimento"
          type="date"
          value={dataNascimento}
          onChange={(evento) => setDataNascimento(evento.target.value)}
          error={erroData}
          required
        />
        <CityField
          value={cidadeDigitada}
          onChange={setCidadeDigitada}
          onSelect={setCidade}
          error={erroCidade}
        />
      </div>

      {erroGeral && (
        <p className={styles.erro} role="alert">
          {erroGeral}
        </p>
      )}

      <div className={styles.spacer} />

      <div className={styles.actions}>
        <Button type="submit" loading={enviando} className={styles.fullWidth}>
          Concluir cadastro
        </Button>
        <button
          type="button"
          className={styles.outraConta}
          disabled={enviando}
          onClick={usarOutraConta}
        >
          Usar outra conta
        </button>
      </div>
    </form>
  );
}
