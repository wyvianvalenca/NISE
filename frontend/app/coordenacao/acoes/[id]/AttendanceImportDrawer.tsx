"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/Button";
import { Drawer } from "@/components/Drawer";
import { Icon } from "@/components/Icon";
import { Notice } from "@/components/Notice";
import { Select } from "@/components/Select";
import {
  readImportFile,
  reviewImport,
  type ActionPage,
  type ImportErrorCode,
  type ImportMapping,
  type ImportRead,
} from "@/lib/coord-action-page";
import { matchImportedList, type ImportedList, type ImportedListError } from "@/lib/coord-attendance";
import styles from "./ImportDrawer.module.css";

type ErrorCode = ImportErrorCode | ImportedListError;

/** A clear message for each thing that can go wrong; nobody is marked in any of them. */
const ERROR_TEXT: Record<ErrorCode, string> = {
  unsupported_type: "Esse tipo de arquivo não serve. Use uma planilha em .csv ou .xlsx.",
  unreadable_file:
    "Não conseguimos ler esse arquivo. Confira se ele abre na sua planilha e escolha de novo.",
  empty_file: "A planilha não tem nenhuma linha com e-mail. Confira o arquivo.",
  too_large: "O arquivo é grande demais. O limite é 5 MB ou 2.000 linhas.",
  missing_columns: "Escolha uma coluna para o Nome e uma para o E-mail.",
  invalid_corrections: "Não foi possível ler a planilha. Escolha o arquivo de novo.",
  too_early: "A presença só pode ser marcada a partir do dia do evento.",
  already_concluded: "A presença já foi concluída. Ao fechar, a página é atualizada.",
  failed: "Não foi possível fazer isso agora. Ninguém foi marcado. Tente de novo.",
};

/** Both fields are required: the NISE reads the same two columns as the import of registered girls. */
const FIELDS: { key: "name" | "email"; label: string }[] = [
  { key: "name", label: "Nome" },
  { key: "email", label: "E-mail" },
];

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

type Props = {
  action: ActionPage;
  /** How many girls are registered ("23 inscritas"). */
  registeredCount: number;
  onClose: () => void;
  /** Closed after the server said the attendance is already concluded (another tab): the page loads again. */
  onConcluded: () => void;
  /** She confirmed: the registrations to mark on the page. Nothing is saved yet. */
  onMark: (registrationIds: number[]) => void;
};

/**
 * "Importar lista de presença" (K11 "marcando", #349, RF-F3.02). Same way of
 * choosing the file and suggesting the columns as the import of the registered
 * girls (#234), with the same two routes: the file goes to them and is thrown
 * away. Only the e-mails of its lines go on to the attendance route, which
 * answers who they mark. The page mounts it only while it is open.
 */
export function AttendanceImportDrawer({ action, registeredCount, onClose, onConcluded, onMark }: Props) {
  const pickerRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [sheet, setSheet] = useState<ImportRead | null>(null);
  const [mapping, setMapping] = useState<ImportMapping | null>(null);
  const [found, setFound] = useState<ImportedList | null>(null);
  const [error, setError] = useState<ErrorCode | null>(null);
  const [busy, setBusy] = useState<"reading" | "matching" | null>(null);
  /** Counts the questions made, so only the answer to the last one counts. */
  const asked = useRef(0);

  /** Reads the e-mail of every line of the file and asks who they mark. */
  async function match(chosen: File, columns: ImportMapping) {
    const turn = ++asked.current;
    setFound(null);
    if (!columns.name || !columns.email) {
      setBusy(null);
      return;
    }
    setBusy("matching");
    const review = await reviewImport(action.id, chosen, columns);
    let result = null;
    if (review.ok) {
      // Ready lines and lines to review all have their e-mail as typed; the
      // back-end compares it ignoring capitals and spaces.
      const emails = [...review.data.ready, ...review.data.toReview].map((row) => row.email);
      result = await matchImportedList(action.id, emails);
    }
    if (turn !== asked.current) return;
    setBusy(null);
    if (!review.ok) setError(review.error);
    else if (result && !result.ok) setError(result.error);
    else if (result) setFound(result.data);
  }

  async function pick(chosen: File) {
    asked.current += 1;
    setBusy("reading");
    setError(null);
    setFound(null);
    const result = await readImportFile(action.id, chosen);
    if (!result.ok) {
      setBusy(null);
      setError(result.error);
      return;
    }
    setFile(chosen);
    setSheet(result.data);
    setMapping(result.data.suggested);
    await match(chosen, result.data.suggested);
  }

  async function choose(key: "name" | "email", column: string) {
    if (!file || !mapping) return;
    const next = { ...mapping, [key]: column === "" ? null : column };
    setMapping(next);
    setError(null);
    await match(file, next);
  }

  function close() {
    if (error === "already_concluded") onConcluded();
    onClose();
  }

  const noEmailColumn = sheet !== null && mapping !== null && mapping.email === null;
  const count = found?.presentIds.length ?? 0;

  return (
    <Drawer
      open
      wide
      onClose={close}
      title="Importe a lista de presença"
      subtitle={`${action.name} · ${plural(registeredCount, "inscrita", "inscritas")}`}
      footer={
        <div className={styles.footer}>
          <button type="button" className={styles.textButton} onClick={close}>
            Cancelar
          </button>
          {found && (
            <Button disabled={count === 0} onClick={() => onMark(found.presentIds)}>
              Marcar {plural(count, "presente", "presentes")}
            </Button>
          )}
        </div>
      }
    >
      <input
        ref={pickerRef}
        type="file"
        accept=".csv,.xlsx"
        hidden
        aria-label="Lista de presença"
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
      <p className={styles.lead}>
        Use a lista que você tiver: planilha ou formulário de check-in. A NISE marca como presente
        quem ela achar pelo e-mail.
      </p>
      {busy === "reading" && (
        <p role="status" className={styles.lead}>
          Lendo a planilha…
        </p>
      )}
      {!sheet || !mapping ? (
        <div className={styles.picker}>
          <Button variant="secondary" onClick={() => pickerRef.current?.click()}>
            <Icon name="upload" />
            Escolher planilha
          </Button>
          <p className={styles.hint}>Arquivo .csv ou .xlsx, até 5 MB.</p>
        </div>
      ) : (
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
          <section aria-labelledby="presence-columns-title" className={styles.columns}>
            <h3 id="presence-columns-title" className={styles.sectionTitle}>
              Confira as colunas
            </h3>
            <p className={styles.lead}>
              Reconhecemos as colunas do arquivo. Ajuste se alguma estiver trocada.
            </p>
            {noEmailColumn && (
              <div role="alert">
                <Notice tone="pink" icon="alert">
                  Não achamos uma coluna de e-mail nessa planilha. Escolha qual coluna tem o e-mail
                  das meninas.
                </Notice>
              </div>
            )}
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
                        <span className={styles.kind}>obrigatório</span>
                      </th>
                      <td className={styles.cell}>
                        <Select
                          label={`Coluna para ${field.label}`}
                          className={styles.select}
                          value={column ?? ""}
                          onChange={(event) => void choose(field.key, event.target.value)}
                        >
                          <option value="">Escolha a coluna</option>
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
          </section>
          {busy === "matching" && (
            <p role="status" className={styles.lead}>
              Procurando as inscritas…
            </p>
          )}
          {found && (
            <div role="status">
              <Notice tone="teal" icon="info">
                {count === 0
                  ? "Nenhuma linha da lista é de uma inscrita da ação."
                  : `${plural(count, "inscrita encontrada", "inscritas encontradas")}.`}
                {found.notFoundCount > 0 &&
                  ` ${plural(found.notFoundCount, "linha não está", "linhas não estão")} entre as inscritas e ${found.notFoundCount === 1 ? "fica" : "ficam"} de fora.`}
              </Notice>
            </div>
          )}
        </>
      )}
    </Drawer>
  );
}
