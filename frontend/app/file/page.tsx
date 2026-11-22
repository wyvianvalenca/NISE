"use client";

// A06·3 · Seu filé: o desenho do filé e as seções "Em andamento", "Próximas aventuras"
// e "Concluídos". Atende RF-F10.07 e RN-28 (issues #114 e #115), pela rota
// GET /api/file da #116 (integração na #117).

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useLayoutEffect, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { AccountMenu } from "@/components/AccountMenu";
import { BottomNav } from "@/components/BottomNav";
import { FileDrawing } from "@/components/FileDrawing";
import { FileItemCard } from "@/components/FileItemCard";
import { FileLegend } from "@/components/FileLegend";
import { Icon } from "@/components/Icon";
import { LoadFailed } from "@/components/LoadFailed";
import { UndoTimerToast } from "@/components/UndoTimerToast";
import { AGENDA_PATH, getToAnswer, pendingCount } from "@/lib/agenda";
import { eventPath, takeDidNotGo, undoDidNotGo, type DidNotGo } from "@/lib/evento";
import {
  NO_CHANGES,
  fileChanges,
  getFile,
  lastShownFile,
  rememberShownFile,
  type FileChanges,
  type FileData,
  type FileItem,
  type FileResult,
} from "@/lib/file";
import { SIGNUP_PATHS } from "@/lib/signup";
import { WITHOUT_SESSION } from "@/lib/signup-api";
import styles from "./page.module.css";

function withoutId(ids: ReadonlySet<string>, id: string): ReadonlySet<string> {
  if (!ids.has(id)) return ids;
  const rest = new Set(ids);
  rest.delete(id);
  return rest;
}

/** Para onde ela vai quando a rota recusa: sem sessão, ou sem o aceite dos termos. */
function redirectFor(result: FileResult | null): string | null {
  if (!result || result.ok) return null;
  if (result.reason === "terms_not_accepted") return SIGNUP_PATHS.terms;
  if (result.reason === "failed") return null;
  return WITHOUT_SESSION[result.reason];
}

export default function FilePage() {
  const router = useRouter();
  const [result, setResult] = useState<FileResult | null>(null);
  // Muda a cada "Tentar novamente", para buscar de novo.
  const [attempt, setAttempt] = useState(0);
  // O que mudou desde a versão que estava na tela: o que entrou desenha a borda, o que
  // andou se preenche e o que saiu faz o caminho de volta (lib/file.ts, fileChanges).
  const [changes, setChanges] = useState<FileChanges>(NO_CHANGES);
  const redirect = redirectFor(result);

  // Quantas perguntas esperam por ela na agenda (RF-F31.10). Se a busca falhar, a faixa não aparece.
  const [questions, setQuestions] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    getToAnswer(controller.signal)
      .then((answer) => setQuestions(answer.ok ? pendingCount(answer.toAnswer) : 0))
      .catch(() => {});
    return () => controller.abort();
  }, []);

  // O desenho que apareceu fica guardado na aba, para a próxima volta comparar com ele.
  useEffect(() => {
    if (result?.ok) rememberShownFile(result.data);
  }, [result]);

  // Escondida no meio de uma animação, a tela perde as marcas que ainda não saíram (cada
  // quadradinho tira a sua quando a animação termina, em onSettled): ao voltar a aparecer, o
  // navegador reinicia as animações dela, e a da volta anterior se repetiria antes da nova.
  useLayoutEffect(() => {
    return () => setChanges(NO_CHANGES);
  }, []);

  // Com cacheComponents, o Next esconde esta tela (Activity) quando ela sai, em vez de
  // desmontá-la, e roda os efeitos de novo quando ela volta. Então, na volta, o filé de
  // antes continua na tela enquanto esta busca roda; quando o novo chega, só os
  // quadradinhos que mudaram desde o último desenho mostrado nesta aba se animam. Se o filé
  // ainda não apareceu nesta aba, nada se anima.
  useEffect(() => {
    const controller = new AbortController();
    getFile(controller.signal).then(
      (next) => {
        const before = lastShownFile();
        setChanges(before && next.ok ? fileChanges(before, next.data) : NO_CHANGES);
        setResult(next);
      },
      () => {
        // Sem conexão, a busca falha. Sair da tela também a cancela, mas isso não é uma falha.
        if (!controller.signal.aborted) setResult({ ok: false, reason: "failed" });
      },
    );
    return () => controller.abort();
  }, [attempt]);

  useEffect(() => {
    if (redirect) router.replace(redirect);
  }, [redirect, router]);

  if (result && !result.ok && result.reason === "failed") {
    return (
      <LoadFailed
        onRetry={() => {
          setResult(null);
          setAttempt(attempt + 1);
        }}
      />
    );
  }

  const data = result?.ok ? result.data : null;

  return (
    <div className={styles.page}>
      <AppHeader>
        {data && <AccountMenu name={data.firstName} />}
      </AppHeader>

      <div className={styles.scroll}>
        <main className={styles.main}>
          {questions > 0 && (
            // Faixa "Tem umas perguntinhas pra você" (Figma: Link target / Perguntinhas pendentes).
            <Link href={AGENDA_PATH} className={styles.questions}>
              Tem umas perguntinhas pra você
              <span className={styles.questionsLink}>
                Ver
                <Icon name="chevron-right" size={14} />
              </span>
            </Link>
          )}
          {data ? (
            <File
              data={data}
              changes={changes}
              // A animação de um quadradinho terminou: a marca sai (FileDrawing, onSettled).
              onSettled={(id) =>
                setChanges((current) => ({
                  ...current,
                  fresh: withoutId(current.fresh, id),
                  filled: withoutId(current.filled, id),
                }))
              }
              // O quadradinho que saiu terminou de sair: deixa de ser desenhado.
              onRemoved={(id) =>
                setChanges((current) => ({
                  ...current,
                  removed: current.removed.filter(({ square }) => square.id !== id),
                }))
              }
            />
          ) : (
            // A E03 ("Tecendo seu filé…", #81) fala das sugestões sendo montadas; o filé
            // só lê o que ela já escolheu, então a espera aqui é só este aviso.
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
type FileProps = {
  data: FileData;
  changes: FileChanges;
  onSettled: (id: string) => void;
  onRemoved: (id: string) => void;
};

function File({ data, changes, onSettled, onRemoved }: FileProps) {
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

      <FileDrawing data={data} changes={changes} onSettled={onSettled} onRemoved={onRemoved} />
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
