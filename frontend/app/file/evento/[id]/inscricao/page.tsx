"use client";

// A09 · Conseguiu se inscrever? Abre quando ela volta do site de inscrição de um evento.
// Atende RF-F10.14, RF-S2.15 e RN-19 (issues #182 e #183). Lê e marca pelas rotas de /api/events.

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Button, LinkButton } from "@/components/Button";
import { EventCard } from "@/components/EventCard";
import { Icon } from "@/components/Icon";
import { Notice } from "@/components/Notice";
import {
  daysLeftText,
  deadlineText,
  eventPath,
  formatEventDays,
  markSignedUp,
  SIGNED_UP_PARAM,
  typeIcon,
  type EventDetail,
} from "@/lib/evento";
import shared from "../../../[id]/atividade.module.css";
import eventStyles from "../evento.module.css";
import styles from "./inscricao.module.css";
import { redirectFor, useEvent } from "../useEvent";

export default function SignUpCheckPage() {
  return (
    <div className={shared.page}>
      <Suspense fallback={<Loading />}>
        <SignUpCheckLoader />
      </Suspense>
    </div>
  );
}

function Loading() {
  return (
    <p className={`${shared.status} ${styles.loading}`} aria-live="polite">
      Carregando…
    </p>
  );
}

function SignUpCheckLoader() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { result, redirecting } = useEvent(id);
  const event = result?.ok ? result.data : result ? null : undefined;

  // A pergunta só faz sentido para um evento que ainda é "Próxima aventura".
  const answered = event && event.status !== "next";
  useEffect(() => {
    if (answered) router.replace(eventPath(id));
  }, [answered, id, router]);

  return (
    <>
      <header className={shared.header}>
        <Link href={eventPath(id)} className={shared.back}>
          <Icon name="left" size={18} />
          Evento
        </Link>
      </header>
      <div className={shared.scroll}>
        {event === undefined || answered || redirecting ? (
          <Loading />
        ) : event === null ? (
          <p className={`${shared.status} ${styles.loading}`}>
            {result?.ok === false && result.reason === "not_found"
              ? "Esse evento não está no seu filé."
              : "Não deu pra carregar o evento."}
          </p>
        ) : (
          <SignUpCheck event={event} />
        )}
      </div>
    </>
  );
}

function SignUpCheck({ event }: { event: EventDetail }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  const site = event.group ? `das ${event.group}` : "dos organizadores";
  const deadline = deadlineText(event, true);
  const deadlineSub =
    event.registrationsOpen && event.daysLeft !== null && event.daysLeft > 0
      ? `${daysLeftText(event.daysLeft)}, dá tempo de voltar depois`
      : deadline.sub;

  async function confirm() {
    setSaving(true);
    setError(false);
    const result = await markSignedUp(event.id);
    if (result.ok) {
      // replace: voltar do evento não reabre a pergunta já respondida.
      router.replace(`${eventPath(event.id)}?${SIGNED_UP_PARAM}`);
      return;
    }
    const redirect = redirectFor(result.reason);
    if (redirect) {
      router.replace(redirect);
    } else if (result.reason === "conflict" || result.reason === "not_found") {
      // O evento mudou de estado (já passou, saiu do filé): o detalhe mostra o que ele é agora.
      router.replace(eventPath(event.id));
    } else {
      // RF-S2.15: o aviso fica aqui mesmo, e ela pode tentar de novo.
      setError(true);
      setSaving(false);
    }
  }

  return (
    <main className={`${shared.main} ${styles.main}`}>
      <EventCard
        group={event.group ?? "Grupo parceiro"}
        title={event.title}
        details={`${formatEventDays(event.startsOn, event.endsOn, true)} · ${event.city ?? "Online"}`}
        icon={typeIcon(event.type).large}
      />

      <h1 className={styles.title}>Conseguiu se inscrever?</h1>
      <p className={styles.lead}>
        Você foi pro site {site}. Se deu certo, marca aqui que a gente guarda o evento no seu filé.
      </p>

      <ul className={eventStyles.summary} aria-label="Prazo">
        <li className={eventStyles.row}>
          <Icon name="clock" size={18} className={eventStyles.rowIcon} />
          <span className={eventStyles.rowText}>
            <span className={eventStyles.rowMain}>{deadline.main}</span>
            {deadlineSub && <span className={eventStyles.rowSub}>{deadlineSub}</span>}
          </span>
        </li>
      </ul>

      {/* RN-19: a inscrição acontece fora da NISE, e a NISE não envia os dados dela. */}
      <Notice>A inscrição é feita no site das organizadoras. Seus dados da NISE não são enviados pra lá.</Notice>

      <div className={styles.footer}>
        {error && (
          <p className={shared.error} role="alert">
            Não deu pra enviar. Tente de novo.
          </p>
        )}
        <Button className={styles.button} onClick={confirm} loading={saving} loadingLabel="Salvando…">
          <Icon name="check" size={18} />
          Sim, me inscrevi
        </Button>
        <LinkButton href={eventPath(event.id)} replace variant="secondary" className={styles.button}>
          Ainda não
        </LinkButton>
        {event.registrationUrl && (
          <a href={event.registrationUrl} target="_blank" rel="noopener noreferrer" className={styles.again}>
            <Icon name="external" size={16} />
            Abrir o site de novo
            <span className={shared.srOnly}> (abre em outra aba)</span>
          </a>
        )}
      </div>
    </main>
  );
}
