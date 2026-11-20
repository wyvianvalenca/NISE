"use client";

// A19 · É você na lista? (M7): ela diz se é ela na lista oficial e se já se matriculou.
// Atende RF-F31.04, RN-21 e RN-22 (issue #271). Chega pelo item da agenda (#266).

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/Button";
import { Icon } from "@/components/Icon";
import { LoadFailed } from "@/components/LoadFailed";
import { TextLink } from "@/components/TextLink";
import {
  accessPath,
  answerMatch,
  firstName,
  getMyMatches,
  type ListMatch,
} from "@/lib/lista-oficial";
import styles from "./page.module.css";

const AGENDA_PATH = "/agenda";
const FILE_PATH = "/file";

export default function IsItYouPage() {
  const router = useRouter();
  // undefined: carregando. null: não há pergunta aberta. "error": a busca falhou.
  const [match, setMatch] = useState<ListMatch | null | undefined | "error">(undefined);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    getMyMatches(controller.signal)
      .then((result) => {
        if (result.ok) {
          // Com mais de um indício, mostra o mais antigo; os outros continuam na agenda.
          setMatch(result.matches[0] ?? null);
        } else if (result.reason === "failed") {
          setMatch("error");
        } else {
          // Login vencido ou termos novos: "Tentar novamente" não resolveria.
          router.replace(accessPath(result.reason));
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setMatch("error");
      });
    return () => controller.abort();
  }, [attempt, router]);

  if (match === "error") {
    return (
      <LoadFailed
        onRetry={() => {
          setMatch(undefined);
          setAttempt((value) => value + 1);
        }}
      />
    );
  }

  return (
    <div className={styles.page}>
      <AppHeader />
      <main className={styles.main}>
        {match === undefined && (
          <p className={styles.status} aria-live="polite">
            Carregando…
          </p>
        )}
        {match === null && <Gone />}
        {match && <Question match={match} />}
      </main>
    </div>
  );
}

/** Ela já respondeu, ou o indício venceu ou foi apagado com a tela aberta. */
function Gone() {
  const titleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  return (
    <>
      <h1 ref={titleRef} tabIndex={-1} className={styles.title}>
        Essa pergunta não está mais aqui
      </h1>
      <p className={styles.lead}>Pode ser que você já tenha respondido. Não precisa fazer mais nada.</p>
      <TextLink href={AGENDA_PATH} back className={styles.inkLink}>
        Voltar pra agenda
      </TextLink>
    </>
  );
}

type IsMe = "yes" | "no";
type Enrolled = "yes" | "no";

function Question({ match }: { match: ListMatch }) {
  const router = useRouter();
  const [isMe, setIsMe] = useState<IsMe | null>(null);
  const [enrolled, setEnrolled] = useState<Enrolled | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(false);
  const [gone, setGone] = useState(false);

  // "Enviar" só funciona com tudo que se aplica respondido: com "Não sou eu", a matrícula não importa.
  const complete = isMe === "no" || (isMe === "yes" && enrolled !== null);

  async function send(event: FormEvent) {
    event.preventDefault();
    if (!complete) return;

    setSending(true);
    setError(false);
    const result = await answerMatch(
      match.id,
      isMe === "yes" ? { isMe: true, enrolled: enrolled === "yes" } : { isMe: false },
    );

    if (result.ok) {
      router.push(FILE_PATH);
      return;
    }
    if (result.reason !== "gone" && result.reason !== "failed") {
      router.replace(accessPath(result.reason));
      return;
    }
    setSending(false);
    if (result.reason === "gone") setGone(true);
    else setError(true);
  }

  if (gone) return <Gone />;

  return (
    <form className={styles.form} onSubmit={send} noValidate>
      <h1 className={styles.title}>Achamos seu nome numa lista, {firstName(match.name)}!</h1>
      <p className={styles.lead}>
        Saiu a lista de aprovados da {match.institution} e um nome igual ao seu aparece nela.
      </p>

      <section className={styles.listCard} aria-label="Lista oficial">
        <p className={styles.listName}>{match.name.toLocaleUpperCase("pt-BR")}</p>
        <p>
          {match.course} · {match.institution}
        </p>
        <p>
          {match.selection_process} · {match.call}
        </p>
        {match.list_url && (
          <a
            href={match.list_url}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.listLink}
          >
            Ver lista oficial
            <Icon name="chevron-right" size={14} />
            <span className={styles.srOnly}> (abre em outra aba)</span>
          </a>
        )}
      </section>

      <fieldset className={styles.question}>
        <legend className={styles.legend}>1. É você?</legend>
        <div className={styles.cards}>
          <Choice name="is-me" value="yes" checked={isMe === "yes"} onChange={setIsMe} shape="card">
            Sou eu
          </Choice>
          <Choice name="is-me" value="no" checked={isMe === "no"} onChange={setIsMe} shape="card">
            Não sou eu
          </Choice>
        </div>
      </fieldset>

      {/* Com "Não sou eu" a pergunta da matrícula não faz sentido e some (#271). */}
      {isMe === "yes" && (
        <fieldset className={styles.question}>
          <legend className={styles.legend}>2. Você já fez a matrícula?</legend>
          <div className={styles.pills}>
            <Choice name="enrolled" value="yes" checked={enrolled === "yes"} onChange={setEnrolled} shape="pill">
              Já me matriculei
            </Choice>
            <Choice name="enrolled" value="no" checked={enrolled === "no"} onChange={setEnrolled} shape="pill">
              Ainda não
            </Choice>
          </div>
        </fieldset>
      )}

      <p className={styles.note}>
        Se for você, a coordenação dos grupos de que você participou fica sabendo que você entrou
        na área. Se não for, apagamos essa informação.
      </p>

      <div className={styles.actions}>
        <Button type="submit" className={styles.fullWidth} disabled={!complete} loading={sending}>
          Enviar
        </Button>
        {error && (
          <p className={styles.error} role="alert">
            Não deu pra enviar. Tente de novo.
          </p>
        )}
        {/* "Agora não" não grava nada; o item continua na agenda. */}
        <TextLink href={AGENDA_PATH} className={`${styles.inkLink} ${styles.later}`}>
          Agora não
        </TextLink>
      </div>
    </form>
  );
}

type ChoiceProps<V extends string> = {
  name: string;
  value: V;
  checked: boolean;
  onChange: (value: V) => void;
  /** "card": opção larga ("Sou eu"). "pill": pílula ("Já me matriculei"). */
  shape: "card" | "pill";
  children: string;
};

/** Rádio nativo com cara de cartão ou pílula: as setas do teclado trocam a escolha. */
function Choice<V extends string>({ name, value, checked, onChange, shape, children }: ChoiceProps<V>) {
  return (
    <label className={`${styles.choice} ${styles[shape]}`}>
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={() => onChange(value)}
        className={styles.radio}
      />
      {children}
    </label>
  );
}
