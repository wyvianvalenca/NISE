"use client";

// A06·4b · Evento: o detalhe de um evento do filé (versão "Próxima aventura").
// Atende RF-F10.13 e RN-19, RN-36 (issues #178 e #179). Usa os dados de teste de lib/evento.ts.

import Link from "next/link";
import { useParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { getEvent, type EventDetail } from "@/lib/evento";
import shared from "../../[id]/atividade.module.css";
import { EventView } from "./EventView";

const FILE_PATH = "/file";

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
        <main className={shared.main}>
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
  if (event === null)
    return <p className={shared.status}>Esse evento não está no seu filé.</p>;
  // "Já me inscrevi" e "Tirar do filé" ficam desenhados e desabilitados até a #182.
  return <EventView event={event} />;
}
