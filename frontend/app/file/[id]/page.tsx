"use client";

// A06·4a · Atividade: o detalhe de uma atividade do filé e os botões de status.
// Atende RF-F10.08 e RF-F11.04 (issues #119 e #120). Usa os dados de teste de lib/atividade.ts.

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { Button } from "@/components/Button";
import { Icon } from "@/components/Icon";
import { Notice } from "@/components/Notice";
import { Tag } from "@/components/Tag";
import {
  getActivity,
  removeActivity,
  setActivityStatus,
  type ActivityDetail,
  type ActivityStatus,
} from "@/lib/atividade";
import { BANDS } from "@/lib/descobrir";
import styles from "./atividade.module.css";

const FILE_PATH = "/file";

export default function ActivityPage() {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href={FILE_PATH} className={styles.back}>
          <Icon name="left" size={18} />
          Seu filé
        </Link>
      </header>

      <div className={styles.scroll}>
        <main className={styles.main}>
          {/* O id vem da URL; o Suspense deixa o resto da tela pronto antes dele. */}
          <Suspense fallback={<Loading />}>
            <ActivityLoader />
          </Suspense>
        </main>
      </div>
    </div>
  );
}

function Loading() {
  return (
    <p className={styles.status} aria-live="polite">
      Carregando…
    </p>
  );
}

function ActivityLoader() {
  const { id } = useParams<{ id: string }>();
  // undefined: carregando. null: não está no filé.
  const [activity, setActivity] = useState<ActivityDetail | null | undefined>(undefined);

  useEffect(() => {
    let current = true;
    getActivity(id).then((result) => {
      if (current) setActivity(result);
    });
    return () => {
      current = false;
    };
  }, [id]);

  if (activity === undefined) return <Loading />;
  if (activity === null) return <p className={styles.status}>Essa atividade não está no seu filé.</p>;
  return <Detail activity={activity} onChange={setActivity} />;
}

const STATUS_LABELS: Record<ActivityStatus, string> = {
  next: "Próxima aventura",
  in_progress: "Em andamento",
  concluded: "Concluído",
};

type DetailProps = {
  activity: ActivityDetail;
  onChange: (activity: ActivityDetail) => void;
};

function Detail({ activity, onChange }: DetailProps) {
  const router = useRouter();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [saving, setSaving] = useState<"start" | "conclude" | "remove" | null>(null);
  const [error, setError] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  const site = activity.kindCode === "course" ? "site do curso" : "site";
  const siteLabel = {
    next: `Ir pro ${site}`,
    in_progress: `Continuar no ${site}`,
    concluded: `Ver no ${site}`,
  }[activity.status];

  async function start() {
    setSaving("start");
    setError(false);
    try {
      onChange(await setActivityStatus(activity.id, "in_progress"));
      setAnnouncement("Atividade marcada como iniciada.");
      // O botão some e dá lugar a outro; o foco volta para o título para não se perder.
      titleRef.current?.focus();
    } catch {
      setError(true);
    } finally {
      setSaving(null);
    }
  }

  async function conclude() {
    setSaving("conclude");
    setError(false);
    try {
      await setActivityStatus(activity.id, "concluded");
      router.push(`/file/${activity.id}/concluida`);
    } catch {
      setError(true);
      setSaving(null);
    }
  }

  // Leva de volta ao filé, como sugerido na #120. A confirmar com o design.
  async function remove() {
    setSaving("remove");
    setError(false);
    try {
      await removeActivity(activity.id);
      router.push(FILE_PATH);
    } catch {
      setError(true);
      setSaving(null);
    }
  }

  return (
    <>
      <div className={styles.visual}>
        <span className={styles.kind}>
          <Icon name="code" />
          {activity.kind}
        </span>
        <span className={styles.iconTile}>
          <Icon name="code-lg" size={42} />
        </span>
        <span className={`${styles.statusChip} ${styles[activity.status]}`}>
          {activity.status === "concluded" && <Icon name="check-lg" size={15} />}
          <span className={styles.srOnly}>Status: </span>
          {STATUS_LABELS[activity.status]}
        </span>
      </div>

      <p className={styles.topic}>
        <span className={styles.dot} aria-hidden="true" />
        {activity.topic} · {BANDS[activity.band].title}
      </p>
      <h1 ref={titleRef} tabIndex={-1} className={styles.title}>
        {activity.title}
      </h1>
      <p className={styles.source}>{activity.source}</p>

      <ul className={styles.chips} aria-label="Detalhes">
        <li className={styles.chip}>{activity.format}</li>
        <li className={styles.chip}>{activity.duration}</li>
        <li>{activity.cost ? <span className={styles.chip}>{activity.cost}</span> : <Tag variant="pink">Grátis</Tag>}</li>
        {activity.minAge !== null && (
          <li className={styles.chip}>
            {activity.minAge}+<span className={styles.srOnly}> anos</span>
          </li>
        )}
      </ul>

      <p className={styles.description}>{activity.description}</p>

      {activity.reason && (
        <Notice tone="pink" icon="sparkle">
          <strong>Por que pra você:</strong> {activity.reason}
        </Notice>
      )}

      <div className={styles.actions}>
        <a href={activity.url} target="_blank" rel="noopener noreferrer" className={styles.siteButton}>
          <Icon name="external" size={18} />
          {siteLabel}
          <span className={styles.srOnly}> (abre em outra aba)</span>
        </a>

        {activity.status === "next" && (
          <Button
            className={styles.statusButton}
            onClick={start}
            loading={saving === "start"}
            loadingLabel="Salvando…"
            disabled={saving !== null}
          >
            <Icon name="play-sm" />
            Marcar como iniciada
          </Button>
        )}
        {activity.status === "in_progress" && (
          <Button
            className={styles.statusButton}
            onClick={conclude}
            loading={saving === "conclude"}
            loadingLabel="Salvando…"
            disabled={saving !== null}
          >
            <Icon name="check-lg" />
            Marcar como concluída
          </Button>
        )}

        {activity.status !== "concluded" && (
          <button
            type="button"
            className={styles.remove}
            onClick={remove}
            disabled={saving !== null}
            aria-busy={saving === "remove" || undefined}
          >
            {saving === "remove" ? "Tirando…" : "Tirar do filé"}
          </button>
        )}

        {error && (
          <p className={styles.error} role="alert">
            Não deu para salvar agora. Tente de novo.
          </p>
        )}
      </div>

      <p className={styles.srOnly} aria-live="polite">
        {announcement}
      </p>
    </>
  );
}
