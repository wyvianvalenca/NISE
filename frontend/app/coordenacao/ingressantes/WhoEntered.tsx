"use client";

// "Quem ingressou" (#315, RF-F5.05): uma linha por menina do grupo que entrou
// num curso da área, 15 por página (D-77). A coordenadora não confirma nada
// aqui (D-70).

import { useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/Button";
import { type Column, DataTable } from "@/components/DataTable";
import { Loading } from "@/components/Loading";
import { Tag } from "@/components/Tag";
import {
  type EnrollmentPageResult,
  type EnrollmentRow,
  getEnrollments,
  ORIGIN_LABELS,
  pageCount,
  registeredLabel,
} from "@/lib/ingressantes-api";
import styles from "./page.module.css";

const COLUMNS: Column<EnrollmentRow>[] = [
  {
    key: "menina",
    header: "Menina",
    width: "190px",
    emphasis: true,
    render: (row) => (
      <span className={styles.girl}>
        <Avatar name={row.girlName} size={36} />
        {row.girlName}
      </span>
    ),
  },
  { key: "curso", header: "Curso", render: (row) => row.course },
  {
    key: "instituicao",
    header: "Instituição",
    width: "180px",
    // "Onde?" é opcional na A10b: sem ele, um traço (resposta 3 no #263).
    render: (row) => row.institution ?? <span aria-label="Não informada">—</span>,
  },
  {
    key: "registrado",
    header: "Registrado em",
    width: "130px",
    render: (row) => registeredLabel(row.registeredAt),
  },
  {
    key: "origem",
    header: "Como soubemos",
    width: "200px",
    render: (row) =>
      row.origin === "official_list" ? (
        <span className={styles.found}>{ORIGIN_LABELS[row.origin]}</span>
      ) : (
        <Tag variant="soft">{ORIGIN_LABELS[row.origin]}</Tag>
      ),
  },
];

const FAILURE_TEXT: Record<Exclude<EnrollmentPageResult, { ok: true }>["reason"], string> = {
  signed_out: "Sua sessão acabou. Entre de novo para ver a lista.",
  forbidden: "Esta lista é só para a coordenação de um grupo.",
  several_groups: "Você coordena mais de um grupo, e esta tela ainda mostra um só.",
  failed: "Não foi possível carregar a lista. Tente novamente.",
};

export function WhoEntered() {
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<EnrollmentPageResult | null>(null);
  const [attempt, setAttempt] = useState(0);
  const titleRef = useRef<HTMLHeadingElement>(null);
  // Depois de trocar de página, o foco vai para o título da lista, para quem
  // usa teclado ou leitor de tela começar a página nova do topo.
  const focusTitle = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    getEnrollments(page, controller.signal)
      .then((next) => {
        // Uma página que deixou de existir (a lista diminuiu) volta para a última.
        if (next.ok && next.page.items.length === 0 && page > pageCount(next.page)) {
          setPage(pageCount(next.page));
          return;
        }
        setResult(next);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          console.error(error instanceof Error ? error.name : "erro");
          setResult({ ok: false, reason: "failed" });
        }
      });
    return () => controller.abort();
  }, [page, attempt]);

  useEffect(() => {
    if (focusTitle.current && result?.ok) {
      titleRef.current?.focus();
      focusTitle.current = false;
    }
  }, [result]);

  function goTo(next: number) {
    focusTitle.current = true;
    setResult(null);
    setPage(next);
  }

  if (result === null) {
    return (
      <section className={styles.card}>
        <Loading label="Carregando a lista…" />
      </section>
    );
  }

  if (!result.ok) {
    return (
      <section className={styles.card}>
        <p role="alert" className={styles.failure}>
          {FAILURE_TEXT[result.reason]}
        </p>
        {result.reason === "failed" && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setResult(null);
              setAttempt((count) => count + 1);
            }}
          >
            Tentar novamente
          </Button>
        )}
      </section>
    );
  }

  const data = result.page;
  const pages = pageCount(data);

  return (
    <section className={styles.card} aria-labelledby="quem-ingressou">
      <div className={styles.cardHeader}>
        <h2 id="quem-ingressou" ref={titleRef} tabIndex={-1} className={styles.cardTitle}>
          Quem ingressou
        </h2>
        <Tag variant="teal">
          <span className={styles.srOnly}>Total: </span>
          {data.total}
        </Tag>
      </div>
      {/* Texto da resposta 6 no #263: quem confirma é a menina (D-70). */}
      <p className={styles.note}>
        <strong>Detectada na busca</strong>, confirmada por ela.
      </p>

      <DataTable
        columns={COLUMNS}
        rows={data.items}
        rowKey={(row) => String(row.id)}
        caption={`Meninas do grupo que entraram num curso de computação, página ${data.page} de ${pages}`}
      />

      {pages > 1 && (
        <nav className={styles.pager} aria-label="Páginas da lista">
          <span aria-live="polite">
            Página {data.page} de {pages}
          </span>
          <Button
            variant="secondary"
            size="sm"
            disabled={data.page <= 1}
            onClick={() => goTo(data.page - 1)}
          >
            Anterior
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={data.page >= pages}
            onClick={() => goTo(data.page + 1)}
          >
            Próxima
          </Button>
        </nav>
      )}

      {/* Nota do #317: a cidade não entra na busca (RF-F31.03), ao contrário do Figma. */}
      <p className={styles.footnote}>
        A busca usa só o nome completo, e nada é enviado pras instituições.
      </p>
    </section>
  );
}
