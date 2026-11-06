"use client";

// A06·3 · Seu filé: o desenho do filé e as seções "Em andamento", "Próximas aventuras"
// e "Concluídos". Atende RF-F10.07 e RN-28 (issues #114 e #115).
// Usa os dados de teste de lib/file.ts até a rota da #114 existir.

import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { Avatar } from "@/components/Avatar";
import { BottomNav } from "@/components/BottomNav";
import { FileDrawing } from "@/components/FileDrawing";
import { FileItemCard } from "@/components/FileItemCard";
import { FileLegend } from "@/components/FileLegend";
import { Icon } from "@/components/Icon";
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
    </div>
  );
}

function File({ data }: { data: FileData }) {
  return (
    <>
      <div className={styles.titleRow}>
        <h1 className={styles.title}>Seu filé</h1>
        {/* "Por que filé?" (A06·0) é da #82; até existir, o destino dá 404. */}
        <Link href="/por-que-file" className={styles.help} aria-label="O que é o filé?">
          <Icon name="question" />
        </Link>
      </div>
      <p className={styles.intro}>
        Ele vai ganhando forma com o que você escolhe. Cada atividade é um quadradinho do seu filé, e quando
        você conclui, ele é colorido. No seu ritmo, sem pressa.
      </p>
      <Link href="/descobrir" className={styles.discover}>
        <Icon name="sparkle" size={15} />
        Descobrir mais sugestões
        <span aria-hidden="true">→</span>
      </Link>

      <FileDrawing data={data} />
      <FileLegend data={data} />

      <Section title="Em andamento" items={data.inProgress} startOpen />
      <Section title="Próximas aventuras" items={data.next} startOpen />
      <Section title="Concluídos" items={data.done} startOpen={false} />
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
        {/* Seção vazia não tem o que recolher. O filé vazio ainda espera o design (#114). */}
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
