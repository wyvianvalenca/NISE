"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/Button";
import { Icon } from "@/components/Icon";
import { MetaItem } from "@/components/MetaItem";
import { Modal } from "@/components/Modal";
import { Tag } from "@/components/Tag";
import {
  dateRangeLabel,
  statusLabel,
  timeRangeLabel,
  typeLabel,
  visibilityLabel,
} from "@/lib/coord-action-labels";
import { deleteAction, type ActionPage } from "@/lib/coord-action-page";
import styles from "./ActionHeader.module.css";

/** "sáb, 24/10/2026 · 14h às 17h"; without times, just the date. */
function whenLabel(action: ActionPage): string {
  const date = dateRangeLabel(action.startsOn, action.endsOn);
  return action.startsAtTime && action.endsAtTime
    ? `${date} · ${timeRangeLabel(action.startsAtTime, action.endsAtTime)}`
    : date;
}

function whereLabel(action: ActionPage): string {
  return action.format === "online" || !action.cityName
    ? "Online"
    : `Presencial · ${action.cityName}`;
}

/**
 * Top of the action page (K11): back link, status, name, the meta line and the
 * buttons "Editar ação" and "Excluir ação" (D-47: both stay in the header).
 * "Excluir ação" is hidden once the attendance is saved (RF-F30.12), and both
 * buttons are hidden on the concluded page.
 */
export function ActionHeader({ action }: { action: ActionPage }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function confirmDelete() {
    setBusy(true);
    setFailed(false);
    try {
      const result = await deleteAction(action.id);
      if (result === "has_attendance") {
        // The attendance was saved meanwhile: the action stays.
        setFailed(true);
        setBusy(false);
        return;
      }
      router.push("/coordenacao/acoes");
    } catch {
      setFailed(true);
      setBusy(false);
    }
  }

  return (
    <header className={styles.header}>
      <Link href="/coordenacao/acoes" className={styles.back}>
        <Icon name="left" />
        Ações
      </Link>
      <div className={styles.row}>
        <div className={styles.titleBlock}>
          <span className={styles.status}>
            <Tag variant="teal">{statusLabel(action.status)}</Tag>
          </span>
          <h1 className={styles.name}>{action.name}</h1>
          <div className={styles.meta}>
            <Tag variant="surface">{typeLabel(action.type)}</Tag>
            <MetaItem icon="calendar-sm">{whenLabel(action)}</MetaItem>
            <MetaItem icon="pin">{whereLabel(action)}</MetaItem>
            <MetaItem icon={action.visibility === "open" ? "eye" : "lock"}>
              {action.visibility === "open" ? "Aberta ao público" : visibilityLabel("closed")}
            </MetaItem>
          </div>
        </div>
        <div className={styles.buttons}>
          {/* The concluded page has no "Editar ação" (Figma K11 concluída, #348). */}
          {action.status !== "concluded" && (
            <Link href={`/coordenacao/acoes/${action.id}/editar`} className={styles.edit}>
              <Icon name="edit" />
              Editar ação
            </Link>
          )}
          {action.canDelete && (
            <Button variant="secondary" onClick={() => setConfirming(true)}>
              <Icon name="trash" />
              Excluir ação
            </Button>
          )}
        </div>
      </div>

      <Modal
        open={confirming}
        onClose={() => {
          setConfirming(false);
          setFailed(false);
        }}
        title="Excluir esta ação?"
        actions={
          <>
            <Button variant="secondary" onClick={() => setConfirming(false)}>
              Cancelar
            </Button>
            <Button loading={busy} loadingLabel="Excluindo…" onClick={confirmDelete}>
              Excluir ação
            </Button>
          </>
        }
      >
        <p>
          As inscritas saem da ação e ela deixa de existir. O cadastro de cada menina continua na
          NISE.
        </p>
        {failed && (
          <p role="alert" className={styles.error}>
            Não deu pra excluir a ação. Se a presença já foi registrada, ela fica. Tente de novo.
          </p>
        )}
      </Modal>
    </header>
  );
}
