"use client";

import { useState } from "react";
import { BottomSheet } from "@/components/BottomSheet";
import { Button } from "@/components/Button";
import { Chip } from "@/components/Chip";
import { REASONS, type ReasonCode } from "@/lib/sugestoes";
import styles from "./ReasonSheet.module.css";

type ReasonSheetProps = {
  open: boolean;
  /** "Enviar" com o motivo marcado, ou "Pular" sem motivo. */
  onSubmit: (reason?: ReasonCode) => void;
  /** Fechou pelo X, pelo Esc ou pelo véu: ela desistiu, nada é guardado. */
  onCancel: () => void;
};

/** A06·2a · "Tudo bem! Quer contar o motivo?", depois do "Não é pra mim". O motivo é opcional. */
export function ReasonSheet({ open, onSubmit, onCancel }: ReasonSheetProps) {
  const [reason, setReason] = useState<ReasonCode | null>(null);

  // Cada abertura começa sem motivo marcado.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setReason(null);
  }

  return (
    <BottomSheet
      open={open}
      onClose={onCancel}
      title="Tudo bem! Quer contar o motivo?"
      description="É opcional, mas ajuda a gente a acertar nas próximas sugestões."
    >
      <div role="group" aria-label="Motivos" className={styles.reasons}>
        {REASONS.map((option) => (
          <Chip
            key={option.code}
            size="lg"
            selected={reason === option.code}
            // Tocar de novo no motivo marcado desmarca.
            onClick={() => setReason(reason === option.code ? null : option.code)}
          >
            {option.label}
          </Chip>
        ))}
      </div>
      <Button className={styles.send} disabled={!reason} onClick={() => reason && onSubmit(reason)}>
        Enviar
      </Button>
      <button type="button" className={styles.skip} onClick={() => onSubmit()}>
        Pular
      </button>
    </BottomSheet>
  );
}
