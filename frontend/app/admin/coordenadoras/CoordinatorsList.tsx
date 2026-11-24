"use client";

import { useState } from "react";
import { Chip } from "@/components/Chip";
import { SearchField } from "@/components/SearchField";
import {
  coordinatorDateLabel,
  countCoordinators,
  filterCoordinators,
  STATUS_LABEL,
  type CoordinatorFilter,
  type CoordinatorRow,
} from "@/lib/admin-coordinators";
import styles from "./CoordinatorsList.module.css";

const FILTERS: { key: CoordinatorFilter; label: string }[] = [
  { key: "all", label: "Todas" },
  { key: "active", label: "Ativas" },
  { key: "invites", label: "Convites" },
  { key: "deactivated", label: "Desativadas" },
];

type CoordinatorsListProps = {
  coordinators: CoordinatorRow[];
};

/**
 * The interactive part of AD02: filter chips with the counts of the whole
 * list, the search by coordinator or group name, and one row per coordinator.
 * The page shows no data about girls (RN-41).
 */
export function CoordinatorsList({ coordinators }: CoordinatorsListProps) {
  const [filter, setFilter] = useState<CoordinatorFilter>("all");
  const [query, setQuery] = useState("");

  const counts = countCoordinators(coordinators);
  const rows = filterCoordinators(coordinators, filter, query);

  return (
    <>
      <div className={styles.heading}>
        <h1 className={styles.title}>Coordenadoras</h1>
        <p className={styles.subtitle}>Quem coordena cada grupo e quem ainda precisa de atenção.</p>
      </div>
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
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className={styles.note}>
        Cada convite vale 7 dias, funciona uma vez só e só pro e-mail convidado.
      </p>
    </>
  );
}
