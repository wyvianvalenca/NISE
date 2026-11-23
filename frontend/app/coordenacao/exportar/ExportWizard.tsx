"use client";

// Os quatro passos da exportação (#375, RF-F24.30). Quem controla o passo é
// este componente: os passos do topo são só texto, e ela anda com os botões.

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/Button";
import { Loading } from "@/components/Loading";
import { Notice } from "@/components/Notice";
import {
  BASE_COLUMNS,
  countdownLabel,
  type ExportedFile,
  generateExport,
  getHistory,
  getPreview,
  type HistoryItem,
  KIND_LABELS,
  NEVER_LEAVES,
  type Preview,
  STEPS,
} from "@/lib/exportar";
import { ExportHistory } from "./ExportHistory";
import styles from "./ExportWizard.module.css";

export function ExportWizard() {
  const [step, setStep] = useState(0);
  const [file, setFile] = useState<ExportedFile | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Ao trocar de passo, o foco vai para o título dele (teclado e leitor de tela).
  useEffect(() => {
    headingRef.current?.focus();
  }, [step]);

  function back() {
    setStep((current) => current - 1);
  }

  return (
    <>
      <ol className={styles.steps} aria-label="Passos da exportação">
        {STEPS.map((label, index) => (
          <li
            key={label}
            className={
              index === step ? styles.stepCurrent : index < step ? styles.stepDone : styles.step
            }
            aria-current={index === step ? "step" : undefined}
          >
            <span className={styles.stepNumber}>{index + 1}</span>
            {label}
          </li>
        ))}
      </ol>

      <section className={styles.panel} aria-labelledby="export-step-title">
        <h2 id="export-step-title" ref={headingRef} tabIndex={-1} className={styles.stepTitle}>
          {STEPS[step]}
        </h2>

        {step === 0 && (
          <div className={styles.actions}>
            <Button onClick={() => setStep(1)}>Continuar</Button>
          </div>
        )}

        {step === 1 && (
          <>
            <div className={styles.baseCard}>
              <h3 className={styles.baseTitle}>Base · obrigatório</h3>
              <p className={styles.muted}>
                Sempre vai: identifica a linha sem identificar a menina.
              </p>
              <ul className={styles.chips}>
                {BASE_COLUMNS.map((column) => (
                  <li key={column} className={styles.chip}>
                    {column}
                  </li>
                ))}
              </ul>
            </div>
            <div className={styles.actions}>
              <Button variant="secondary" onClick={back}>
                Voltar
              </Button>
              <Button onClick={() => setStep(2)}>Continuar</Button>
            </div>
          </>
        )}

        {step === 2 && (
          <Review
            onBack={back}
            onDone={(made) => {
              setFile(made);
              setStep(3);
            }}
          />
        )}

        {step === 3 && file && <Done file={file} onNewFile={setFile} />}
      </section>
    </>
  );
}

function Review({
  onBack,
  onDone,
}: {
  onBack: () => void;
  onDone: (file: ExportedFile) => void;
}) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [generateFailed, setGenerateFailed] = useState(false);

  useEffect(() => {
    let current = true;
    getPreview()
      .then((loaded) => current && setPreview(loaded))
      .catch(() => current && setFailed(true));
    return () => {
      current = false;
    };
  }, [attempt]);

  function retry() {
    setFailed(false);
    setPreview(null);
    setAttempt((value) => value + 1);
  }

  async function generate() {
    setGenerating(true);
    setGenerateFailed(false);
    try {
      onDone(await generateExport());
    } catch {
      setGenerateFailed(true);
      setGenerating(false);
    }
  }

  return (
    <>
      <h3 className={styles.baseTitle}>Raio-X do arquivo</h3>
      {failed && (
        <div role="alert" className={styles.problem}>
          <p>Não foi possível montar a prévia do arquivo.</p>
          <Button variant="secondary" onClick={retry}>
            Tentar novamente
          </Button>
        </div>
      )}
      {!failed && !preview && <Loading />}
      {preview && (
        <>
          <p className={styles.muted}>
            {preview.rows.length} de {preview.totalRows} linhas do arquivo que vai sair. Os códigos
            mudam a cada exportação.
          </p>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <caption className={styles.srOnly}>Linhas do arquivo que vai sair</caption>
              <thead>
                <tr>
                  {preview.columns.map((column) => (
                    <th key={column.key} scope="col">
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row, rowIndex) => (
                  <tr key={rowIndex}>
                    {row.map((cell, cellIndex) => (
                      <td key={cellIndex} className={styles[preview.columns[cellIndex].kind]}>
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className={styles.legend} aria-label="Legenda das cores">
            {(Object.keys(KIND_LABELS) as (keyof typeof KIND_LABELS)[]).map((kind) => (
              <li key={kind} className={styles.legendItem}>
                <span className={`${styles.swatch} ${styles[kind]}`} aria-hidden="true" />
                {KIND_LABELS[kind]}
              </li>
            ))}
          </ul>
        </>
      )}

      <div className={styles.never}>
        <h3 className={styles.baseTitle}>Nunca sai</h3>
        <ul className={styles.chips}>
          {NEVER_LEAVES.map((item) => (
            <li key={item} className={styles.chip}>
              {item}
            </li>
          ))}
        </ul>
        <p className={styles.example}>
          Exemplo inventado: <strong>Maria Exemplo</strong> chega e sai como{" "}
          <strong>M-Q4T2</strong>.
        </p>
      </div>

      {generateFailed && (
        <Notice tone="pink" icon="info">
          Não foi possível gerar o arquivo. Tente novamente.
        </Notice>
      )}
      <div className={styles.actions}>
        <Button variant="secondary" onClick={onBack} disabled={generating}>
          Voltar
        </Button>
        <Button
          onClick={generate}
          loading={generating}
          loadingLabel="Gerando…"
          disabled={!preview}
        >
          Gerar arquivo
        </Button>
      </div>
    </>
  );
}

function Done({
  file,
  onNewFile,
}: {
  file: ExportedFile;
  onNewFile: (file: ExportedFile) => void;
}) {
  const expiresAt = new Date(file.expiresAt).getTime();
  const [now, setNow] = useState(() => Date.now());
  const [again, setAgain] = useState<"idle" | "loading" | "failed">("idle");
  const msLeft = expiresAt - now;

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [file.id]);

  async function generateAgain() {
    setAgain("loading");
    try {
      onNewFile(await generateExport());
      setNow(Date.now());
      setAgain("idle");
    } catch {
      setAgain("failed");
    }
  }

  return (
    <div className={styles.done}>
      <p className={styles.doneTitle}>Arquivo pronto</p>
      <p className={styles.muted}>Ficou registrado no histórico do grupo.</p>
      <p className={styles.filename}>{file.filename}</p>
      <p className={styles.muted}>
        {file.rowCount} linhas · {file.columnCount} colunas · UTF-8, separador “;” (abre certinho
        no Excel e no Sheets)
      </p>

      {msLeft > 0 ? (
        <>
          <a
            className={styles.download}
            href={`/api/coordinator/exports/${file.id}/file`}
            download={file.filename}
          >
            Baixar
          </a>
          <p className={styles.muted}>
            {countdownLabel(msLeft)} pro link expirar · depois é só gerar de novo
          </p>
        </>
      ) : (
        <>
          <p role="status">O link expirou. Gere o arquivo de novo para baixar.</p>
          <Button onClick={generateAgain} loading={again === "loading"} loadingLabel="Gerando…">
            Gerar de novo
          </Button>
          {again === "failed" && (
            <p role="alert">Não foi possível gerar o arquivo. Tente novamente.</p>
          )}
        </>
      )}

      <History fileId={file.id} />
    </div>
  );
}

/** The panel under "Pronto". It asks again when a new file is made, so it shows at the top. */
function History({ fileId }: { fileId: number }) {
  const [items, setItems] = useState<HistoryItem[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let current = true;
    getHistory()
      .then((history) => {
        if (!current) return;
        setItems(history);
        setFailed(false);
      })
      .catch(() => current && setFailed(true));
    return () => {
      current = false;
    };
  }, [fileId]);

  if (failed) return <p role="alert">Não foi possível carregar o histórico de exportações.</p>;
  if (items === null) return <Loading label="Carregando o histórico…" />;
  return <ExportHistory items={items} />;
}
