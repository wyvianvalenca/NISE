"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/Button";
import { CityField } from "@/components/CityField";
import { Drawer } from "@/components/Drawer";
import { Field } from "@/components/Field";
import { Notice } from "@/components/Notice";
import { createGroup, type GroupCard, type NewGroupProblem } from "@/lib/admin-groups";
import type { City } from "@/lib/signup-api";
import styles from "./NewGroupDrawer.module.css";

type ErrorField = "name" | "city" | "form";
type Errors = Partial<Record<ErrorField, string>>;

const FORM_ID = "new-group-form";

// The wording of these messages is not drawn yet (open question on #438).
const PROBLEM_TEXT: Record<NewGroupProblem, string> = {
  group_exists: "Já existe um grupo com este nome nesta cidade.",
  invalid_city: "Escolha a cidade na lista.",
  forbidden: "Só a equipe NISE cria grupos.",
  failed: "Não deu pra criar o grupo agora. Tente de novo.",
};

type NewGroupDrawerProps = {
  /** A group was created, so the list can be fetched again. */
  onCreated: () => void;
  /** The drawer closed (button, "X", Esc or the veil). */
  onClose: () => void;
};

/**
 * "+ Novo grupo" (RF-S2.30): asks for the name and the city, nothing more.
 * Mounted only while open, so every opening starts clean; closing before
 * saving saves nothing. No invite and no e-mail go out. The server decides who
 * may create a group and refuses a repeated name and city (D-120).
 */
export function NewGroupDrawer({ onCreated, onClose }: NewGroupDrawerProps) {
  const [name, setName] = useState("");
  const [cityText, setCityText] = useState("");
  const [city, setCity] = useState<City | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<GroupCard | null>(null);
  const onSelect = useCallback((found: City | null) => setCity(found), []);

  // The dialog opens in an effect of `Drawer` (it runs first), so the focus
  // goes to the name here.
  useEffect(() => document.getElementById("new-group-name")?.focus(), []);

  function clearError(field: ErrorField) {
    setErrors((current) => (current[field] ? { ...current, [field]: undefined } : current));
  }

  async function submit() {
    if (saving) return;
    const found: Errors = {};
    if (!name.trim()) found.name = "Escreva o nome do grupo";
    if (!cityText.trim()) found.city = "Escreva a cidade";
    else if (!city) found.city = "Escolha a cidade na lista";
    setErrors(found);
    if (found.name || found.city) {
      document.getElementById(found.name ? "new-group-name" : "new-group-city")?.focus();
      return;
    }

    setSaving(true);
    try {
      const result = await createGroup({
        name: name.trim(),
        cityId: Number(city!.id),
      });
      if (result.kind === "created") {
        setCreated(result.group);
        onCreated();
      } else if (result.problem === "group_exists") {
        setErrors({ name: PROBLEM_TEXT.group_exists });
        document.getElementById("new-group-name")?.focus();
      } else {
        setErrors({ form: PROBLEM_TEXT[result.problem] });
      }
    } catch {
      setErrors({ form: PROBLEM_TEXT.failed });
    } finally {
      setSaving(false);
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    void submit();
  }

  if (created) {
    return (
      <Drawer
        open
        onClose={onClose}
        title="Grupo criado"
        footer={<Button onClick={onClose}>Fechar</Button>}
      >
        <div className={styles.sent}>
          <h3 className={styles.sentTitle}>{created.name}</h3>
          <p className={styles.text}>
            O grupo está na lista como <strong>Precisa de coordenadora</strong>. Nenhum convite foi
            enviado. Use “Convidar” no cartão dele quando quiser chamar alguém.
          </p>
        </div>
      </Drawer>
    );
  }

  return (
    <Drawer
      open
      onClose={onClose}
      title="Novo grupo"
      subtitle="Prepare o grupo antes de convidar alguém."
      footer={
        <>
          <Button variant="secondary" disabled={saving} onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form={FORM_ID} loading={saving} loadingLabel="Salvando…">
            Salvar grupo
          </Button>
        </>
      }
    >
      <form id={FORM_ID} noValidate className={styles.form} onSubmit={handleSubmit}>
        {errors.form && (
          <Notice tone="pink" icon="alert">
            <span role="alert">{errors.form}</span>
          </Notice>
        )}
        <Field
          id="new-group-name"
          label="Nome do grupo"
          autoComplete="off"
          error={errors.name}
          onValueChange={(value) => {
            setName(value);
            clearError("name");
          }}
        />
        <CityField
          id="new-group-city"
          value={cityText}
          onChange={(text) => {
            setCityText(text);
            clearError("city");
          }}
          onSelect={onSelect}
          error={errors.city}
        />
      </form>
    </Drawer>
  );
}
