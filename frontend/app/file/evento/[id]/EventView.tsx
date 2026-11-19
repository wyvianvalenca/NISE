import { Icon, type IconName } from "@/components/Icon";
import { Notice } from "@/components/Notice";
import { Tag } from "@/components/Tag";
import { BANDS } from "@/lib/descobrir";
import {
  daysLeftText,
  formatDate,
  formatEventDays,
  formatWeekdays,
  organizerLine,
  typeIcon,
  typeLabel,
  type EventDetail,
  type EventStatus,
} from "@/lib/evento";
import shared from "../../[id]/atividade.module.css";
import styles from "./evento.module.css";

const STATUS_LABELS: Record<EventStatus, string> = {
  next: "Próxima aventura",
  in_progress: "Em andamento",
  concluded: "Concluído",
};

type EventViewProps = {
  event: EventDetail;
  /**
   * "Já me inscrevi". Sem ela, o botão aparece desabilitado: a ação chega com a #182.
   */
  onMarkSignedUp?: () => void;
  /** "Tirar do filé". Sem ela, o botão aparece desabilitado: a ação chega com a #182. */
  onRemove?: () => void;
};

/** O detalhe do evento (Figma A06·4b), versão "Próxima aventura". */
export function EventView({ event, onMarkSignedUp, onRemove }: EventViewProps) {
  const icons = typeIcon(event.type);

  return (
    <>
      <div className={shared.visual}>
        <span className={shared.kind}>
          <Icon name={icons.small} size={13} />
          {typeLabel(event.type)}
        </span>
        <span className={shared.iconTile}>
          <Icon name={icons.large} size={42} />
        </span>
        <span className={`${shared.statusChip} ${shared[event.status]}`}>
          {event.status === "concluded" && <Icon name="check-lg" size={15} />}
          <span className={shared.srOnly}>Status: </span>
          {STATUS_LABELS[event.status]}
        </span>
      </div>

      <p className={shared.topic}>
        <span className={shared.dot} aria-hidden="true" />
        {event.topic} · {BANDS[event.band].title}
      </p>
      <h1 tabIndex={-1} className={shared.title}>
        {event.title}
      </h1>
      <p className={shared.source}>{organizerLine(event)}</p>

      <ul className={styles.summary} aria-label="Quando e onde">
        <SummaryRow
          icon="calendar"
          main={formatEventDays(event.startsOn, event.endsOn)}
          sub={formatWeekdays(event.startsOn, event.endsOn)}
        />
        <SummaryRow
          icon="pin"
          main={event.city ?? "Online"}
          sub={
            event.city
              ? "Local divulgado na inscrição"
              : "Link divulgado na inscrição"
          }
        />
        {event.registrationsOpen ? (
          <SummaryRow
            icon="clock"
            main={`Inscrições até ${formatDate(event.deadline)}`}
            sub={daysLeftText(event.daysLeft)}
          />
        ) : (
          // RN-36: as inscrições fecharam, mas o evento continua no filé dela.
          <SummaryRow
            icon="clock"
            main={`Inscrições foram até ${formatDate(event.deadline)}`}
            sub="As inscrições já fecharam"
          />
        )}
      </ul>

      <ul className={shared.chips} aria-label="Detalhes">
        <li>
          {event.cost ? (
            <span className={shared.chip}>{event.cost}</span>
          ) : (
            <Tag variant="pink">Grátis</Tag>
          )}
        </li>
        {event.stage && <li className={shared.chip}>{event.stage}</li>}
        {event.prerequisites.map((item) => (
          <li key={item} className={shared.chip}>
            {item}
          </li>
        ))}
      </ul>

      {/* RN-19: a inscrição acontece fora da NISE, e a NISE não envia os dados dela. */}
      <Notice>
        A inscrição é feita no site dos organizadores. Seus dados da NISE não
        são enviados.
      </Notice>

      <div className={`${shared.actions} ${styles.actions}`}>
        <a
          href={event.registrationUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={shared.siteButton}
        >
          <Icon name="external" size={18} />
          Ir para inscrição
          <span className={shared.srOnly}> (abre em outra aba)</span>
        </a>

        <div className={styles.footer}>
          <button
            type="button"
            className={styles.signedUp}
            onClick={onMarkSignedUp}
            disabled={!onMarkSignedUp}
          >
            <Icon name="check" />
            Já me inscrevi
          </button>
          <button
            type="button"
            className={shared.remove}
            onClick={onRemove}
            disabled={!onRemove}
          >
            Tirar do filé
          </button>
        </div>
      </div>
    </>
  );
}

type SummaryRowProps = {
  icon: IconName;
  main: string;
  sub: string;
};

/** Linha do cartão "Quando e onde": ícone, texto principal e subtexto (Figma: Card / Quando e onde). */
function SummaryRow({ icon, main, sub }: SummaryRowProps) {
  return (
    <li className={styles.row}>
      <Icon name={icon} size={18} className={styles.rowIcon} />
      <span className={styles.rowText}>
        <span className={styles.rowMain}>{main}</span>
        <span className={styles.rowSub}>{sub}</span>
      </span>
    </li>
  );
}
