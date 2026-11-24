"use client";

import { useState, type Ref } from "react";
import { Button } from "@/components/Button";
import { Checkbox } from "@/components/Checkbox";
import { Icon, type IconName } from "@/components/Icon";
import { Notice } from "@/components/Notice";
import { Tag } from "@/components/Tag";
import { BANDS } from "@/lib/descobrir";
import {
  daysUntilText,
  deadlineText,
  formatEventDays,
  formatWeekdays,
  organizerLine,
  reminderDate,
  typeIcon,
  wentQuestion,
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

export type EventViewProps = {
  event: EventDetail;
  /** O título recebe o foco quando a versão da tela muda, para não se perder. */
  titleRef?: Ref<HTMLHeadingElement>;
  /** Chamado ao tocar em "Ir para inscrição", antes de o site abrir na outra aba. */
  onOpenSignUp?: () => void;
  /** "Já me inscrevi". Sem ela, o botão aparece desabilitado. */
  onMarkSignedUp?: () => void;
  /** "Tirar do filé". Sem ela, o botão aparece desabilitado. */
  onRemove?: () => void;
  /** "Me lembra um dia antes" (#186). Se a promessa falha, a caixa volta a como estava. */
  onReminderChange?: (on: boolean) => Promise<void>;
  /** "Fui!" e "Não deu", do evento de fora depois da data (#190). */
  onWent?: () => void;
  onDidNotGo?: () => void;
  /**
   * Qual ação está sendo enviada; os botões e o lembrete ficam bloqueados enquanto isso.
   * "undo" é o "Desfazer" do aviso; "reminder", salvar o lembrete.
   */
  saving?: "mark" | "remove" | "went" | "didNotGo" | "reminder" | "undo" | null;
  /** Mensagem de erro da última ação, se falhou. */
  error?: string | null;
};

/** Qual versão da A06·4b o evento mostra. */
function variantOf(event: EventDetail) {
  if (event.status === "concluded") return "concluded";
  if (event.status === "next") return "next";
  // Inscrita: antes da data, a versão "Inscrita". Depois, o evento de fora pergunta "Você foi?"
  // e o de grupo da NISE espera a lista de presença da coordenadora.
  if (!event.afterEvent) return "signedUp";
  return event.group === null ? "askWent" : "waitingAttendance";
}

/**
 * O detalhe do evento (Figma A06·4b): as versões "Próxima aventura", "Inscrita"
 * (A06·4b inscrita), "Você foi?" (evento de fora depois da data), "Esperando a lista
 * de presença" (evento de grupo da NISE depois da data) e "Concluído".
 */
export function EventView(props: EventViewProps) {
  const variant = variantOf(props.event);
  return (
    <>
      <EventHeading {...props} />
      {variant === "next" && <NextBody {...props} />}
      {variant === "signedUp" && <SignedUpBody {...props} />}
      {variant === "askWent" && <AskWentBody {...props} />}
      {variant === "waitingAttendance" && <WaitingAttendanceBody {...props} />}
      {variant === "concluded" && <ConcludedBody {...props} />}
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
  const topic = event.topic ? `${event.topic} · ${BANDS[event.band].title}` : BANDS[event.band].title;

  return (
    <>
      <div className={shared.visual}>
        <span className={shared.kind}>
          <Icon name={icons.small} size={13} />
          {event.typeLabel}
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

      {variantOf(event) === "signedUp" ? (
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
        <PlaceRow event={event} />
        {/* RN-36: se as inscrições fecharam, o evento continua no filé dela. */}
        <SummaryRow icon="clock" {...deadlineText(event)} />
      </ul>

      <DetailChips event={event} />

      {/* RN-19: a inscrição acontece fora da NISE, e a NISE não envia os dados dela. */}
      <Notice>A inscrição é feita no site dos organizadores. Seus dados da NISE não são enviados.</Notice>

      <div className={`${shared.actions} ${styles.actions}`}>
        {/* A ação fechada do grupo não tem link: a inscrição é por convite. */}
        {event.registrationUrl && (
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
        )}

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
 * "Inscrita": quando e onde, com quanto falta para o dia, o lembrete opcional e "Tirar do filé".
 * Fica para depois o aviso "Depois do evento, a gente pergunta o que você achou"
 * (a avaliação de evento de fora ainda não existe).
 */
function SignedUpBody({ event, onRemove, onReminderChange, saving }: EventViewProps) {
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

      <ReminderOption event={event} onReminderChange={onReminderChange} saving={saving} />

      <div className={styles.signedUpFooter}>
        <RemoveButton onRemove={onRemove} saving={saving} />
      </div>
    </>
  );
}

/**
 * "Você foi?": evento de fora, depois do último dia, com ela inscrita (#190).
 * Só a pergunta e os dois botões; os outros botões e avisos somem.
 */
function AskWentBody({ event, onWent, onDidNotGo, saving }: EventViewProps) {
  const busy = Boolean(saving);

  return (
    <>
      <ul className={styles.summary} aria-label="Quando e onde">
        <SummaryRow
          icon="calendar"
          main={`Foi em ${formatEventDays(event.startsOn, event.endsOn)}`}
          sub={formatWeekdays(event.startsOn, event.endsOn)}
        />
        <PlaceRow event={event} />
        <SummaryRow icon="clock" main="O evento acabou" sub="Conta pra gente se você foi" />
      </ul>

      <section className={styles.question} aria-labelledby="pergunta-voce-foi">
        <h2 id="pergunta-voce-foi" className={styles.questionTitle}>
          {wentQuestion(event.type)}
        </h2>
        <p className={styles.questionText}>Se foi, ele vira um quadradinho colorido no seu filé.</p>
        <div className={styles.answers}>
          <Button
            variant="secondary"
            className={styles.answer}
            onClick={onDidNotGo}
            disabled={!onDidNotGo || busy}
            loading={saving === "didNotGo"}
            loadingLabel="Salvando…"
          >
            Não deu
          </Button>
          <Button
            className={styles.answer}
            onClick={onWent}
            disabled={!onWent || busy}
            loading={saving === "went"}
            loadingLabel="Salvando…"
          >
            Fui!
          </Button>
        </div>
      </section>
    </>
  );
}

/**
 * Evento de grupo da NISE depois da data, com ela inscrita: espera a coordenadora marcar
 * a presença (#194). Sem botões; quem conclui é a lista de presença (RF-F10.24).
 */
function WaitingAttendanceBody({ event }: EventViewProps) {
  return (
    <ul className={styles.summary} aria-label="Quando e onde">
      <SummaryRow
        icon="calendar"
        main={`Foi em ${formatEventDays(event.startsOn, event.endsOn)}`}
        sub={formatWeekdays(event.startsOn, event.endsOn)}
      />
      <PlaceRow event={event} />
      <SummaryRow
        icon="clock"
        main="Esperando a lista de presença"
        sub="Quando o grupo marcar, ele vai pros concluídos do seu filé"
      />
    </ul>
  );
}

/** "Concluído": ela foi (pelo "Fui!" ou pela presença marcada pelo grupo). Sem botões (#190, #194). */
function ConcludedBody({ event }: EventViewProps) {
  return (
    <>
      <ul className={styles.summary} aria-label="Quando e onde">
        <SummaryRow
          icon="calendar"
          main={`Você foi · ${formatEventDays(event.startsOn, event.endsOn)}`}
          sub={formatWeekdays(event.startsOn, event.endsOn)}
        />
        <PlaceRow event={event} />
      </ul>
      <DetailChips event={event} />
      <Notice>Ele já tá colorido no seu filé.</Notice>
    </>
  );
}

function PlaceRow({ event }: { event: EventDetail }) {
  return (
    <SummaryRow
      icon="pin"
      main={event.city ?? "Online"}
      sub={event.city ? "Local divulgado na inscrição" : "Link divulgado na inscrição"}
    />
  );
}

/** Custo, etapa mínima e pré-requisitos. */
function DetailChips({ event }: { event: EventDetail }) {
  return (
    <ul className={shared.chips} aria-label="Detalhes">
      <li>{event.cost ? <span className={shared.chip}>{event.cost}</span> : <Tag variant="pink">Grátis</Tag>}</li>
      {event.stage && <li className={shared.chip}>{event.stage}</li>}
      {event.prerequisites.map((item) => (
        <li key={item} className={shared.chip}>
          {item}
        </li>
      ))}
    </ul>
  );
}

/**
 * "Me lembra um dia antes" (#186): começa desmarcado e some quando o dia anterior já
 * passou ou é hoje. Se salvar falha, avisa e a caixa volta a como estava.
 */
function ReminderOption({
  event,
  onReminderChange,
  saving,
}: Pick<EventViewProps, "event" | "onReminderChange" | "saving">) {
  // A caixa é não controlada (veja o Checkbox); trocar a key recria a caixa com o valor salvo.
  const [version, setVersion] = useState(0);
  const [failed, setFailed] = useState(false);
  const day = reminderDate(event);
  if (!day || !onReminderChange) return null;

  async function change(on: boolean) {
    setFailed(false);
    try {
      await onReminderChange?.(on);
    } catch {
      setFailed(true);
      setVersion((current) => current + 1);
    }
  }

  return (
    <div className={styles.reminder}>
      <Checkbox
        key={version}
        variant="card"
        className={styles.reminderOption}
        defaultChecked={event.reminder}
        onCheckedChange={change}
        disabled={Boolean(saving)}
        aria-busy={saving === "reminder" || undefined}
      >
        <span className={styles.reminderTitle}>Me lembra um dia antes</span>
        <span className={styles.reminderText}>Um e-mail só, no dia {day}. Opcional.</span>
      </Checkbox>
      {failed && (
        <p className={shared.error} role="alert">
          Não deu pra salvar o lembrete. Tente de novo.
        </p>
      )}
    </div>
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
  sub?: string;
};

/** Linha do cartão "Quando e onde": ícone, texto principal e subtexto (Figma: Card / Quando e onde). */
function SummaryRow({ icon, main, sub }: SummaryRowProps) {
  return (
    <li className={styles.row}>
      <Icon name={icon} size={18} className={styles.rowIcon} />
      <span className={styles.rowText}>
        <span className={styles.rowMain}>{main}</span>
        {sub && <span className={styles.rowSub}>{sub}</span>}
      </span>
    </li>
  );
}
