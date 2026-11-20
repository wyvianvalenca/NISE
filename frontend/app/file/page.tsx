"use client";

// A06·3 · Seu filé: o desenho do filé e as seções "Em andamento", "Próximas aventuras"
// e "Concluídos". Atende RF-F10.07 e RN-28 (issues #114 e #115), pela rota
// GET /api/file da #116 (integração na #117).

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useLayoutEffect, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { Avatar } from "@/components/Avatar";
import { BottomNav } from "@/components/BottomNav";
import { FileDrawing } from "@/components/FileDrawing";
import { FileItemCard } from "@/components/FileItemCard";
import { FileLegend } from "@/components/FileLegend";
import { Icon } from "@/components/Icon";
import { LoadFailed } from "@/components/LoadFailed";
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

  // O desenho que apareceu fica guardado na aba, para a próxima volta comparar com ele.
  useEffect(() => {
    if (result?.ok) rememberShownFile(result.data);
  }, [result]);

  // Escondida, a tela perde as marcas de animação: ao voltar a aparecer, o navegador reinicia
  // as animações dela, e o preenchimento da volta anterior se repetiria antes do novo.
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
        {data && (
          // O perfil ainda não existe; por enquanto o link dá 404.
          <Link href="/perfil" className={styles.profile} aria-label="Seu perfil">
            <Avatar name={data.firstName} size={36} />
          </Link>
        )}
      </AppHeader>

      <div className={styles.scroll}>
        <main className={styles.main}>
          {data ? (
            <File
              data={data}
              changes={changes}
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
    </div>
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
  onRemoved: (id: string) => void;
};

function File({ data, changes, onRemoved }: FileProps) {
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

      <FileDrawing data={data} changes={changes} onRemoved={onRemoved} />
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
