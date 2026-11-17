"use client";

// A06·4b · Evento: o detalhe de um evento do filé, nas versões "Próxima aventura", "Inscrita",
// "Você foi?" e "Concluído". Atende RF-F10.13, RF-F10.14, RF-F10.15, RF-F10.23 e RN-19, RN-36
// (issues #178, #179, #182, #183, #190 e #191).
// Usa os dados de teste de lib/evento.ts.

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { UndoTimerToast } from "@/components/UndoTimerToast";
import {
  getEvent,
  markDidNotGo,
  markSignedUp,
  markWent,
  rememberDidNotGo,
  rememberLeftToSignUp,
  removeEvent,
  SIGNED_UP_PARAM,
  signUpCheckPath,
  takeLeftToSignUp,
  undoSignUp,
  wentPath,
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
  const [saving, setSaving] = useState<"mark" | "remove" | "went" | "didNotGo" | null>(null);
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

  // "Fui!": conclui e abre a celebração (A06·5). Sem "Desfazer": o evento já passou (#190).
  async function went() {
    setSaving("went");
    setError(null);
    try {
      await markWent(event.id);
      router.push(wentPath(event.id));
    } catch {
      setError(SEND_ERROR);
      setSaving(null);
    }
  }

  // "Não deu": tira do filé e volta para ele, onde o aviso com "Desfazer" aparece (#190).
  async function didNotGo() {
    setSaving("didNotGo");
    setError(null);
    try {
      await markDidNotGo(event.id);
      rememberDidNotGo(event);
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
        onWent={went}
        onDidNotGo={didNotGo}
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
