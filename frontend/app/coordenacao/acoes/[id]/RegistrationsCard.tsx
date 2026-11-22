"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/Button";
import { DataTable, type Column } from "@/components/DataTable";
import { Icon } from "@/components/Icon";
import { SearchField } from "@/components/SearchField";
import {
  getRegistrations,
  type ActionPage,
  type Registration,
  type RegistrationColumn,
  type RegistrationList,
} from "@/lib/coord-action-page";
import styles from "./RegistrationsCard.module.css";

/** How many girls show before "Ver todas as N" (RF-F1.14). */
const FIRST_PAGE = 6;
/** The most the back-end gives in one request. */
const BIG_PAGE = 500;

type CardProps = {
  action: ActionPage;
  /** "Importar planilha" / "Importar inscritas" (#234 opens its drawer here). */
  onImport?: () => void;
  /** "Adicionar inscrita" (#235 opens its drawer here). */
  onAdd?: () => void;
  /** Only reads: no import and no add (the concluded page, where people are added by the attendance). */
  readOnly?: boolean;
  /** Changing it fetches the list again (after an import or an added girl). */
  reloadToken?: number;
};

const OPTIONAL: Record<RegistrationColumn, Column<Registration>> = {
  whatsapp: { key: "whatsapp", header: "WhatsApp", render: (row) => row.whatsapp ?? "" },
  study_stage: {
    key: "study_stage",
    header: "Nível de escolaridade",
    render: (row) => row.studyStage ?? "",
  },
  school_year: { key: "school_year", header: "Série", render: (row) => row.schoolYear ?? "" },
};

/** Name and e-mail always; the other fields only when some registration has them. */
function tableColumns(columns: RegistrationColumn[]): Column<Registration>[] {
  return [
    { key: "name", header: "Nome", render: (row) => row.name, emphasis: true },
    { key: "email", header: "E-mail", render: (row) => row.email },
    ...columns.map((column) => OPTIONAL[column]),
  ];
}

/** "forms.example/x" for the line of the form: no protocol, no trailing slash. */
function shortLink(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

/**
 * The card "Inscritas" (K11, RF-F1.14): the count, the form link, the search
 * and the girls. The count of the title is the action's, so a search does not
 * change it. The list shows the first six and "Ver todas as N" loads the rest.
 */
export function RegistrationsCard({ action, onImport, onAdd, readOnly = false, reloadToken = 0 }: CardProps) {
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  const [list, setList] = useState<RegistrationList | null>(null);
  const [failed, setFailed] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  // Columns come from the whole action, so they stay while a search narrows the rows.
  const [columns, setColumns] = useState<RegistrationColumn[]>([]);

  // Typing waits a moment before asking the back-end.
  useEffect(() => {
    const timer = setTimeout(() => setTerm(search), 250);
    return () => clearTimeout(timer);
  }, [search]);

  const hasGirls = action.registeredCount > 0;

  useEffect(() => {
    if (!hasGirls) return;
    const controller = new AbortController();
    getRegistrations(action.id, { search: term, limit: FIRST_PAGE }, controller.signal).then(
      (loaded) => {
        if (!loaded) return;
        setFailed(false);
        setList(loaded);
        setColumns(loaded.columns);
      },
      () => {
        if (!controller.signal.aborted) setFailed(true);
      },
    );
    return () => controller.abort();
  }, [action.id, hasGirls, term, reloadToken]);

  async function showMore() {
    if (!list) return;
    setLoadingMore(true);
    try {
      const more = await getRegistrations(action.id, {
        search: term,
        offset: list.items.length,
        limit: BIG_PAGE,
      });
      if (more) setList({ ...list, items: [...list.items, ...more.items], total: more.total });
    } catch {
      setFailed(true);
    } finally {
      setLoadingMore(false);
    }
  }

  const closed = !action.registrationsOpen;
  const remaining = list ? list.total - list.items.length : 0;

  return (
    <section className={styles.card} aria-labelledby="registrations-title">
      <div className={styles.top}>
        <h2 id="registrations-title" className={styles.title}>
          Inscritas
          <span className={styles.count} aria-label={`${action.registeredCount} no total`}>
            {action.registeredCount}
          </span>
        </h2>
        {hasGirls && !readOnly && (
          <div className={styles.actions}>
            <button type="button" className={styles.textButton} onClick={onImport}>
              <Icon name="upload" />
              Importar planilha
            </button>
            <Button variant="secondary" onClick={onAdd} className={styles.add}>
              <Icon name="user-plus" />
              Adicionar inscrita
            </Button>
          </div>
        )}
      </div>

      <p className={styles.formLine}>
        {closed
          ? "As inscrições estão fechadas na NISE e a ação não aparece mais pras meninas."
          : "As inscrições estão acontecendo no seu formulário"}
      </p>
      {action.registrationUrl && (
        <div className={styles.link}>
          <Icon name="link" />
          <span className={styles.url}>{shortLink(action.registrationUrl)}</span>
          <a
            href={action.registrationUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.open}
            aria-label="Abrir o formulário (abre em outra aba)"
          >
            Abrir
            <Icon name="external" />
          </a>
        </div>
      )}

      {!hasGirls ? (
        <div className={styles.empty}>
          <h3 className={styles.emptyTitle}>Nenhuma inscrita ainda</h3>
          {/* Read only (concluded action): there are no buttons, so nothing to say about importing. */}
          {!readOnly && (
            <p className={styles.emptyText}>
              Quando as respostas chegarem no formulário, baixe a planilha e importe aqui. Dá pra
              importar de novo depois.
            </p>
          )}
          {!readOnly && (
            <div className={styles.emptyButtons}>
              <Button onClick={onImport}>Importar inscritas</Button>
              <Button variant="secondary" onClick={onAdd} className={styles.add}>
                <Icon name="user-plus" />
                Adicionar inscrita
              </Button>
            </div>
          )}
        </div>
      ) : (
        <>
          <SearchField
            label="Buscar por nome ou e-mail"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className={styles.search}
          />
          {failed && (
            <p role="alert" className={styles.error}>
              Não foi possível carregar as inscritas. Tente de novo.
            </p>
          )}
          {list && list.items.length > 0 && (
            <DataTable
              caption="Inscritas na ação"
              columns={tableColumns(columns)}
              rows={list.items}
              rowKey={(row) => String(row.id)}
            />
          )}
          {list && list.total === 0 && (
            <p role="status" className={styles.none}>
              Ninguém com esse nome ou e-mail.
            </p>
          )}
          {remaining > 0 && (
            <Button
              variant="secondary"
              className={styles.more}
              loading={loadingMore}
              loadingLabel="Carregando…"
              onClick={showMore}
            >
              {list && list.items.length > FIRST_PAGE ? "Ver mais" : `Ver todas as ${list?.total}`}
              <Icon name="chevron-down" />
            </Button>
          )}
        </>
      )}
    </section>
  );
}
