"use client";

import { useSearchParams } from "next/navigation";
import { TextLink } from "./TextLink";

/**
 * "Voltar" para o perfil quando os termos foram abertos de lá (?de=perfil,
 * A10, #391). Aberta de outro lugar, a página não mostra nada.
 */
export function TermsBackLink() {
  const searchParams = useSearchParams();

  if (searchParams.get("de") !== "perfil") {
    return null;
  }

  return (
    <TextLink href="/perfil" back>
      Voltar
    </TextLink>
  );
}
