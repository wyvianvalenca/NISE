"use client";

import { useId, useRef, useState } from "react";
import { Chip } from "@/components/Chip";
import { DeleteActionModal } from "@/components/DeleteActionModal";
import { Icon } from "@/components/Icon";
import { Notice } from "@/components/Notice";
import { SearchField } from "@/components/SearchField";
import { comparableText, statusGroupLabel } from "@/lib/coord-action-labels";
import {
  countActions,
  deleteCoordAction,
  type ActionStatus,
  type ActionStatusCounts,
  type CoordAction,
} from "@/lib/coord-actions";
import { ActionRow } from "./ActionRow";
import { PendingLink } from "./PendingLink";
import styles from "./ActionsList.module.css";

const STATUSES: ActionStatus[] = [
  "awaiting_registrations",
  "awaiting_event",
  "awaiting_attendance",
  "concluded",
];

/** How many concluded actions show before "Ver as outras N" (Figma: Concluídas). */
const CONCLUDED_PREVIEW = 2;

type Filter = "all" | ActionStatus;

type ActionsListProps = {
  /** Already ordered by the back-end inside each status. */
  actions: CoordAction[];
  counts: ActionStatusCounts;
};

type GroupProps = {
  status: ActionStatus;
  actions: CoordAction[];
  onDelete: (action: CoordAction) => void;
};

/**
 * One status group: heading with its count and the rows. Only "Concluídas"
 * folds: it shows the first few, "Ver as outras N" opens the rest, and the
 * arrow collapses the whole group.
 */
function StatusGroup({ status, actions, onDelete }: GroupProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const listId = useId();
  const title = statusGroupLabel(status);
  const folds = status === "concluded";
  const hidden = folds && !showAll ? Math.max(actions.length - CONCLUDED_PREVIEW, 0) : 0;
  const visible = hidden > 0 ? actions.slice(0, CONCLUDED_PREVIEW) : actions;

  return (
    <section className={styles.group}>
      <div className={styles.groupHeader}>
        <h2 className={styles.groupTitle}>{title}</h2>
        <span className={styles.groupCount}>{actions.length}</span>
        {folds && (
          <button
            type="button"
            className={styles.fold}
            aria-expanded={!collapsed}
            aria-controls={listId}
            aria-label={title}
            onClick={() => setCollapsed((value) => !value)}
          >
            <Icon name={collapsed ? "chevron-up" : "chevron-down"} size={18} />
          </button>
        )}
      </div>
      <div id={listId} className={styles.list} hidden={collapsed}>
        <ul className={styles.rows}>
          {visible.map((action) => (
            <ActionRow key={action.id} action={action} onDelete={onDelete} />
          ))}
        </ul>
        {hidden > 0 && (
          <button type="button" className={styles.more} onClick={() => setShowAll(true)}>
            Ver as outras {hidden}
            <Icon name="chevron-down" />
          </button>
        )}
      </div>
    </section>
  );
}

/**
 * The interactive part of K10: status chips with their counts, the name
 * search, the groups and the deletion of an action. The chips show the counts
 * of the whole list, so they stay put while she types and drop by one when an
 * action is deleted; the groups show what matches. When the real route lands,
 * deleting refetches the list instead of dropping the row here.
 */
export function ActionsList({ actions: initialActions, counts: initialCounts }: ActionsListProps) {
  const [actions, setActions] = useState(initialActions);
  const [counts, setCounts] = useState(initialCounts);
  const [target, setTarget] = useState<CoordAction | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteFailed, setDeleteFailed] = useState(false);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");

  const needle = comparableText(query.trim());
  const matching = actions.filter(
    (action) =>
      (filter === "all" || action.status === filter) &&
      comparableText(action.name).includes(needle),
  );
  const groups = STATUSES.map((status) => ({
    status,
    actions: matching.filter((action) => action.status === status),
  })).filter((group) => group.actions.length > 0);

  function askToDelete(action: CoordAction) {
    setDeleteFailed(false);
    setTarget(action);
  }

  async function confirmDelete() {
    if (!target) return;
    setDeleting(true);
    try {
      await deleteCoordAction(target.id);
      const remaining = actions.filter((action) => action.id !== target.id);
      setActions(remaining);
      setCounts(countActions(remaining));
      titleRef.current?.focus();
    } catch {
      setDeleteFailed(true);
    } finally {
      setDeleting(false);
      setTarget(null);
    }
  }

  return (
    <>
      <div className={styles.top}>
        <div className={styles.heading}>
          <h1 ref={titleRef} tabIndex={-1} className={styles.title}>
            Ações
          </h1>
          <p className={styles.subtitle}>
            Cada ação passa por 3 etapas até ser concluída: inscrições, evento e presença.
          </p>
        </div>
        <PendingLink variant="primary">Nova ação</PendingLink>
      </div>
      {deleteFailed && (
        <div role="alert" className={styles.failure}>
          <Notice tone="pink" icon="alert">
            Não foi possível excluir a ação. Ela continua na lista. Tente de novo.
          </Notice>
        </div>
      )}
      <div className={styles.filters}>
        <div className={styles.chips}>
          <Chip
            className={styles.chip}
            selected={filter === "all"}
            count={counts.all}
            onClick={() => setFilter("all")}
          >
            Todas
          </Chip>
          {STATUSES.map((status, index) => (
            <span key={status} className={styles.step}>
              {index > 0 && (
                <span aria-hidden="true" className={styles.arrow}>
                  ›
                </span>
              )}
              <Chip
                className={styles.chip}
                selected={filter === status}
                count={counts[status]}
                onClick={() => setFilter(status)}
              >
                {statusGroupLabel(status)}
              </Chip>
            </span>
          ))}
        </div>
        <SearchField
          label="Buscar ação"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      {groups.length === 0 && (
        <p role="status" className={styles.empty}>
          Nenhuma ação encontrada.
        </p>
      )}
      {groups.map((group) => (
        <StatusGroup
          key={group.status}
          status={group.status}
          actions={group.actions}
          onDelete={askToDelete}
        />
      ))}
      <DeleteActionModal
        open={target !== null}
        onClose={() => setTarget(null)}
        actionName={target?.name ?? ""}
        busy={deleting}
        onConfirm={confirmDelete}
      />
    </>
  );
}
