import type { Ref } from "react";
import { Icon, type IconName } from "@/components/Icon";
import { Notice } from "@/components/Notice";
import { Tag } from "@/components/Tag";
import { BANDS } from "@/lib/descobrir";
import {
  daysLeftText,
  daysUntilText,
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
  /** O título recebe o foco quando a versão da tela muda, para não se perder. */
  titleRef?: Ref<HTMLHeadingElement>;
  /** Chamado ao tocar em "Ir para inscrição", antes de o site abrir na outra aba. */
  onOpenSignUp?: () => void;
  /** "Já me inscrevi". Sem ela, o botão aparece desabilitado. */
  onMarkSignedUp?: () => void;
  /** "Tirar do filé". Sem ela, o botão aparece desabilitado. */
  onRemove?: () => void;
  /** Qual ação está sendo enviada; os botões ficam bloqueados enquanto isso. */
  saving?: "mark" | "remove" | null;
  /** Mensagem de erro da última ação, se falhou. */
  error?: string | null;
};

/**
 * O detalhe do evento (Figma A06·4b): a versão "Próxima aventura" e a versão
 * "Inscrita" (A06·4b inscrita), que é o evento em andamento.
 */
export function EventView(props: EventViewProps) {
  const { event } = props;
  return (
    <>
      <EventHeading {...props} />
      {event.status === "in_progress" ? <SignedUpBody {...props} /> : <NextBody {...props} />}
      {props.error && (
        <p className={shared.error} role="alert">
          {props.error}
        </p>
      )}
    </>
  );
}

/** Visual, tema, título e organizador: igual em todas as versões. */
function EventHeading({ event, titleRef }: EventViewProps) {
  const icons = typeIcon(event.type);
  const topic = `${event.topic} · ${BANDS[event.band].title}`;

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

      {event.status === "in_progress" ? (
        <div className={styles.topicRow}>
          <p className={shared.topic}>
            <span className={shared.dot} aria-hidden="true" />
            {topic}
          </p>
          <span className={styles.signedUpChip}>
            <Icon name="check" size={15} />
            Inscrita
          </span>
        </div>
      ) : (
        <p className={shared.topic}>
          <span className={shared.dot} aria-hidden="true" />
          {topic}
        </p>
      )}
      <h1 ref={titleRef} tabIndex={-1} className={shared.title}>
        {event.title}
      </h1>
      <p className={shared.source}>{organizerLine(event)}</p>
    </>
  );
}

/** "Próxima aventura": prazo, chips, aviso da RN-19 e os botões de inscrição. */
function NextBody({ event, onOpenSignUp, onMarkSignedUp, onRemove, saving }: EventViewProps) {
  const busy = Boolean(saving);

  return (
    <>
      <ul className={styles.summary} aria-label="Quando e onde">
        <SummaryRow
          icon="calendar"
          main={formatEventDays(event.startsOn, event.endsOn)}
          sub={formatWeekdays(event.startsOn, event.endsOn)}
        />
        <SummaryRow
          icon="pin"
          main={event.city ?? "Online"}
          sub={event.city ? "Local divulgado na inscrição" : "Link divulgado na inscrição"}
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
        <li>{event.cost ? <span className={shared.chip}>{event.cost}</span> : <Tag variant="pink">Grátis</Tag>}</li>
        {event.stage && <li className={shared.chip}>{event.stage}</li>}
        {event.prerequisites.map((item) => (
          <li key={item} className={shared.chip}>
            {item}
          </li>
        ))}
      </ul>

      {/* RN-19: a inscrição acontece fora da NISE, e a NISE não envia os dados dela. */}
      <Notice>A inscrição é feita no site dos organizadores. Seus dados da NISE não são enviados.</Notice>

      <div className={`${shared.actions} ${styles.actions}`}>
        <a
          href={event.registrationUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={shared.siteButton}
          onClick={onOpenSignUp}
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
            disabled={!onMarkSignedUp || busy}
            aria-busy={saving === "mark" || undefined}
          >
            <Icon name="check" />
            {saving === "mark" ? "Salvando…" : "Já me inscrevi"}
          </button>
          <RemoveButton onRemove={onRemove} saving={saving} />
        </div>
      </div>
    </>
  );
}

/**
 * "Inscrita": quando e onde, com quanto falta para o dia, e só "Tirar do filé".
 * Ficam para depois o "Me lembra um dia antes" (#186) e o aviso "Depois do evento,
 * a gente pergunta o que você achou" (a avaliação de evento de fora ainda não existe).
 */
function SignedUpBody({ event, onRemove, saving }: EventViewProps) {
  const weekdays = formatWeekdays(event.startsOn, event.endsOn);

  return (
    <>
      <ul className={styles.summary} aria-label="Quando e onde">
        <SummaryRow
          icon="calendar"
          main={formatEventDays(event.startsOn, event.endsOn)}
          sub={`${weekdays} · ${daysUntilText(event.daysUntilStart)}`}
        />
        <SummaryRow
          icon="pin"
          main={event.city ?? "Online"}
          sub={event.city ? "O local chega no e-mail das organizadoras" : "O link chega no e-mail das organizadoras"}
        />
      </ul>

      <div className={styles.signedUpFooter}>
        <RemoveButton onRemove={onRemove} saving={saving} />
      </div>
    </>
  );
}

function RemoveButton({ onRemove, saving }: Pick<EventViewProps, "onRemove" | "saving">) {
  return (
    <button
      type="button"
      className={shared.remove}
      onClick={onRemove}
      disabled={!onRemove || Boolean(saving)}
      aria-busy={saving === "remove" || undefined}
    >
      {saving === "remove" ? "Tirando…" : "Tirar do filé"}
    </button>
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
