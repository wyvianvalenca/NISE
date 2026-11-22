import { Icon } from "@/components/Icon";
import { MetaItem } from "@/components/MetaItem";
import { Tag } from "@/components/Tag";
import {
  dateTileParts,
  dayMonthLabel,
  formatLabel,
  girlsLabel,
  shortVisibilityLabel,
  typeLabel,
} from "@/lib/coord-action-labels";
import type { ActionStatus, CoordAction } from "@/lib/coord-actions";
import Link from "next/link";
import { PendingLink } from "./PendingLink";
import { RowMenu } from "./RowMenu";
import styles from "./ActionRow.module.css";

/** How filled the left bar is: the further along the flow, the darker (Figma: Progresso). */
const PROGRESS: Record<ActionStatus, number> = {
  awaiting_registrations: 0.25,
  awaiting_event: 0.5,
  awaiting_attendance: 0.75,
  concluded: 1,
};

/**
 * The button of each status (RN-37). The status itself comes ready from the
 * back-end; the screen only picks the label.
 */
function StatusButtons({ status, id }: { status: ActionStatus; id: string }) {
  const href = `/coordenacao/acoes/${id}`;
  switch (status) {
    case "awaiting_registrations":
      return (
        <PendingLink variant="secondary" href={href}>
          <Icon name="upload" size={16} />
          Importar inscritas
        </PendingLink>
      );
    case "awaiting_event":
      return <PendingLink variant="secondary" href={href}>Ver inscritas</PendingLink>;
    case "awaiting_attendance":
      return <PendingLink variant="primary">Marcar presença</PendingLink>;
    case "concluded":
      return (
        <>
          <PendingLink variant="text">Ver resumo</PendingLink>
          <PendingLink variant="text">Ver avaliação</PendingLink>
        </>
      );
  }
}

type ActionRowProps = {
  action: CoordAction;
  /** Asked when she picks "Excluir ação" in the row menu. */
  onDelete: (action: CoordAction) => void;
};

/**
 * One row of the list (Figma: Ação / ...). An action waiting for attendance is
 * highlighted with the reminder line. "Excluir ação" is in the "..." menu only
 * while attendance is not registered (RF-F30.12, RN-15); the editing item comes
 * with its own story.
 */
export function ActionRow({ action, onDelete }: ActionRowProps) {
  const date = dateTileParts(action.startsOn);
  const needsAttendance = action.status === "awaiting_attendance";
  const menuItems =
    action.attendanceRegisteredAt === null
      ? [{ label: "Excluir ação", onSelect: () => onDelete(action) }]
      : [];

  return (
    <li className={needsAttendance ? `${styles.row} ${styles.attention}` : styles.row}>
      <span
        aria-hidden="true"
        className={styles.progress}
        style={{ opacity: PROGRESS[action.status] }}
      />
      <div className={styles.date}>
        <span className={styles.day}>{date.day}</span>
        <span className={styles.month}>{date.month}</span>
        <span className={styles.weekday}>{date.weekday}</span>
      </div>
      <div className={styles.info}>
        <h3 className={styles.name}>
          <Link href={`/coordenacao/acoes/${action.id}`} className={styles.nameLink}>
            {action.name}
          </Link>
        </h3>
        <div className={styles.details}>
          <Tag variant="surface">{typeLabel(action.type)}</Tag>
          <MetaItem icon="pin">{formatLabel(action)}</MetaItem>
          <MetaItem icon={action.visibility === "open" ? "eye" : "lock"}>
            {shortVisibilityLabel(action.visibility)}
          </MetaItem>
        </div>
        {needsAttendance && (
          <p className={styles.reminder}>
            <Icon name="alert" />
            Aconteceu em {dayMonthLabel(action.endsOn)}. Falta marcar a presença.
          </p>
        )}
      </div>
      <p className={action.status === "awaiting_registrations" ? styles.girlsEmpty : styles.girls}>
        {girlsLabel(action)}
      </p>
      <div className={styles.buttons}>
        <StatusButtons status={action.status} id={action.id} />
      </div>
      <RowMenu actionName={action.name} items={menuItems} />
    </li>
  );
}
