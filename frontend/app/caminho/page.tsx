"use client";

// A18 · Como está seu caminho? Questionário de acompanhamento, igual para todas
// (D-60), 3, 6, 12 e 18 meses depois da conta (RN-02). Atende RF-F4.13,
// RF-F4.07, RF-F4.08 e RF-S2.15 (issue #293). A pergunta 3, do curso, vem na
// #294.

import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/Button";
import { Chip, ChipGroup } from "@/components/Chip";
import { Loading } from "@/components/Loading";
import { TextArea } from "@/components/TextArea";
import {
  type FollowupIn,
  type FollowupProblem,
  type FollowupScreen,
  loadFollowup,
  sendFollowup,
} from "@/lib/caminho";
import { SIGNUP_PATHS } from "@/lib/signup";
import { WITHOUT_SESSION } from "@/lib/signup-api";
import styles from "./page.module.css";

// Para onde ela vai depois de enviar ou de "Agora não". A agenda (A14, #295)
// ainda não existe; até lá, o filé.
const NEXT_PATH = "/file";

// "Nada disso ainda" não vem junto com as outras escolhas da pergunta 4.
const NONE_YET: Activity = "none_yet";

// Os códigos das opções chegam como string (OptionOut.code), mas vêm do mesmo
// enum do servidor; por isso o `as` nos pontos em que eles entram nas escolhas.
type ComputingView = NonNullable<FollowupIn["computingView"]>;
type FutureSelf = NonNullable<FollowupIn["futureSelf"]>;
type Activity = FollowupIn["activities"][number];
type Help = FollowupIn["helps"][number];

export default function FollowupPage() {
  const router = useRouter();
  const [screen, setScreen] = useState<FollowupScreen | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  // Muda a cada nova busca, para o efeito abaixo rodar de novo.
  const [attempt, setAttempt] = useState(0);
  const [computingView, setComputingView] = useState<ComputingView | null>(null);
  const [futureSelf, setFutureSelf] = useState<FutureSelf | null>(null);
  const [activities, setActivities] = useState<FollowupIn["activities"]>([]);
  const [helps, setHelps] = useState<FollowupIn["helps"]>([]);
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function leaveFor(reason: FollowupProblem) {
    if (reason === "terms_not_accepted") {
      router.replace(SIGNUP_PATHS.terms);
    } else if (reason === "failed") {
      setLoadFailed(true);
    } else {
      router.replace(WITHOUT_SESSION[reason]);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    loadFollowup(controller.signal).then(
      (result) => {
        if (result.ok) {
          setScreen(result.screen);
        } else if (result.reason === "terms_not_accepted") {
          router.replace(SIGNUP_PATHS.terms);
        } else if (result.reason === "failed") {
          setLoadFailed(true);
        } else {
          router.replace(WITHOUT_SESSION[result.reason]);
        }
      },
      () => {
        // Sem rede. Se ela só saiu da página, não há o que mostrar.
        if (!controller.signal.aborted) setLoadFailed(true);
      },
    );
    return () => controller.abort();
  }, [attempt, router]);

  // Ao navegar, o Next esconde a página em vez de desmontá-la (Activity, com
  // cacheComponents) e, se ela voltar, mostra o mesmo estado. Sem isto, os
  // botões voltariam presos em "Enviando…" depois de um envio que deu certo.
  useLayoutEffect(() => {
    return () => setSaving(false);
  }, []);

  function retryLoad() {
    setLoadFailed(false);
    setAttempt((current) => current + 1);
  }

  function toggleActivity(code: Activity) {
    setActivities((chosen) => {
      if (chosen.includes(code)) return chosen.filter((c) => c !== code);
      if (code === NONE_YET) return [NONE_YET];
      return [...chosen.filter((c) => c !== NONE_YET), code];
    });
  }

  function toggleHelp(code: Help) {
    setHelps((chosen) =>
      chosen.includes(code)
        ? chosen.filter((c) => c !== code)
        : [...chosen, code],
    );
  }

  const answeredSomething =
    computingView !== null ||
    futureSelf !== null ||
    activities.length > 0 ||
    helps.length > 0 ||
    comment.trim() !== "";

  async function handleSubmit() {
    const current = screen?.current;
    if (!current || !answeredSomething) return;
    setSaving(true);
    setError(null);

    // Os códigos vêm das listas do próprio back (GET /api/followup/options).
    const body: FollowupIn = {
      round: current.round,
      computingView,
      futureSelf,
      activities,
      helps,
      comment: comment.trim() || null,
    };

    const result = await sendFollowup(body).catch(() => null);

    // Já respondida (em outra aba, por exemplo): ela segue como se tivesse enviado.
    if (result?.ok || result?.reason === "already_answered") {
      router.replace(NEXT_PATH);
      return;
    }

    setSaving(false);

    if (result?.reason === "no_open_round") {
      // A rodada fechou enquanto a tela estava aberta (RN-39).
      setScreen({ ...screen, current: null });
      return;
    }

    if (result && result.reason !== "failed") {
      leaveFor(result.reason);
      return;
    }

    // RF-S2.15: o aviso fica no formulário, e as respostas continuam na tela.
    setError("Não deu pra enviar. Tente de novo.");
  }

  return (
    <div className={styles.page}>
      <AppHeader />
      <main className={styles.main}>{renderContent()}</main>
    </div>
  );

  function renderContent() {
    // Nada aparece antes dos dados chegarem: quem está sem sessão vai para
    // outra página sem ver a A18 piscar.
    if (!screen) {
      return loadFailed ? (
        <div role="alert" className={styles.screen}>
          <p className={styles.error}>Não deu pra carregar o questionário.</p>
          <div className={styles.actions}>
            <Button
              variant="secondary"
              className={styles.fullWidth}
              onClick={retryLoad}
            >
              Tentar de novo
            </Button>
            <button
              type="button"
              className={styles.skip}
              onClick={() => router.push(NEXT_PATH)}
            >
              Agora não
            </button>
          </div>
        </div>
      ) : (
        <Loading />
      );
    }

    const { current, options } = screen;

    // Sem rodada aberta hoje: ainda não chegou, ou os 30 dias passaram (RN-39).
    if (!current || current.answered) {
      return (
        <div className={styles.screen}>
          <h1 className={styles.title}>Como está seu caminho?</h1>
          <p className={styles.lead}>
            {current?.answered
              ? "Você já respondeu este questionário. Valeu por contar pra gente!"
              : "Não tem questionário aberto agora. A gente avisa quando chegar a hora."}
          </p>
          <div className={styles.actions}>
            <Button
              className={styles.fullWidth}
              onClick={() => router.push(NEXT_PATH)}
            >
              Voltar
            </Button>
          </div>
        </div>
      );
    }

    return (
      <div className={styles.screen}>
        <h1 className={styles.title}>
          {current.firstName
            ? `Como está seu caminho, ${current.firstName}?`
            : "Como está seu caminho?"}
        </h1>
        <p className={styles.lead}>5 perguntas. Responder é opcional, tá?</p>
        {/* D-61: os grupos só veem as respostas somadas, nunca as dela sozinhas. */}
        <p className={styles.notice}>
          Os grupos de que você participou só veem as respostas de todas juntas,
          nunca as suas sozinhas.
        </p>

        <ChipGroup label="Hoje, computação pra você é…">
          {options.computingViews.map((option) => (
            <Chip
              key={option.code}
              size="lg"
              selected={computingView === option.code}
              onClick={() =>
                setComputingView((chosen) =>
                  chosen === option.code ? null : (option.code as ComputingView),
                )
              }
            >
              {option.label}
            </Chip>
          ))}
        </ChipGroup>

        <ChipGroup label="Daqui a uns anos, você se vê estudando ou trabalhando com computação?">
          {options.futureSelves.map((option) => (
            <Chip
              key={option.code}
              size="lg"
              selected={futureSelf === option.code}
              onClick={() =>
                setFutureSelf((chosen) =>
                  chosen === option.code ? null : (option.code as FutureSelf),
                )
              }
            >
              {option.label}
            </Chip>
          ))}
        </ChipGroup>

        <ChipGroup label="Desde a última vez, você… (pode marcar mais de uma)">
          {options.activities.map((option) => (
            <Chip
              key={option.code}
              size="lg"
              selected={activities.includes(option.code as Activity)}
              onClick={() => toggleActivity(option.code as Activity)}
            >
              {option.label}
            </Chip>
          ))}
        </ChipGroup>

        <ChipGroup label="O que te ajudaria agora? (pode marcar mais de uma)">
          {options.helps.map((option) => (
            <Chip
              key={option.code}
              size="lg"
              selected={helps.includes(option.code as Help)}
              onClick={() => toggleHelp(option.code as Help)}
            >
              {option.label}
            </Chip>
          ))}
        </ChipGroup>

        <TextArea
          label="Quer contar mais?"
          optional
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          maxLength={500}
        />

        <div className={styles.actions}>
          <Button
            className={styles.fullWidth}
            disabled={!answeredSomething}
            loading={saving}
            onClick={handleSubmit}
          >
            Enviar respostas
          </Button>
          {/* "Agora não" não salva nada; o questionário continua pendente até fechar (RN-39). */}
          <button
            type="button"
            className={styles.skip}
            disabled={saving}
            onClick={() => router.push(NEXT_PATH)}
          >
            Agora não
          </button>
        </div>
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
      </div>
    );
  }
}
