"use client";

// A06·4b · Evento: o detalhe de um evento do filé, nas versões "Próxima aventura", "Inscrita",
// "Você foi?" e "Concluído". Atende RF-F10.13, RF-F10.14, RF-F10.15, RF-F10.23 e RN-19, RN-36
// (issues #178, #179, #182, #183, #190, #191, #194 e #195), e o lembrete RF-F4.12 (#186 e #187).
// Lê e muda o evento pelas rotas de /api/events (#181, #185, #189, #193 e #197).

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/Button";
import { Icon } from "@/components/Icon";
import { UndoTimerToast } from "@/components/UndoTimerToast";
import {
  markDidNotGo,
  markSignedUp,
  markWent,
  rememberDidNotGo,
  rememberLeftToSignUp,
  removeEvent,
  setReminder,
  SIGNED_UP_PARAM,
  signUpCheckPath,
  takeLeftToSignUp,
  undoSignUp,
  wentPath,
  type EventDetail,
  type EventFailure,
} from "@/lib/evento";
import shared from "../../[id]/atividade.module.css";
import styles from "./evento.module.css";
import { EventView, type EventViewProps } from "./EventView";
import { redirectFor, useEvent } from "./useEvent";

const FILE_PATH = "/file";

const SEND_ERROR = "Não deu pra enviar. Tente de novo.";

export default function EventPage() {
  return (
    <div className={shared.page}>
      <header className={shared.header}>
        <Link href={FILE_PATH} className={shared.back}>
          <Icon name="left" size={18} />
          Seu filé
        </Link>
      </header>

      <div className={shared.scroll}>
        <main className={`${shared.main} ${styles.main}`}>
          {/* O id vem da URL; o Suspense deixa o resto da tela pronto antes dele. */}
          <Suspense fallback={<Loading />}>
            <EventLoader />
          </Suspense>
        </main>
      </div>
    </div>
  );
}

function Loading() {
  return (
    <p className={shared.status} aria-live="polite">
      Carregando…
    </p>
  );
}

function EventLoader() {
  const { id } = useParams<{ id: string }>();
  const { result, redirecting, update, retry } = useEvent(id);

  // Sem sessão ou sem o aceite dos termos, o hook já leva para a tela certa.
  if (!result || redirecting) return <Loading />;
  if (result.ok) return <Detail event={result.data} onChange={update} onRefresh={retry} />;
  if (result.reason === "not_found") return <p className={shared.status}>Esse evento não está no seu filé.</p>;
  return (
    <div className={styles.loadFailed}>
      <p className={shared.status} role="alert">
        Não deu pra carregar o evento.
      </p>
      <Button variant="secondary" size="sm" onClick={retry}>
        Tentar de novo
      </Button>
    </div>
  );
}

type DetailProps = {
  event: EventDetail;
  onChange: (event: EventDetail) => void;
  /** Busca o evento de novo, quando a rota diz que ele mudou de estado. */
  onRefresh: () => void;
};

type Toast = { status: "ready" | "undoing" | "error" };

type Saving = NonNullable<EventViewProps["saving"]>;

function Detail({ event, onChange, onRefresh }: DetailProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [saving, setSaving] = useState<Saving | null>(null);
  const [error, setError] = useState<string | null>(null);
  // O aviso "Você tá inscrita!" chega aberto quando ela vem da A09 com "Sim, me inscrevi".
  const cameSignedUp = searchParams.has(SIGNED_UP_PARAM) && event.status === "in_progress";
  const [toast, setToast] = useState<Toast | null>(() => (cameSignedUp ? { status: "ready" } : null));

  // Na mesma aba, o Next reaproveita esta tela já montada ao voltar da A09, e o useState acima
  // não roda de novo. Então o aviso também abre quando isso muda com a tela já montada.
  const [wasSignedUp, setWasSignedUp] = useState(cameSignedUp);
  if (cameSignedUp !== wasSignedUp) {
    setWasSignedUp(cameSignedUp);
    if (cameSignedUp) setToast({ status: "ready" });
  }

  // Tira o parâmetro do endereço, para o aviso não voltar ao recarregar. Espera o evento
  // recarregado sair de "Próxima aventura", senão o aviso acima não chega a abrir.
  useEffect(() => {
    if (searchParams.has(SIGNED_UP_PARAM) && event.status !== "next") {
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, [searchParams, event.status]);

  // Quando ela volta do site de inscrição (ou reabre a NISE), a A09 pergunta se deu certo.
  // Só para um evento que ainda é "Próxima aventura" (#182).
  useEffect(() => {
    if (event.status !== "next") return;
    const askIfBack = () => {
      if (document.visibilityState === "visible" && takeLeftToSignUp(event.id)) {
        router.push(signUpCheckPath(event.id));
      }
    };
    askIfBack();
    document.addEventListener("visibilitychange", askIfBack);
    return () => document.removeEventListener("visibilitychange", askIfBack);
  }, [event.id, event.status, router]);

  // O que fazer quando a rota recusa: sem sessão ou sem os termos, vai para a tela certa; se o
  // evento mudou de estado (409) ou saiu do filé (404), a tela mostra o que ele é agora.
  // Devolve true quando já tratou, e false quando só resta avisar que não deu.
  function handleRefusal(reason: EventFailure): boolean {
    const redirect = redirectFor(reason);
    if (redirect) {
      router.replace(redirect);
      return true;
    }
    if (reason === "conflict" || reason === "not_found") {
      onRefresh();
      return true;
    }
    return false;
  }

  async function mark() {
    setSaving("mark");
    setError(null);
    const result = await markSignedUp(event.id);
    if (result.ok) {
      onChange(result.data);
      setToast({ status: "ready" });
      // Os botões mudam com a versão da tela; o foco volta ao título para não se perder.
      titleRef.current?.focus();
    } else if (!handleRefusal(result.reason)) {
      setError(SEND_ERROR);
    }
    setSaving(null);
  }

  // Leva ao filé, como sugerido na #182 (a confirmar com o design).
  async function remove() {
    setSaving("remove");
    setError(null);
    const result = await removeEvent(event.id);
    if (result.ok) {
      router.push(FILE_PATH);
      return;
    }
    if (!handleRefusal(result.reason)) setError(SEND_ERROR);
    setSaving(null);
  }

  // "Fui!": conclui e abre a celebração (A06·5). Sem "Desfazer": o evento já passou (#190).
  async function went() {
    setSaving("went");
    setError(null);
    const result = await markWent(event.id);
    if (result.ok) {
      router.push(wentPath(event.id));
      return;
    }
    if (!handleRefusal(result.reason)) setError(SEND_ERROR);
    setSaving(null);
  }

  // "Não deu": tira do filé e volta para ele, onde o aviso com "Desfazer" aparece (#190).
  async function didNotGo() {
    setSaving("didNotGo");
    setError(null);
    const result = await markDidNotGo(event.id);
    if (result.ok) {
      rememberDidNotGo(event);
      router.push(FILE_PATH);
      return;
    }
    if (!handleRefusal(result.reason)) setError(SEND_ERROR);
    setSaving(null);
  }

  // Uma ação de cada vez: com duas no ar, a resposta que chega por último sobrescreve a outra
  // (ex.: o lembrete salvo depois do "Desfazer" voltaria a tela para "Inscrita").
  async function changeReminder(on: boolean) {
    setSaving("reminder");
    setError(null);
    const result = await setReminder(event.id, on);
    setSaving(null);
    if (result.ok) {
      onChange(result.data);
      return;
    }
    // Rejeitar devolve a caixa a como estava e mostra o aviso do lembrete (EventView).
    if (!handleRefusal(result.reason)) throw new Error("reminder");
  }

  async function undo() {
    if (toast?.status === "undoing" || saving) return;
    setToast({ status: "undoing" });
    const result = await undoSignUp(event.id);
    if (result.ok) {
      onChange(result.data);
      setToast(null);
      titleRef.current?.focus();
    } else if (handleRefusal(result.reason)) {
      setToast(null);
    } else {
      setToast({ status: "error" });
    }
  }

  const closeToast = useCallback(() => setToast(null), []);

  return (
    <>
      <EventView
        event={event}
        titleRef={titleRef}
        onOpenSignUp={() => rememberLeftToSignUp(event.id)}
        onMarkSignedUp={mark}
        onRemove={remove}
        onReminderChange={changeReminder}
        onWent={went}
        onDidNotGo={didNotGo}
        saving={saving ?? (toast?.status === "undoing" ? "undo" : null)}
        error={error}
      />
      {toast && (
        <UndoTimerToast
          status={toast.status}
          busy={saving !== null}
          errorText="Não deu pra desfazer."
          onUndo={undo}
          onTimeout={closeToast}
        >
          <strong>Você tá inscrita!</strong> Agora é só esperar o dia.
        </UndoTimerToast>
      )}
    </>
  );
}
