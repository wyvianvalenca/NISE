"use client";

import { useState } from "react";
import { Button } from "@/components/Button";
import { Chip } from "@/components/Chip";
import { Notice } from "@/components/Notice";
import { SearchField } from "@/components/SearchField";
import { Toast } from "@/components/Toast";
import { resendCoordinatorInvite } from "@/lib/admin-coordinator-invite";
import {
  coordinatorDateLabel,
  countCoordinators,
  filterCoordinators,
  STATUS_LABEL,
  type CoordinatorFilter,
  type CoordinatorRow,
} from "@/lib/admin-coordinators";
import { InviteDrawer } from "./InviteDrawer";
import styles from "./CoordinatorsList.module.css";

const FILTERS: { key: CoordinatorFilter; label: string }[] = [
  { key: "all", label: "Todas" },
  { key: "active", label: "Ativas" },
  { key: "invites", label: "Convites" },
  { key: "deactivated", label: "Desativadas" },
];

type CoordinatorsListProps = {
  coordinators: CoordinatorRow[];
  /** An invite was sent or resent: the list is fetched again to show it. */
  onInvited: () => void;
};

/** What the team sees after "Reenviar": the dark notice or the pink alert. */
type ResendNotice =
  | { kind: "sent"; firstName: string }
  | { kind: "failed"; firstName: string }
  | { kind: "has_account" }
  | { kind: "problem" };

const firstNameOf = (name: string) => name.trim().split(/\s+/)[0];

/**
 * The interactive part of AD02: filter chips with the counts of the whole
 * list, the search by coordinator or group name, and one row per coordinator.
 * The page shows no data about girls (RN-41).
 */
export function CoordinatorsList({ coordinators, onInvited }: CoordinatorsListProps) {
  const [filter, setFilter] = useState<CoordinatorFilter>("all");
  const [query, setQuery] = useState("");
  const [inviting, setInviting] = useState(false);
  const [resendingId, setResendingId] = useState<number | null>(null);
  const [notice, setNotice] = useState<ResendNotice | null>(null);

  async function resend(row: CoordinatorRow) {
    if (resendingId !== null) return;
    const firstName = firstNameOf(row.name);
    setResendingId(row.id);
    setNotice(null);
    const result = await resendCoordinatorInvite(row.id, firstName).catch(
      () => ({ kind: "problem", problem: "failed" }) as const,
    );
    setResendingId(null);
    if (result.kind === "sent") {
      setNotice(
        result.emailSent
          ? { kind: "sent", firstName: result.firstName }
          : { kind: "failed", firstName },
      );
    } else if (result.problem === "email_has_account") {
      setNotice({ kind: "has_account" });
    } else {
      setNotice({ kind: "problem" });
    }
    // The new date shows up (or the row goes away, if the e-mail has an account now).
    onInvited();
  }

  const counts = countCoordinators(coordinators);
  const rows = filterCoordinators(coordinators, filter, query);

  return (
    <>
      <div className={styles.heading}>
        <h1 className={styles.title}>Coordenadoras</h1>
        <p className={styles.subtitle}>Quem coordena cada grupo e quem ainda precisa de atenção.</p>
        <Button className={styles.invite} onClick={() => setInviting(true)}>
          + Convidar coordenadora
        </Button>
      </div>
      {notice?.kind === "sent" && (
        <div className={styles.notice}>
          <Toast action={{ label: "Fechar", onClick: () => setNotice(null) }}>
            <strong>Convite reenviado.</strong> Mandamos um link novo pra {notice.firstName}.
          </Toast>
        </div>
      )}
      {notice !== null && notice.kind !== "sent" && (
        <div role="alert" className={styles.notice}>
          <Notice tone="pink" icon="alert">
            {notice.kind === "failed" &&
              `Não deu pra enviar o e-mail pra ${notice.firstName}. Tente de novo.`}
            {notice.kind === "has_account" && "Este e-mail já tem conta na NISE. Nada foi enviado."}
            {notice.kind === "problem" && "Não deu pra reenviar o convite agora. Tente de novo."}
          </Notice>
        </div>
      )}
      <div className={styles.filters}>
        <div className={styles.chips}>
          {FILTERS.map((item) => (
            <Chip
              key={item.key}
              className={styles.chip}
              selected={filter === item.key}
              count={counts[item.key]}
              onClick={() => setFilter(item.key)}
            >
              {item.label}
            </Chip>
          ))}
        </div>
        <SearchField
          label="Buscar coordenadora ou grupo"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      {rows.length === 0 ? (
        <p role="status" className={styles.empty}>
          Nenhuma coordenadora encontrada.
        </p>
      ) : (
        <ul className={styles.rows}>
          {rows.map((row) => (
            <li key={`${row.status}-${row.id}-${row.group_name}`} className={styles.row}>
              <span aria-hidden="true" className={styles.initial}>
                {row.name.charAt(0).toUpperCase()}
              </span>
              <div className={styles.info}>
                <h2 className={styles.name}>{row.name}</h2>
                <p className={styles.group}>{row.group_name}</p>
              </div>
              <div className={styles.situation}>
                <span className={`${styles.status} ${styles[row.status]}`}>
                  {STATUS_LABEL[row.status]}
                </span>
                <span className={styles.date}>{coordinatorDateLabel(row)}</span>
                {(row.status === "invite_sent" || row.status === "invite_expired") && (
                  <Button
                    variant="secondary"
                    size="sm"
                    className={styles.resend}
                    loading={resendingId === row.id}
                    loadingLabel="Reenviando…"
                    aria-label={`Reenviar convite para ${row.name}`}
                    onClick={() => resend(row)}
                  >
                    Reenviar
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className={styles.note}>
        Cada convite vale 7 dias, funciona uma vez só e só pro e-mail convidado.
      </p>
      {inviting && <InviteDrawer onInvited={onInvited} onClose={() => setInviting(false)} />}
    </>
  );
}
