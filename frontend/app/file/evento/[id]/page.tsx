"use client";

// A06·4b · Evento: o detalhe de um evento do filé, nas versões "Próxima aventura" e "Inscrita".
// Atende RF-F10.13, RF-F10.14, RF-F10.15 e RN-19, RN-36 (issues #178, #179, #182 e #183).
// Usa os dados de teste de lib/evento.ts.

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { UndoTimerToast } from "@/components/UndoTimerToast";
import {
  getEvent,
  markSignedUp,
  rememberLeftToSignUp,
  removeEvent,
  SIGNED_UP_PARAM,
  signUpCheckPath,
  takeLeftToSignUp,
  undoSignUp,
  type EventDetail,
} from "@/lib/evento";
import shared from "../../[id]/atividade.module.css";
import styles from "./evento.module.css";
import { EventView } from "./EventView";

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
  // undefined: carregando. null: não está no filé.
  const [event, setEvent] = useState<EventDetail | null | undefined>(undefined);

  useEffect(() => {
    let current = true;
    getEvent(id).then((result) => {
      if (current) setEvent(result);
    });
    return () => {
      current = false;
    };
  }, [id]);

  if (event === undefined) return <Loading />;
  if (event === null) return <p className={shared.status}>Esse evento não está no seu filé.</p>;
  return <Detail event={event} onChange={setEvent} />;
}

type DetailProps = {
  event: EventDetail;
  onChange: (event: EventDetail) => void;
};

type Toast = { status: "ready" | "undoing" | "error" };

function Detail({ event, onChange }: DetailProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [saving, setSaving] = useState<"mark" | "remove" | null>(null);
  const [error, setError] = useState<string | null>(null);
  // O aviso "Você tá inscrita!" chega aberto quando ela vem da A09 com "Sim, me inscrevi".
  const [toast, setToast] = useState<Toast | null>(() =>
    searchParams.has(SIGNED_UP_PARAM) && event.status === "in_progress" ? { status: "ready" } : null,
  );

  // Tira o parâmetro do endereço, para o aviso não voltar ao recarregar.
  useEffect(() => {
    if (searchParams.has(SIGNED_UP_PARAM)) {
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, [searchParams]);

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

  async function mark() {
    setSaving("mark");
    setError(null);
    try {
      onChange(await markSignedUp(event.id));
      setToast({ status: "ready" });
      // Os botões mudam com a versão da tela; o foco volta ao título para não se perder.
      titleRef.current?.focus();
    } catch {
      setError(SEND_ERROR);
    } finally {
      setSaving(null);
    }
  }

  // Leva ao filé, como sugerido na #182 (a confirmar com o design).
  async function remove() {
    setSaving("remove");
    setError(null);
    try {
      await removeEvent(event.id);
      router.push(FILE_PATH);
    } catch {
      setError(SEND_ERROR);
      setSaving(null);
    }
  }

  async function undo() {
    if (toast?.status === "undoing") return;
    setToast({ status: "undoing" });
    try {
      onChange(await undoSignUp(event.id));
      setToast(null);
      titleRef.current?.focus();
    } catch {
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
        saving={saving}
        error={error}
      />
      {toast && (
        <UndoTimerToast
          status={toast.status}
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
