"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/Button";
import { Field } from "@/components/Field";
import { GoogleButton } from "@/components/GoogleButton";
import {
  buscarCadastroPendente,
  buscarCidades,
  completarCadastro,
  descartarCadastro,
  urlInicioGoogle,
  type CadastroPendente,
  type Cidade,
} from "@/lib/cadastro";
import { temIdadeMinima } from "@/lib/idade";
import comum from "../cadastro.module.css";
import styles from "./page.module.css";

type Conta = CadastroPendente | "carregando" | "nenhuma";

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
  const [cidades, setCidades] = useState<Cidade[]>([]);
  const [erroData, setErroData] = useState<string>();
  const [erroCidade, setErroCidade] = useState<string>();
  const [erroGeral, setErroGeral] = useState<string>();
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    const controle = new AbortController();

    buscarCadastroPendente(controle.signal)
      .then((pendente) => setConta(pendente ?? "nenhuma"))
      .catch((erro: unknown) => {
        if (!controle.signal.aborted) {
          setConta("nenhuma");
          void erro;
        }
      });

    return () => controle.abort();
  }, []);

  // Busca os municípios enquanto ela digita, esperando ela parar um pouco.
  useEffect(() => {
    const busca = cidadeDigitada.trim();
    const controle = new AbortController();
    const espera = setTimeout(() => {
      if (busca.length < 2) {
        setCidades([]);
        return;
      }

      buscarCidades(busca, controle.signal)
        .then(setCidades)
        .catch(() => {
          /* Sem lista, o envio avisa que a cidade precisa vir da lista. */
        });
    }, 250);

    return () => {
      clearTimeout(espera);
      controle.abort();
    };
  }, [cidadeDigitada]);

  /** Descarta a sessão incompleta e manda para a A02c (RN-03). */
  async function recusarPorIdade() {
    await descartarCadastro();
    router.replace("/cadastro/idade-minima");
  }

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setErroData(undefined);
    setErroCidade(undefined);
    setErroGeral(undefined);

    if (!dataNascimento) {
      setErroData("Preencha sua data de nascimento.");
      return;
    }

    // Antes de mandar: se ela tem menos de 13, nada sai da tela (RN-03).
    if (!temIdadeMinima(dataNascimento)) {
      setEnviando(true);
      await recusarPorIdade();
      return;
    }

    const cidade = cidades.find((item) => item.nome === cidadeDigitada.trim());
    if (!cidade) {
      setErroCidade("Escolha uma cidade da lista.");
      return;
    }

    setEnviando(true);
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
      setErroGeral("Não deu pra concluir agora. Tente de novo.");
    }
  }

  async function usarOutraConta() {
    await descartarCadastro();
    window.location.href = urlInicioGoogle({ trocarConta: true });
  }

  if (conta === "carregando") {
    return (
      <div className={comum.screen}>
        <p className={comum.status}>Carregando...</p>
      </div>
    );
  }

  // Sem sessão do Google não há o que completar: ela recomeça por aqui mesmo.
  if (conta === "nenhuma") {
    return (
      <div className={comum.screen}>
        <h1 className={styles.title}>Vamos de novo?</h1>
        <p className={comum.lead}>
          Sua conta do Google não ficou conectada. Entre de novo para continuar
          o cadastro.
        </p>
        <div className={comum.spacer} />
        <div className={comum.actions}>
          <GoogleButton label="Entrar com o Google" />
        </div>
      </div>
    );
  }

  return (
    <form className={comum.screen} onSubmit={enviar} noValidate>
      <h1 className={styles.title}>Só mais um passo</h1>
      <p className={comum.lead}>
        Com sua data de nascimento e cidade, mostramos oportunidades certas para
        você.
      </p>

      <div className={styles.card}>
        <Avatar name={conta.nome} />
        <span className={styles.identidade}>
          <span className={styles.nome}>{conta.nome}</span>
          <span className={styles.email}>{conta.email}</span>
        </span>
        <Image
          src="/icons/google.svg"
          alt="Conta do Google"
          width={20}
          height={20}
          unoptimized
        />
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
        <Field
          label="Cidade"
          list="cidades-ibge"
          placeholder="Comece a digitar"
          autoComplete="off"
          value={cidadeDigitada}
          onChange={(evento) => setCidadeDigitada(evento.target.value)}
          error={erroCidade}
          required
        />
        <datalist id="cidades-ibge">
          {cidades.map((cidade) => (
            <option key={cidade.id} value={cidade.nome} />
          ))}
        </datalist>
      </div>

      {erroGeral && <p className={comum.error}>{erroGeral}</p>}

      <div className={comum.spacer} />

      <div className={comum.actions}>
        <Button type="submit" loading={enviando} className={comum.fullWidth}>
          Concluir cadastro
        </Button>
        <button
          type="button"
          className={styles.outraConta}
          onClick={usarOutraConta}
        >
          Usar outra conta
        </button>
      </div>
    </form>
  );
}
