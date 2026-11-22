"use client";

import { useState } from "react";
import { Button } from "@/components/Button";
import { Checkbox } from "@/components/Checkbox";
import { Icon } from "@/components/Icon";
import { SearchField } from "@/components/SearchField";
import { comparableText } from "@/lib/coord-action-labels";
import type { AttendanceGirl, AttendancePage } from "@/lib/coord-attendance";
import styles from "./AttendanceMarking.module.css";

/** How many girls show before "Ver mais N" (#339). */
const FIRST_PAGE = 12;

type MarkingProps = {
  attendance: AttendancePage;
  /** The registrations marked as present on this page; they are lost if she leaves. */
  marks: ReadonlySet<number>;
  onToggle: (id: number, marked: boolean) => void;
  /** Marks everyone, or unmarks everyone. */
  onToggleAll: (marked: boolean) => void;
  /** Closes the list. What was not saved is lost. */
  onBack: () => void;
};

/** Name and e-mail always; the other fields only when some girl has them (RF-F1.14). */
function details(girl: AttendanceGirl, columns: AttendancePage["columns"]): string[] {
  const values = { whatsapp: girl.whatsapp, study_stage: girl.studyStage, school_year: girl.schoolYear };
  return columns.map((column) => values[column] ?? "");
}

/**
 * The list to mark who came (K11 "marcando", #339, RF-F3.01). Marking and
 * unmarking are free until the attendance is concluded (D-80). It only changes
 * this page: nothing is sent and the filé of the girls does not change (D-81).
 */
export function AttendanceMarking({ attendance, marks, onToggle, onToggleAll, onBack }: MarkingProps) {
  const [search, setSearch] = useState("");
  const [showAll, setShowAll] = useState(false);
  // The boxes keep their own state (see Checkbox), so "Marcar todas" gives them a new key.
  const [version, setVersion] = useState(0);

  const total = attendance.girls.length;
  const allMarked = total > 0 && marks.size === total;
  const term = comparableText(search.trim());
  const matches = attendance.girls.filter(
    (girl) => !term || comparableText(`${girl.name} ${girl.email}`).includes(term),
  );
  const shown = showAll ? matches : matches.slice(0, FIRST_PAGE);
  const remaining = matches.length - shown.length;

  function toggleAll() {
    onToggleAll(!allMarked);
    setVersion((value) => value + 1);
  }

  return (
    <section className={styles.card} aria-labelledby="marking-title">
      <div className={styles.top}>
        <h2 id="marking-title" className={styles.title}>
          Marcar presença
        </h2>
        <button type="button" className={styles.back} onClick={onBack}>
          <Icon name="left" />
          Voltar
        </button>
      </div>
      <p className={styles.help}>Marque quem esteve na ação. Dá pra desmarcar até concluir.</p>

      {total === 0 ? (
        <p className={styles.none}>Ninguém se inscreveu nesta ação.</p>
      ) : (
        <>
          <div className={styles.tools}>
            <SearchField
              label="Buscar por nome ou e-mail"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className={styles.search}
            />
            <Button variant="secondary" onClick={toggleAll}>
              {allMarked ? "Desmarcar todas" : "Marcar todas"}
            </Button>
          </div>

          {matches.length === 0 ? (
            <p role="status" className={styles.none}>
              Ninguém com esse nome ou e-mail.
            </p>
          ) : (
            <ul className={styles.list} aria-label="Inscritas">
              {shown.map((girl) => (
                <li key={`${girl.id}-${version}`}>
                  <Checkbox
                    variant="card"
                    defaultChecked={marks.has(girl.id)}
                    onCheckedChange={(checked) => onToggle(girl.id, checked)}
                  >
                    <span className={styles.row}>
                      <span className={styles.name}>{girl.name}</span>
                      <span className={styles.cell}>{girl.email}</span>
                      {details(girl, attendance.columns).map((value, index) => (
                        <span key={index} className={styles.cell}>
                          {value}
                        </span>
                      ))}
                    </span>
                  </Checkbox>
                </li>
              ))}
            </ul>
          )}
          {remaining > 0 && (
            <Button variant="secondary" className={styles.more} onClick={() => setShowAll(true)}>
              Ver mais {remaining}
              <Icon name="chevron-down" />
            </Button>
          )}
        </>
      )}

      <p role="status" className={styles.footer}>
        <b>{marks.size}</b> de {total} marcadas como presentes
      </p>
    </section>
  );
}
