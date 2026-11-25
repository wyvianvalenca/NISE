"use client";

// Os quatro passos da exportação (#375, RF-F24.30). Quem controla o passo é
// este componente: os passos do topo são só texto, e ela anda com os botões.

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/Button";
import { Loading } from "@/components/Loading";
import { Notice } from "@/components/Notice";
import { Select } from "@/components/Select";
import {
  BASE_COLUMNS,
  countdownLabel,
  type Cut,
  type CutOptions,
  DEFAULT_MODEL,
  type ExportedFile,
  generateExport,
  getCutOptions,
  getHistory,
  getPreview,
  getSummary,
  type HistoryItem,
  KIND_LABELS,
  type ModelId,
  modelName,
  NEVER_LEAVES,
  NO_CUT,
  NO_PACKAGES,
  noActionEnters,
  PACKAGES,
  type PackageId,
  type Preview,
  STEPS,
  type Summary,
  summaryLabel,
} from "@/lib/exportar";
import { ModelCards } from "./ModelCards";
import { PackageCard } from "./PackageCard";
import { ExportHistory } from "./ExportHistory";
import styles from "./ExportWizard.module.css";
import { SummaryBar } from "./SummaryBar";

export function ExportWizard() {
  const [step, setStep] = useState(0);
  const [file, setFile] = useState<ExportedFile | null>(null);
  const [cut, setCut] = useState<Cut>(NO_CUT);
  const [options, setOptions] = useState<CutOptions | null>(null);
  const [optionsFailed, setOptionsFailed] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [summaryFailed, setSummaryFailed] = useState(false);
  // No card checked at first: with no model, "Do meu jeito" counts (D-104), and
  // it starts with no package checked (RF-F24.10).
  const [packages, setPackages] = useState<readonly PackageId[]>(NO_PACKAGES);
  const [model, setModel] = useState<ModelId | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    getCutOptions()
      .then(setOptions)
      .catch(() => setOptionsFailed(true));
  }, []);

  // The bar follows the cut and the packages ("Grupos de comparação" brings the
  // girls with no action, D-106). `current` drops an answer that arrives late.
  useEffect(() => {
    let current = true;
    getSummary(cut, packages)
      .then((loaded) => current && setSummary(loaded))
      .catch(() => current && setSummaryFailed(true));
    return () => {
      current = false;
    };
  }, [cut, packages]);

  function choose(field: keyof Cut, value: string) {
    setCut((current) => ({ ...current, [field]: value }));
    setSummary(null);
    setSummaryFailed(false);
  }

  const nothingMatches = summary !== null && summary.rows === 0;
  const withNoAction = noActionEnters(packages);
  const noActionNotice = summary !== null && withNoAction && summary.noAction > 0 && (
    <NoActionNotice count={summary.noAction} />
  );

  // Ao trocar de passo, o foco vai para o título dele (teclado e leitor de tela).
  useEffect(() => {
    headingRef.current?.focus();
  }, [step]);

  // The model already turns its packages on; she changes them in the next step.
  function chooseModel(id: ModelId) {
    const chosen = options?.models.find((item) => item.value === id);
    if (!chosen) return;
    setModel(id);
    setPackages(chosen.packages);
  }

  function toggle(id: PackageId, on: boolean) {
    setPackages((current) => (on ? [...current, id] : current.filter((item) => item !== id)));
  }

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
          <>
            {optionsFailed && (
              <p role="alert" className={styles.problem}>
                Não foi possível carregar as opções do recorte.
              </p>
            )}
            <h3 className={styles.baseTitle}>Pra que você vai usar?</h3>
            <p className={styles.muted}>
              O modelo já escolhe as colunas certas. Dá pra mudar no próximo passo.
            </p>
            <ModelCards value={model} onChange={chooseModel} disabled={options === null} />
            <div className={styles.selectors}>
              <Select
                label="Período"
                value={cut.year}
                onChange={(event) => choose("year", event.target.value)}
              >
                <option value="">Todo o período</option>
                {options?.years.map((year) => (
                  <option key={year} value={year}>
                    Ano de {year}
                  </option>
                ))}
              </Select>
              <Select
                label="Ação"
                value={cut.actionId}
                onChange={(event) => choose("actionId", event.target.value)}
              >
                <option value="">Todas as ações</option>
                {options?.actions.map((action) => (
                  <option key={action.id} value={action.id}>
                    {action.name}
                  </option>
                ))}
              </Select>
              <Select
                label="Tipo"
                value={cut.type}
                onChange={(event) => choose("type", event.target.value)}
              >
                <option value="">Todos os tipos</option>
                {options?.types.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </Select>
              <Select
                label="Tags"
                value={cut.tag}
                onChange={(event) => choose("tag", event.target.value)}
              >
                <option value="">Todas as tags</option>
                {options?.tags.map((tag) => (
                  <option key={tag.value} value={tag.value}>
                    {tag.label}
                  </option>
                ))}
              </Select>
            </div>
            <SummaryOrError summary={summary} failed={summaryFailed} withNoAction={withNoAction} />
            {noActionNotice}
            {nothingMatches && (
              <p role="status" className={styles.muted}>
                Nenhuma linha neste recorte. Mude as escolhas para continuar.
              </p>
            )}
            <div className={styles.actions}>
              <Button onClick={() => setStep(1)} disabled={summary === null || nothingMatches}>
                Continuar
              </Button>
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <p className={styles.modelChip}>
              Modelo: <strong>{modelName(model ?? DEFAULT_MODEL)}</strong>
              <button type="button" className={styles.change} onClick={() => setStep(0)}>
                trocar
              </button>
            </p>
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
            {PACKAGES.map((item) => (
              <PackageCard
                key={item.id}
                item={item}
                on={packages.includes(item.id)}
                onChange={(on) => toggle(item.id, on)}
              />
            ))}
            <p className={styles.summary} aria-live="polite">
              {summaryLabel(packages)}
            </p>
            <SummaryOrError summary={summary} failed={summaryFailed} withNoAction={withNoAction} />
            {noActionNotice}
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
            cut={cut}
            packages={packages}
            model={model}
            onBack={back}
            onDone={(made) => {
              setFile(made);
              setStep(3);
            }}
          />
        )}

        {step === 3 && file && (
          <Done file={file} packages={packages} cut={cut} model={model} onNewFile={setFile} />
        )}
      </section>
    </>
  );
}

/**
 * RF-F24.31: the girls with no action (an account and no attendance at any action,
 * D-105) also go in the file, and she is told how many. A girl who missed an action
 * of the group that is already concluded is not one of them: she has the
 * "nao_compareceu" row of that action, but only when the cut keeps that action. The
 * cut does not change how many have no action, and the notice says so (D-107). The
 * text follows `no_action_filters` in the back end.
 */
function NoActionNotice({ count }: { count: number }) {
  return (
    <Notice tone="pink" icon="info">
      <strong>
        {count === 1
          ? "Entra também 1 menina sem ação"
          : `Entram também as ${count} meninas sem ação`}
      </strong>
      <br />
      Têm conta na NISE, mas ainda não estiveram presentes em nenhuma ação. Quem faltou a uma
      ação já concluída do grupo não conta aqui: ela aparece como nao_compareceu na linha dessa
      ação, se a ação estiver no recorte. Entram em qualquer recorte: os filtros do primeiro
      passo (período, ação, tipo e tag) não mudam quantas são. Ficam na planilha com
      grupo_comparacao = sem_acao e as colunas da ação vazias, pra comparar interesse e
      ingresso.
    </Notice>
  );
}

function SummaryOrError({
  summary,
  failed,
  withNoAction,
}: {
  summary: Summary | null;
  failed: boolean;
  withNoAction: boolean;
}) {
  if (failed) {
    return (
      <p role="alert" className={styles.problem}>
        Não foi possível calcular o tamanho do arquivo.
      </p>
    );
  }
  return <SummaryBar summary={summary} withNoAction={withNoAction} />;
}

function Review({
  cut,
  packages,
  model,
  onBack,
  onDone,
}: {
  cut: Cut;
  packages: readonly PackageId[];
  model: ModelId | null;
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
    getPreview(packages, cut)
      .then((loaded) => current && setPreview(loaded))
      .catch(() => current && setFailed(true));
    return () => {
      current = false;
    };
  }, [packages, cut, attempt]);

  function retry() {
    setFailed(false);
    setPreview(null);
    setAttempt((value) => value + 1);
  }

  async function generate() {
    setGenerating(true);
    setGenerateFailed(false);
    try {
      onDone(await generateExport(packages, cut, model));
    } catch {
      setGenerateFailed(true);
      setGenerating(false);
    }
  }

  return (
    <>
      <h3 className={styles.baseTitle}>Raio-X do arquivo</h3>
      <p className={styles.summary}>{summaryLabel(packages)}</p>
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
                  <tr key={rowIndex} className={preview.noAction[rowIndex] ? styles.noActionRow : undefined}>
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
  cut,
  packages,
  model,
  onNewFile,
}: {
  file: ExportedFile;
  cut: Cut;
  packages: readonly PackageId[];
  model: ModelId | null;
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
      onNewFile(await generateExport(packages, cut, model));
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
        {file.rowCount} linhas · {file.columnCount} colunas · UTF-8, separador “;” (CSV para abrir
        no Excel ou no Google Sheets)
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
