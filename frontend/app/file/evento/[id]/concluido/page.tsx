"use client";

// A06·5 · Concluído, depois de "Fui!" num evento de fora (issues #190 e #191).
// É a mesma celebração da atividade concluída (#120), por enquanto sem a avaliação (#124):
// ActivityFeedback grava na rota de avaliação de atividade, e a avaliação de evento de fora
// ainda não existe (está em revisão na F4). Quando ela existir, entra aqui com a função própria.
//
// A confirmar com o design (notas da #190): os textos da A06·5 para evento, que foi
// desenhada para atividade ("Você conseguiu").

import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Suspense, useEffect, useRef } from "react";
import { Button } from "@/components/Button";
import shared from "../../../[id]/atividade.module.css";
import celebration from "../../../[id]/concluida/concluida.module.css";
import { useEvent } from "../useEvent";

const FILE_PATH = "/file";

export default function EventCelebrationPage() {
  return (
    <div className={shared.page}>
      <header className={`${shared.header} ${shared.headerEnd}`}>
        <Link href={FILE_PATH} className={shared.close}>
          Fechar
        </Link>
      </header>

      <div className={shared.scroll}>
        <main className={`${shared.main} ${celebration.main}`}>
          <Suspense fallback={<Loading />}>
            <Celebration />
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

function Celebration() {
  const { id } = useParams<{ id: string }>();
  const { result, redirecting, retry } = useEvent(id);
  const event = result?.ok ? result.data : null;
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Leva o foco ao título quando a tela abre, para o leitor de tela anunciar a conquista.
  useEffect(() => {
    if (event) headingRef.current?.focus();
  }, [event]);

  if (!result || redirecting) return <Loading />;
  if (!result.ok && result.reason !== "not_found") {
    return (
      <div role="alert">
        <p className={shared.status}>Não deu pra carregar o evento.</p>
        <Button variant="secondary" size="sm" onClick={retry}>
          Tentar de novo
        </Button>
      </div>
    );
  }
  if (!event || event.status !== "concluded") {
    return <p className={shared.status}>Esse evento não está nos concluídos do seu filé.</p>;
  }
  return (
    <>
      <Image
        src="/ilustracoes/file-item-novo.svg"
        alt=""
        width={180}
        height={180}
        unoptimized
        className={celebration.art}
      />
      <p className={celebration.kicker}>Mais um passo dado</p>
      <h1 ref={headingRef} tabIndex={-1} className={celebration.title}>
        {event.firstName.trim() ? `Você conseguiu, ${event.firstName}!` : "Você conseguiu!"}
      </h1>
      <p className={celebration.activity}>{event.title}</p>
    </>
  );
}
