"use client";

// A06·3 · Seu filé: o desenho do filé e as seções "Em andamento", "Próximas aventuras"
// e "Concluídos". Atende RF-F10.07 e RN-28 (issues #114 e #115).
// Usa os dados de teste de lib/file.ts até a rota da #114 existir.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { AccountMenu } from "@/components/AccountMenu";
import { BottomNav } from "@/components/BottomNav";
import { FileDrawing } from "@/components/FileDrawing";
import { FileItemCard } from "@/components/FileItemCard";
import { FileLegend } from "@/components/FileLegend";
import { Icon } from "@/components/Icon";
import { UndoTimerToast } from "@/components/UndoTimerToast";
import { eventPath, takeDidNotGo, undoDidNotGo, type DidNotGo } from "@/lib/evento";
import { getFile, type FileData, type FileItem } from "@/lib/file";
import styles from "./page.module.css";

export default function FilePage() {
  const [data, setData] = useState<FileData | null>(null);

  useEffect(() => {
    let current = true;
    getFile().then((result) => {
      if (current) setData(result);
    });
    return () => {
      current = false;
    };
  }, []);

  return (
    <div className={styles.page}>
      <AppHeader>
        {data && <AccountMenu name={data.firstName} />}
      </AppHeader>

      <div className={styles.scroll}>
        <main className={styles.main}>
          {data ? (
            <File data={data} />
          ) : (
            // Provisório: a tela de carregamento (E03) é da issue #81 e entra aqui quando existir.
            <p className={styles.status} aria-live="polite">
              Carregando…
            </p>
          )}
        </main>
      </div>

      <BottomNav active="file" />
      <DidNotGoToast />
    </div>
  );
}

/**
 * Aviso depois do "Não deu" de um evento de fora (#190): o evento saiu do filé, e o
 * "Desfazer" o traz de volta para a pergunta "Você foi?". Some sozinho ou quando ela sai da tela.
 */
function DidNotGoToast() {
  const router = useRouter();
  const [notice, setNotice] = useState<DidNotGo | null>(null);
  const [status, setStatus] = useState<"ready" | "undoing" | "error">("ready");

  // Lido depois da montagem, como os dados do filé: no servidor não há sessionStorage.
  useEffect(() => {
    let current = true;
    Promise.resolve().then(() => {
      // Só lê (e esquece) se este efeito ainda vale: no modo estrito o React monta duas vezes.
      if (!current) return;
      const event = takeDidNotGo();
      if (event) setNotice(event);
    });
    return () => {
      current = false;
    };
  }, []);

  const close = useCallback(() => setNotice(null), []);

  if (!notice) return null;

  async function undo() {
    if (!notice || status === "undoing") return;
    setStatus("undoing");
    try {
      await undoDidNotGo(notice.id);
      router.push(eventPath(notice.id));
    } catch {
      setStatus("error");
    }
  }

  return (
    <UndoTimerToast status={status} errorText="Não deu pra desfazer." onUndo={undo} onTimeout={close}>
      <strong>{notice.title}</strong> saiu do seu filé.
    </UndoTimerToast>
  );
}

/**
 * The whole filé. With no activity at all (A06·3 empty, D-35, RF-F10.19) the
 * introduction paragraph becomes a dashed card and the three sections go away;
 * the drawing and the legend stay, because the drawing already handles an empty
 * list. Both come back on her first "Quero fazer".
 */
function File({ data }: { data: FileData }) {
  const isEmpty = data.done.length + data.inProgress.length + data.next.length === 0;

  return (
    <>
      <div className={styles.titleRow}>
        <h1 className={styles.title}>Seu filé</h1>
        <Link href="/por-que-file" className={styles.help} aria-label="O que é o filé?">
          <Icon name="question" />
        </Link>
      </div>
      {isEmpty ? (
        <div className={styles.empty}>
          <h2 className={styles.emptyTitle}>Seu filé tá só começando</h2>
          <p className={styles.emptyText}>
            Ele vai ganhando forma com o que você escolhe: cada atividade vira um quadradinho, e quando você
            conclui, ele é colorido.
          </p>
        </div>
      ) : (
        <p className={styles.intro}>
          Ele vai ganhando forma com o que você escolhe. Cada atividade é um quadradinho do seu filé, e quando
          você conclui, ele é colorido. No seu ritmo, sem pressa.
        </p>
      )}
      <Link href="/descobrir" className={styles.discover}>
        <Icon name="sparkle" size={15} />
        Descobrir mais sugestões
        <span aria-hidden="true">→</span>
      </Link>

      <FileDrawing data={data} />
      <FileLegend data={data} />

      {!isEmpty && (
        <>
          <Section title="Em andamento" items={data.inProgress} startOpen />
          <Section title="Próximas aventuras" items={data.next} startOpen />
          <Section title="Concluídos" items={data.done} startOpen={false} />
        </>
      )}
    </>
  );
}

type SectionProps = {
  title: string;
  items: FileItem[];
  startOpen: boolean;
};

/** Seção com contador e "Recolher"/"Mostrar" (Figma: Seção / ..., A06·3). */
function Section({ title, items, startOpen }: SectionProps) {
  const [open, setOpen] = useState(startOpen);
  const listId = useId();
  const empty = items.length === 0;

  return (
    <section className={styles.section} aria-label={title}>
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>
          {title}
          <span className={styles.counter}>{items.length}</span>
        </h2>
        {/* Seção vazia não tem o que recolher. */}
        {!empty && (
          <button
            type="button"
            className={styles.toggle}
            aria-expanded={open}
            aria-controls={listId}
            onClick={() => setOpen(!open)}
          >
            {open ? "Recolher" : "Mostrar"}
            <span className={styles.srOnly}> {title}</span>
            <Icon name={open ? "chevron-up" : "chevron-down"} />
          </button>
        )}
      </div>
      {!empty && (
        <ul id={listId} className={styles.items} hidden={!open}>
          {items.map((item) => (
            <li key={item.id}>
              <FileItemCard item={item} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
