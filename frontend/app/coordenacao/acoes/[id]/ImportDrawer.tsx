"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/Button";
import { DataTable, type Column } from "@/components/DataTable";
import { Drawer } from "@/components/Drawer";
import { Icon } from "@/components/Icon";
import { Notice } from "@/components/Notice";
import { Select } from "@/components/Select";
import { StepTracker } from "@/components/StepTracker";
import {
  readImportFile,
  reviewImport,
  runImport,
  type ActionPage,
  type ImportErrorCode,
  type ImportMapping,
  type ImportRead,
  type ImportReadyRow,
  type ImportReason,
  type ImportReview,
} from "@/lib/coord-action-page";
import styles from "./ImportDrawer.module.css";

/** A clear message for each code of the back-end (RF-F1.01, RF-F1.05). */
const ERROR_TEXT: Record<ImportErrorCode, string> = {
  unsupported_type: "Esse tipo de arquivo não serve. Use uma planilha em .csv ou .xlsx.",
  unreadable_file:
    "Não conseguimos ler esse arquivo. Confira se ele abre na sua planilha e escolha de novo.",
  empty_file: "A planilha não tem nenhuma linha de inscrita. Confira o arquivo.",
  too_large: "O arquivo é grande demais. O limite é 5 MB ou 2.000 linhas.",
  missing_columns: "Escolha uma coluna para o Nome e uma para o E-mail.",
  invalid_corrections: "Alguns e-mails ainda não estão certos. Corrija os que estão marcados.",
  failed: "Não foi possível fazer isso agora. Nada foi salvo. Tente de novo.",
};

const REASON_TEXT: Record<ImportReason, string> = {
  incomplete_email: "E-mail incompleto",
  missing_email: "Sem e-mail",
  missing_name: "Sem nome",
};

type MappingKey = keyof ImportMapping;

const FIELDS: { key: MappingKey; label: string; required: boolean }[] = [
  { key: "name", label: "Nome", required: true },
  { key: "email", label: "E-mail", required: true },
  { key: "whatsapp", label: "WhatsApp", required: false },
  { key: "studyStage", label: "Escolaridade", required: false },
  { key: "schoolYear", label: "Série", required: false },
];

/** Same shape the back-end checks; the back-end has the last word. */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

const READY_COLUMNS: Column<ImportReadyRow>[] = [
  { key: "name", header: "Nome", render: (row) => row.name, emphasis: true },
  { key: "email", header: "E-mail", render: (row) => row.email },
  { key: "study", header: "Nível de escolaridade", render: (row) => row.studyStage ?? "" },
];

/** How many names show in "Prontas" while it is closed. */
const PREVIEW = 4;

type Props = {
  action: ActionPage;
  onClose: () => void;
  /** The import worked: the page reloads the action and the list. */
  onImported: () => void;
};

/**
 * "Importar inscritas" (K11, #234): step 1 "Planilha" and step 2 "Revisão".
 * The page mounts it only while it is open, so every opening starts clean. The
 * `File` stays here and goes to each route again, because the back-end keeps
 * nothing (RN-27).
 */
export function ImportDrawer({ action, onClose, onImported }: Props) {
  const pickerRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<1 | 2>(1);
  const [file, setFile] = useState<File | null>(null);
  const [sheet, setSheet] = useState<ImportRead | null>(null);
  const [mapping, setMapping] = useState<ImportMapping | null>(null);
  const [review, setReview] = useState<ImportReview | null>(null);
  const [typed, setTyped] = useState<Record<number, string>>({});
  const [skipped, setSkipped] = useState<number[]>([]);
  const [invalidLines, setInvalidLines] = useState<number[]>([]);
  const [error, setError] = useState<ImportErrorCode | null>(null);
  const [busy, setBusy] = useState<"reading" | "reviewing" | "importing" | null>(null);

  async function pick(chosen: File) {
    setBusy("reading");
    setError(null);
    const result = await readImportFile(action.id, chosen);
    setBusy(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setFile(chosen);
    setSheet(result.data);
    setMapping(result.data.suggested);
    resetReview();
  }

  function resetReview() {
    setReview(null);
    setTyped({});
    setSkipped([]);
    setInvalidLines([]);
  }

  function choose(key: MappingKey, column: string) {
    if (!mapping) return;
    setMapping({ ...mapping, [key]: column === "" ? null : column });
    resetReview();
  }

  async function goToReview() {
    if (!file || !mapping) return;
    setError(null);
    // Back and forth keeps what she already typed: the review is fetched again
    // only when the columns changed (choose() cleared it).
    if (review) {
      setStep(2);
      return;
    }
    setBusy("reviewing");
    const result = await reviewImport(action.id, file, mapping);
    setBusy(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setReview(result.data);
    setStep(2);
  }

  /** Corrected lines that look like an e-mail and are not left out. */
  function corrections() {
    return Object.entries(typed)
      .map(([line, email]) => ({ line: Number(line), email: email.trim() }))
      .filter((fix) => fix.email !== "" && !skipped.includes(fix.line));
  }

  async function submit() {
    if (!file || !mapping) return;
    setBusy("importing");
    setError(null);
    const result = await runImport(action.id, file, mapping, corrections(), skipped);
    setBusy(null);
    if (!result.ok) {
      setError(result.error);
      if (result.error === "invalid_corrections") setInvalidLines(result.lines);
      return;
    }
    onImported();
  }

  const canReview = mapping?.name != null && mapping?.email != null;

  // The count of the button: the new ready lines plus the corrected ones that
  // look valid and are not already in the file (a repeated e-mail enters once).
  let importCount = 0;
  if (review) {
    const known = new Set(review.ready.map((row) => row.email.toLowerCase()));
    const added = new Set<string>();
    for (const fix of corrections()) {
      const email = fix.email.toLowerCase();
      if (EMAIL_SHAPE.test(email) && !known.has(email)) added.add(email);
    }
    importCount = review.newCount + added.size;
  }
  const returning = review !== null && review.alreadyInAction > 0;

  const header = (
    <StepTracker
      size="sm"
      steps={[
        { label: "Planilha", status: step === 1 ? "current" : "done" },
        { label: "Revisão", status: step === 2 ? "current" : "todo" },
      ]}
    />
  );

  let footer;
  if (step === 1) {
    footer = (
      <div className={styles.footer}>
        <button type="button" className={styles.textButton} onClick={onClose}>
          Cancelar
        </button>
        {sheet && (
          <Button
            onClick={goToReview}
            disabled={!canReview}
            loading={busy === "reviewing"}
            loadingLabel="Revisando…"
          >
            Revisar {plural(sheet.lineCount, "linha", "linhas")}
          </Button>
        )}
      </div>
    );
  } else if (review) {
    footer = (
      <div className={styles.footer}>
        <button type="button" className={styles.textButton} onClick={() => setStep(1)}>
          <Icon name="left" />
          Voltar
        </button>
        <div className={styles.footerEnd}>
          <p className={styles.footNote}>
            {review.toReview.length > 0 && (
              <span>
                {review.toReview.length === 1
                  ? "A 1 em revisão entra quando você corrigir."
                  : `As ${review.toReview.length} em revisão entram quando você corrigir.`}
              </span>
            )}
            {action.status === "awaiting_registrations" && (
              <span>A ação passa para Aguardando evento.</span>
            )}
          </p>
          <Button
            onClick={submit}
            disabled={importCount === 0}
            loading={busy === "importing"}
            loadingLabel="Importando…"
          >
            {returning
              ? `Importar ${plural(importCount, "nova", "novas")}`
              : `Importar ${plural(importCount, "inscrita", "inscritas")}`}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Drawer
      open
      wide
      onClose={onClose}
      title={step === 1 ? "Importe as inscritas" : "Revise antes de importar"}
      subtitle={
        step === 1
          ? action.name
          : `${review?.fileName ?? ""} · ${plural(review?.lineCount ?? 0, "linha", "linhas")}`
      }
      headerExtra={header}
      footer={footer}
    >
      <input
        ref={pickerRef}
        type="file"
        accept=".csv,.xlsx"
        hidden
        aria-label="Planilha de inscritas"
        onChange={(event) => {
          const chosen = event.target.files?.[0];
          event.target.value = "";
          if (chosen) void pick(chosen);
        }}
      />
      {error && (
        <div role="alert">
          <Notice tone="pink" icon="alert">
            {ERROR_TEXT[error]}
          </Notice>
        </div>
      )}
      {step === 1 ? (
        <>
          <p className={styles.lead}>
            Use a planilha que o seu formulário já gera. A importação não cria contas.
          </p>
          {busy === "reading" && (
            <p role="status" className={styles.lead}>
              Lendo a planilha…
            </p>
          )}
          {!sheet ? (
            <div className={styles.picker}>
              <Button variant="secondary" onClick={() => pickerRef.current?.click()}>
                <Icon name="upload" />
                Escolher planilha
              </Button>
              <p className={styles.hint}>Arquivo .csv ou .xlsx, até 5 MB.</p>
            </div>
          ) : (
            mapping && (
              <>
                <div className={styles.fileCard}>
                  <span className={styles.fileIcon} aria-hidden="true">
                    <Icon name="sheet" />
                  </span>
                  <div className={styles.fileText}>
                    <p className={styles.fileName}>{sheet.fileName}</p>
                    <p className={styles.fileMeta}>{plural(sheet.lineCount, "linha", "linhas")}</p>
                  </div>
                  <button
                    type="button"
                    className={styles.textButton}
                    onClick={() => pickerRef.current?.click()}
                  >
                    Trocar arquivo
                  </button>
                </div>
                <section aria-labelledby="columns-title" className={styles.columns}>
                  <h3 id="columns-title" className={styles.sectionTitle}>
                    Confira as colunas
                  </h3>
                  <p className={styles.lead}>
                    Reconhecemos as colunas do arquivo. Ajuste se alguma estiver trocada.
                  </p>
                  <table className={styles.map}>
                    <thead>
                      <tr>
                        <th scope="col">Na NISE</th>
                        <th scope="col">Coluna da sua planilha</th>
                        <th scope="col">Primeira linha</th>
                      </tr>
                    </thead>
                    <tbody>
                      {FIELDS.map((field) => {
                        const column = mapping[field.key];
                        return (
                          <tr key={field.key}>
                            <th scope="row">
                              {field.label}
                              <span className={styles.kind}>
                                {field.required ? "obrigatório" : "opcional"}
                              </span>
                            </th>
                            <td className={styles.cell}>
                              <Select
                                label={`Coluna para ${field.label}`}
                                className={styles.select}
                                value={column ?? ""}
                                onChange={(event) => choose(field.key, event.target.value)}
                              >
                                <option value="">Não usar</option>
                                {sheet.columns.map((name) => (
                                  <option key={name} value={name}>
                                    {name}
                                  </option>
                                ))}
                              </Select>
                            </td>
                            <td className={styles.first}>
                              {column ? sheet.firstLine[column] || "—" : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <p className={styles.note}>
                    Colunas marcadas como <strong>Não usar</strong> não entram na NISE.
                  </p>
                </section>
              </>
            )
          )}
        </>
      ) : (
        review && (
          <ReviewStep
            review={review}
            typed={typed}
            skipped={skipped}
            invalidLines={invalidLines}
            onType={(line, email) => {
              setTyped({ ...typed, [line]: email });
              setInvalidLines(invalidLines.filter((other) => other !== line));
            }}
            onSkip={(line) =>
              setSkipped(
                skipped.includes(line) ? skipped.filter((other) => other !== line) : [...skipped, line],
              )
            }
          />
        )
      )}
    </Drawer>
  );
}

type ReviewProps = {
  review: ImportReview;
  typed: Record<number, string>;
  skipped: number[];
  invalidLines: number[];
  onType: (line: number, email: string) => void;
  onSkip: (line: number) => void;
};

function ReviewStep({ review, typed, skipped, invalidLines, onType, onSkip }: ReviewProps) {
  const [open, setOpen] = useState(false);
  const preview = review.ready.slice(0, PREVIEW);
  const more = review.ready.length - preview.length;

  return (
    <>
      <ul className={styles.counts} aria-label="Resumo da planilha">
        <li className={`${styles.count} ${styles.countReady}`}>
          <Icon name="check" />
          <strong>{review.ready.length}</strong> {review.ready.length === 1 ? "pronta" : "prontas"}
        </li>
        <li className={`${styles.count} ${styles.countReview}`}>
          <Icon name="alert" />
          <strong>{review.toReview.length}</strong> pra revisar
        </li>
        <li className={`${styles.count} ${styles.countRepeated}`}>
          <strong>{review.repeated.length}</strong>{" "}
          {review.repeated.length === 1 ? "repetida" : "repetidas"}
        </li>
      </ul>

      {review.alreadyInAction > 0 && (
        <Notice tone="teal" icon="info">
          {review.alreadyInAction} já {review.alreadyInAction === 1 ? "estava" : "estavam"} ·{" "}
          {plural(review.newCount, "nova", "novas")}. Quem já está na ação não entra de novo.
        </Notice>
      )}

      {review.toReview.length > 0 && (
        <section className={styles.panel} aria-labelledby="review-title">
          <h3 id="review-title" className={styles.panelTitle}>
            Precisam de revisão <span className={styles.badge}>{review.toReview.length}</span>
          </h3>
          <ul className={styles.lines}>
            {review.toReview.map((row) => {
              const left = skipped.includes(row.line);
              const wrong = invalidLines.includes(row.line);
              const bad = wrong || row.reason === "incomplete_email";
              return (
                <li key={row.line} className={styles.line}>
                  <div className={styles.who}>
                    <p className={styles.name}>{row.name || `Linha ${row.line}`}</p>
                    <p className={styles.reason}>
                      {wrong ? "Esse e-mail ainda não está certo" : REASON_TEXT[row.reason]}
                    </p>
                  </div>
                  {row.reason === "missing_name" ? (
                    <p className={styles.noName}>{row.email}</p>
                  ) : (
                    <input
                      type="email"
                      className={styles.email}
                      aria-label={`E-mail de ${row.name}`}
                      aria-invalid={bad && (wrong || (typed[row.line] ?? row.email) !== "") ? true : undefined}
                      placeholder="Adicionar e-mail"
                      value={typed[row.line] ?? row.email}
                      disabled={left}
                      onChange={(event) => onType(row.line, event.target.value)}
                    />
                  )}
                  <button
                    type="button"
                    className={styles.textButton}
                    aria-pressed={left}
                    onClick={() => onSkip(row.line)}
                  >
                    {left ? "Vai ficar de fora" : "Não importar"}
                  </button>
                </li>
              );
            })}
          </ul>
          <p className={styles.note}>
            Sem e-mail, a menina não recebe os questionários de acompanhamento.
          </p>
        </section>
      )}

      {review.repeated.length > 0 && (
        <section className={styles.panel} aria-labelledby="repeated-title">
          <h3 id="repeated-title" className={styles.panelTitle}>
            Repetida <span className={styles.badge}>{review.repeated.length}</span>
          </h3>
          {review.repeated.map((row) => (
            <p key={row.email} className={styles.repeated}>
              {row.name} aparece {row.count} vezes com o mesmo e-mail. Ela entra uma vez só.
            </p>
          ))}
        </section>
      )}

      <section className={styles.panel} aria-labelledby="ready-title">
        <button
          type="button"
          className={styles.toggle}
          aria-expanded={open}
          aria-controls="ready-body"
          onClick={() => setOpen(!open)}
        >
          <span id="ready-title" className={styles.panelTitle}>
            Prontas <span className={styles.badge}>{review.ready.length}</span>
          </span>
          <Icon name={open ? "chevron-up" : "chevron-down"} />
        </button>
        <div id="ready-body">
          {open ? (
            <DataTable
              caption="Inscritas prontas"
              columns={READY_COLUMNS}
              rows={review.ready}
              rowKey={(row) => String(row.line)}
            />
          ) : (
            <ul className={styles.names}>
              {preview.map((row) => (
                <li key={row.line} className={styles.nameChip}>
                  {row.name}
                </li>
              ))}
              {more > 0 && <li className={styles.more}>e mais {more}</li>}
            </ul>
          )}
        </div>
      </section>
    </>
  );
}
