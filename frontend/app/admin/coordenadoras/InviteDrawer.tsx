"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/Button";
import { CityField } from "@/components/CityField";
import { Drawer } from "@/components/Drawer";
import { Field } from "@/components/Field";
import { Notice } from "@/components/Notice";
import { SegmentedControl } from "@/components/SegmentedControl";
import { Select } from "@/components/Select";
import {
  getAdminGroups,
  inviteDateLabel,
  sendCoordinatorInvite,
  type GroupOption,
  type InviteInput,
  type InviteProblem,
  type InviteSent,
} from "@/lib/admin-coordinator-invite";
import type { City } from "@/lib/signup-api";
import styles from "./InviteDrawer.module.css";

type ErrorField = "name" | "email" | "groupName" | "city" | "groupId" | "form";
type Errors = Partial<Record<ErrorField, string>>;

/** Same idea as the server's: something@something.tld, nothing fancy. */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FORM_ID = "invite-coordinator-form";
const CAN_DO = [
  "Cadastrar as ações do grupo",
  "Ver inscrições e marcar presença",
  "Acompanhar quem entrou na área",
];

/** What the team reads for each refusal that is not a field left empty. */
const PROBLEM_TEXT: Record<InviteProblem, string> = {
  email_has_account: "Este e-mail já tem conta na NISE. Nenhum convite foi criado.",
  invite_pending: "Este e-mail já tem um convite esperando. Use “Reenviar” na lista.",
  group_exists: "Já existe um grupo com este nome nesta cidade. Nenhum convite foi criado.",
  group_not_found: "Este grupo não existe mais. Escolha outro.",
  invalid_city: "Escolha a cidade na lista.",
  forbidden: "Só a equipe NISE convida coordenadoras.",
  failed: "Não deu pra enviar o convite agora. Tente de novo.",
};

type InviteDrawerProps = {
  /** Opens with this group already chosen ("Convidar" on a group card, AD06). */
  groupId?: number;
  /** An invite was created, so the list can be fetched again. */
  onInvited: () => void;
  /** The drawer closed (button, "X", Esc or the veil). */
  onClose: () => void;
};

/**
 * AD03 "Convidar coordenadora" and AD04 "Convite enviado" (RF-S2.20). Mounted
 * only while open, so every opening starts clean; closing before sending saves
 * nothing. The server decides who may invite (RNF-G.03).
 */
export function InviteDrawer({ groupId: initialGroupId, onInvited, onClose }: InviteDrawerProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [kind, setKind] = useState<"new" | "existing">(initialGroupId === undefined ? "new" : "existing");
  const [groups, setGroups] = useState<GroupOption[] | null>(null);
  const [groupId, setGroupId] = useState(initialGroupId === undefined ? "" : String(initialGroupId));
  const [groupName, setGroupName] = useState("");
  const [cityText, setCityText] = useState("");
  const [city, setCity] = useState<City | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);
  const [sent, setSent] = useState<InviteSent | null>(null);
  // Changing the key gives the fields back clean for the next invite.
  const [round, setRound] = useState(0);
  const onSelect = useCallback((found: City | null) => setCity(found), []);

  useEffect(() => {
    let current = true;
    getAdminGroups().then(
      (found) => current && setGroups(found),
      () => current && setGroups([]),
    );
    return () => {
      current = false;
    };
  }, []);

  // The dialog opens in an effect of `Drawer` (it runs first), so the focus
  // goes to the name here, also for the next invite.
  useEffect(() => document.getElementById("invite-name")?.focus(), [round]);

  function clearError(field: ErrorField) {
    setErrors((current) => (current[field] ? { ...current, [field]: undefined } : current));
  }

  const chosenGroup = groups?.find((group) => String(group.id) === groupId);
  const shownGroupName = kind === "new" ? groupName.trim() : (chosenGroup?.name ?? "");

  async function submit() {
    if (saving) return;
    const data = new FormData(formRef.current!);
    const name = String(data.get("name") ?? "").trim();
    const email = String(data.get("email") ?? "").trim();
    const found: Errors = {};
    if (!name) found.name = "Escreva o nome";
    if (!email) found.email = "Escreva o e-mail";
    else if (!EMAIL_SHAPE.test(email)) found.email = "Confira o e-mail";
    if (kind === "new") {
      if (!groupName.trim()) found.groupName = "Escreva o nome do grupo";
      if (!cityText.trim()) found.city = "Escreva a cidade";
      else if (!city) found.city = "Escolha a cidade na lista";
    } else if (!chosenGroup) {
      found.groupId = "Escolha o grupo";
    }
    setErrors(found);
    const first = (["name", "email", "groupName", "city", "groupId"] as const).find((key) => found[key]);
    if (first) {
      document.getElementById(`invite-${first}`)?.focus();
      return;
    }

    const input: InviteInput = {
      name,
      email,
      group:
        kind === "new"
          ? { kind: "new", name: groupName.trim(), cityId: Number(city!.id) }
          : { kind: "existing", groupId: chosenGroup!.id },
    };
    setSaving(true);
    try {
      const result = await sendCoordinatorInvite(input);
      if (result.kind === "sent") {
        setSent(result.invite);
        onInvited();
      } else if (result.problem === "email_has_account" || result.problem === "invite_pending") {
        setErrors({ email: PROBLEM_TEXT[result.problem] });
        document.getElementById("invite-email")?.focus();
      } else if (result.problem === "group_exists") {
        setErrors({ groupName: PROBLEM_TEXT.group_exists });
        document.getElementById("invite-groupName")?.focus();
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

  function another() {
    setSent(null);
    setErrors({});
    setKind("new");
    setGroupId("");
    setGroupName("");
    setCityText("");
    setCity(null);
    setRound((value) => value + 1);
  }

  if (sent) {
    return (
      <Drawer
        open
        onClose={onClose}
        title="Convite enviado"
        footer={
          <>
            <Button variant="secondary" onClick={another}>
              Convidar outra pessoa
            </Button>
            <Button onClick={onClose}>Fechar</Button>
          </>
        }
      >
        <div className={styles.sent}>
          {!sent.emailSent && (
            <Notice tone="pink" icon="alert">
              Não deu pra enviar o e-mail pra {sent.firstName}. Tente de novo.
            </Notice>
          )}
          {sent.emailSent ? (
            <>
              <h3 className={styles.sentTitle}>Convite enviado pra {sent.firstName}</h3>
              <p className={styles.sentText}>
                Mandamos o link pra <strong>{sent.email}</strong>. Ele vale até{" "}
                <strong>{inviteDateLabel(sent.expiresAt)}</strong>.
              </p>
            </>
          ) : (
            <p className={styles.sentText}>
              O convite ficou na lista de Coordenadoras. Dá pra usar “Reenviar” lá.
            </p>
          )}
          <p className={styles.hint}>
            {sent.firstName} vai coordenar <strong>{sent.groupName}</strong>.
          </p>
        </div>
      </Drawer>
    );
  }

  return (
    <Drawer
      open
      onClose={onClose}
      title="Convidar coordenadora"
      subtitle="Ela recebe um e-mail com o link pra criar a conta."
      footer={
        <>
          <Button variant="secondary" disabled={saving} onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form={FORM_ID} loading={saving} loadingLabel="Enviando…">
            Enviar convite
          </Button>
        </>
      }
    >
      <form id={FORM_ID} ref={formRef} noValidate className={styles.form} onSubmit={handleSubmit}>
        {errors.form && (
          <Notice tone="pink" icon="alert">
            <span role="alert">{errors.form}</span>
          </Notice>
        )}
        <div key={round} className={styles.fields}>
          <Field
            id="invite-name"
            name="name"
            label="Nome dela"
            autoComplete="off"
            error={errors.name}
            onValueChange={() => clearError("name")}
          />
          <Field
            id="invite-email"
            name="email"
            type="email"
            label="E-mail dela"
            autoComplete="off"
            error={errors.email}
            onValueChange={() => clearError("email")}
          />
        </div>
        <div className={styles.group}>
          <span className={styles.label}>Grupo</span>
          <SegmentedControl
            label="Grupo"
            options={[
              { value: "new", label: "Grupo novo" },
              { value: "existing", label: "Grupo que já existe" },
            ]}
            value={kind}
            onChange={(value) => {
              setKind(value);
              setErrors((current) => ({
                ...current,
                groupName: undefined,
                city: undefined,
                groupId: undefined,
              }));
            }}
          />
        </div>
        {kind === "new" ? (
          <div key={`new-${round}`} className={styles.fields}>
            <Field
              id="invite-groupName"
              label="Nome do grupo"
              autoComplete="off"
              error={errors.groupName}
              onValueChange={(value) => {
                setGroupName(value);
                clearError("groupName");
              }}
            />
            <CityField
              id="invite-city"
              value={cityText}
              onChange={(text) => {
                setCityText(text);
                clearError("city");
              }}
              onSelect={onSelect}
              error={errors.city}
            />
            <p className={styles.hint}>O grupo é criado junto com o convite.</p>
          </div>
        ) : groups !== null && groups.length === 0 ? (
          <Notice tone="teal">Ainda não existe nenhum grupo. Escolha “Grupo novo” pra criar um.</Notice>
        ) : (
          <>
            <Select
              id="invite-groupId"
              label="Escolha o grupo"
              value={groupId}
              onChange={(event) => {
                setGroupId(event.target.value);
                clearError("groupId");
              }}
            >
              <option value="">Escolha um grupo</option>
              {groups?.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.city ? `${group.name} (${group.city})` : group.name}
                </option>
              ))}
            </Select>
            {errors.groupId && (
              <p role="alert" className={styles.hint}>
                {errors.groupId}
              </p>
            )}
          </>
        )}
        <div className={styles.can}>
          <span className={styles.label}>O que ela vai poder fazer</span>
          <ul>
            {CAN_DO.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <p className={styles.hint}>
            Ela só vê os dados das meninas do grupo{shownGroupName ? ` ${shownGroupName}` : ""}.
          </p>
        </div>
      </form>
    </Drawer>
  );
}
