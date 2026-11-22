"use client";

import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "./Button";
import { Chip, ChipGroup } from "./Chip";
import { CityField } from "./CityField";
import { Field } from "./Field";
import { Icon } from "./Icon";
import { SegmentedControl } from "./SegmentedControl";
import { TextArea } from "./TextArea";
import { TextLink } from "./TextLink";
import {
  ACTION_FORMATS,
  ACTION_TOPICS,
  ACTION_TYPES,
  ADDRESS_MAX_LENGTH,
  AUDIENCES,
  createAction,
  DESCRIPTION_MAX_LENGTH,
  updateAction,
  validateAction,
  type ActionFormValues,
  type ActionVisibility,
} from "@/lib/action-form";
import type { City } from "@/lib/signup-api";
import styles from "./ActionForm.module.css";

const LIST_PATH = "/coordenacao/acoes";

type ActionFormProps = {
  /** What the fields start with: empty for a new action, the saved values to edit one. */
  initialValues: ActionFormValues;
  /** Set when editing: the id of the action being changed. Absent when registering. */
  actionId?: number;
};

/** Toggles `item` in `list`, keeping the order the options are shown in. */
function toggle<T>(list: T[], item: T): T[] {
  return list.includes(item) ? list.filter((value) => value !== item) : [...list, item];
}

/**
 * The form of K02, shared by the registration (#212) and the edit (#222).
 *
 * It validates with `validateAction`, the same rules the server applies, and
 * shows each message next to its field, tied to it with `aria-describedby`.
 * After a failed submit the first invalid field gets the focus and the
 * messages follow what she types, so fixing a field clears its message at once.
 * Saving goes back to the list with `?salva=<id>`, where the notice is shown
 * (#216). A failure to save keeps everything she typed.
 *
 * The fields are uncontrolled (see `Field`): `values` mirrors them, it does not
 * drive them. The title block is PROVISIONAL in edit mode: the design has not
 * confirmed the title, buttons and notice of that mode (#221), so it reuses the
 * registration ones.
 */
export function ActionForm({ initialValues, actionId }: ActionFormProps) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const descriptionCounterId = useId();
  const [values, setValues] = useState(initialValues);
  const [cityText, setCityText] = useState(initialValues.city?.name ?? "");
  const [detailsOpen, setDetailsOpen] = useState(
    Boolean(
      initialValues.startsAtTime ||
        initialValues.endsAtTime ||
        initialValues.endsOn ||
        initialValues.address ||
        initialValues.description ||
        initialValues.audiences.length,
    ),
  );
  const [showEndDate, setShowEndDate] = useState(Boolean(initialValues.endsOn));
  const [submitted, setSubmitted] = useState(false);
  const [focusRequest, setFocusRequest] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);

  /**
   * The city she picked from the list. Right after opening an edit the list has
   * not answered yet, so the saved city counts while the text still is its name.
   */
  const city = values.city ?? (initialValues.city && cityText === initialValues.city.name ? initialValues.city : null);
  const effective: ActionFormValues = { ...values, city: values.format === "online" ? null : city };
  const errors = submitted ? validateAction(effective) : {};

  function patch(changes: Partial<ActionFormValues>) {
    setValues((current) => ({ ...current, ...changes }));
  }

  const selectCity = useCallback((found: City | null) => {
    setValues((current) => (current.city?.id === found?.id ? current : { ...current, city: found }));
  }, []);

  function changeFormat(format: ActionFormValues["format"]) {
    // Coming back to Presencial, the city field is built again and shows the saved
    // city (its `defaultValue`), so the text has to be that city too: otherwise the
    // field shows "Maceió, AL" while the form still thinks there is no city.
    setCityText(format === "in_person" ? (initialValues.city?.name ?? "") : "");
    patch({ format, city: null });
  }

  useEffect(() => {
    if (focusRequest === 0) return;
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"], [data-invalid="true"]')?.focus();
  }, [focusRequest]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaveFailed(false);
    setSubmitted(true);

    const found = validateAction(effective);
    if (Object.keys(found).length > 0) {
      if (found.endsOn || found.address || found.description) setDetailsOpen(true);
      setFocusRequest((count) => count + 1);
      return;
    }

    setSaving(true);
    try {
      const saved = await (actionId === undefined ? createAction(effective) : updateAction(actionId, effective));
      router.push(`${LIST_PATH}?salva=${saved.id}`);
    } catch {
      setSaving(false);
      setSaveFailed(true);
    }
  }

  const typeErrorId = "action-type-error";
  const topicsId = "action-topics";

  return (
    <>
      <div className={styles.top}>
        <TextLink href={LIST_PATH} back>
          Ações
        </TextLink>
        <h1 className={styles.title}>Nova ação</h1>
        <p className={styles.lead}>
          Leva uns 5 minutos. O que está em <strong>Mais detalhes</strong> é opcional.
        </p>
      </div>

      <form ref={formRef} className={styles.card} onSubmit={submit} noValidate>
        <Field
          label="Nome da ação"
          autoComplete="off"
          defaultValue={initialValues.name}
          onValueChange={(name) => patch({ name })}
          error={errors.name}
        />

        <div>
          <ChipGroup label="Tipo">
            {ACTION_TYPES.map((type, index) => (
              <Chip
                key={type.value}
                selected={values.type === type.value}
                onClick={() => patch({ type: type.value })}
                aria-describedby={errors.type ? typeErrorId : undefined}
                data-invalid={errors.type && index === 0 ? "true" : undefined}
              >
                {type.label}
              </Chip>
            ))}
          </ChipGroup>
          {errors.type && (
            <p id={typeErrorId} className={styles.error}>
              {errors.type}
            </p>
          )}
        </div>

        <div className={styles.row}>
          <Field
            label="Data"
            type="date"
            defaultValue={initialValues.startsOn}
            onValueChange={(startsOn) => patch({ startsOn })}
            error={errors.startsOn}
          />
          <div className={styles.group}>
            <span className={styles.label}>Formato</span>
            <SegmentedControl
              label="Formato"
              options={[...ACTION_FORMATS]}
              value={values.format}
              onChange={changeFormat}
            />
          </div>
        </div>

        {values.format === "in_person" && (
          <CityField
            value={cityText}
            defaultValue={initialValues.city?.name}
            onChange={setCityText}
            onSelect={selectCity}
            error={errors.city}
          />
        )}

        <fieldset className={styles.visibility}>
          <legend className={styles.label}>Quem pode ver na NISE?</legend>
          <div className={styles.options}>
            <VisibilityOption
              value="open"
              current={values.visibility}
              onChange={(visibility) => patch({ visibility })}
              icon="eye"
              title="Aberta ao público"
              description="Aparece nas sugestões das meninas da cidade"
            />
            <VisibilityOption
              value="closed"
              current={values.visibility}
              onChange={(visibility) => patch({ visibility })}
              icon="lock"
              title="Fechada"
              description="Só para convidadas; não aparece nas sugestões"
            />
          </div>
        </fieldset>

        <Field
          label="Link de inscrição"
          type="url"
          autoComplete="off"
          defaultValue={initialValues.registrationUrl}
          onValueChange={(registrationUrl) => patch({ registrationUrl })}
          hint="Obrigatório pra ações abertas. O formulário que vocês já usam (Google Forms, Sympla…). A NISE só guarda o link e manda as meninas pra lá."
          error={errors.registrationUrl}
        />

        <ChipGroup label="Tags">
          <div id={topicsId} className={styles.chips}>
            {ACTION_TOPICS.map((topic) => (
              <Chip
                key={topic.code}
                selected={values.topics.includes(topic.code)}
                onClick={() => patch({ topics: toggle(values.topics, topic.code) })}
              >
                {topic.label}
              </Chip>
            ))}
          </div>
        </ChipGroup>

        <section className={styles.details}>
          <button
            type="button"
            className={styles.detailsToggle}
            aria-expanded={detailsOpen}
            aria-controls="action-details"
            onClick={() => setDetailsOpen((open) => !open)}
          >
            <span className={styles.detailsText}>
              <span className={styles.detailsTitle}>
                Mais detalhes <span className={styles.muted}>(opcional)</span>
              </span>
              <span className={styles.hint}>Ajudam as meninas a decidir se a ação é pra elas</span>
            </span>
            <Icon name={detailsOpen ? "chevron-up" : "chevron-down"} size={18} />
          </button>

          <div id="action-details" className={styles.detailsBody} hidden={!detailsOpen}>
            <div className={styles.row}>
              <Field
                label="Começa às"
                type="time"
                defaultValue={initialValues.startsAtTime}
                onValueChange={(startsAtTime) => patch({ startsAtTime })}
              />
              <Field
                label="Termina às"
                type="time"
                defaultValue={initialValues.endsAtTime}
                onValueChange={(endsAtTime) => patch({ endsAtTime })}
              />
            </div>

            {showEndDate ? (
              <Field
                label="Data de fim"
                type="date"
                defaultValue={initialValues.endsOn}
                onValueChange={(endsOn) => patch({ endsOn })}
                error={errors.endsOn}
              />
            ) : (
              <button type="button" className={styles.addDay} onClick={() => setShowEndDate(true)}>
                + Dura mais de um dia
              </button>
            )}

            <Field
              label="Endereço"
              autoComplete="off"
              maxLength={ADDRESS_MAX_LENGTH}
              defaultValue={initialValues.address}
              onValueChange={(address) => patch({ address })}
              hint="Rua, prédio ou sala. Se o local ainda não estiver definido, pode deixar em branco."
              error={errors.address}
            />

            <ChipGroup label="Pra quem é (escolha uma ou mais)">
              {AUDIENCES.map((audience) => (
                <Chip
                  key={audience.value}
                  selected={values.audiences.includes(audience.value)}
                  onClick={() => patch({ audiences: toggle(values.audiences, audience.value) })}
                >
                  {audience.label}
                </Chip>
              ))}
            </ChipGroup>

            <div>
              <TextArea
                label="Descrição"
                maxLength={DESCRIPTION_MAX_LENGTH}
                defaultValue={initialValues.description}
                onChange={(event) => patch({ description: event.target.value })}
                aria-describedby={descriptionCounterId}
                error={errors.description}
              />
              <p id={descriptionCounterId} className={styles.counter}>
                {values.description.length}/{DESCRIPTION_MAX_LENGTH}
              </p>
            </div>
          </div>
        </section>

        {saveFailed && (
          <p className={styles.error} role="alert">
            Não deu pra salvar. Tente de novo.
          </p>
        )}

        <div className={styles.actions}>
          <Button type="submit" loading={saving} loadingLabel="Salvando…">
            Salvar, importo depois
          </Button>
        </div>
      </form>
    </>
  );
}

type VisibilityOptionProps = {
  value: ActionVisibility;
  current: ActionVisibility;
  onChange: (value: ActionVisibility) => void;
  icon: "eye" | "lock";
  title: string;
  description: string;
};

/** One card of "Quem pode ver na NISE?": a native radio, so the arrow keys work for free. */
function VisibilityOption({ value, current, onChange, icon, title, description }: VisibilityOptionProps) {
  return (
    <label className={styles.option}>
      <input
        type="radio"
        name="visibility"
        value={value}
        checked={current === value}
        onChange={() => onChange(value)}
        className={styles.radio}
      />
      <span className={styles.optionText}>
        <span className={styles.optionTitle}>
          <Icon name={icon} size={15} />
          {title}
        </span>
        <span className={styles.hint}>{description}</span>
      </span>
    </label>
  );
}
