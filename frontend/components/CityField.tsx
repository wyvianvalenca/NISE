"use client";

import { useEffect, useState } from "react";
import { Field } from "./Field";
import { buscarCidades, type Cidade } from "@/lib/cadastro";

type CityFieldProps = {
  /** O que ela digitou. O input é dono do texto; isto é só o espelho. */
  value: string;
  onChange: (texto: string) => void;
  /** Avisa qual município da lista casou, ou `null` enquanto nenhum casa. */
  onSelect: (cidade: Cidade | null) => void;
  error?: string;
};

/** Tira acento e caixa, para "maceió, al" casar com "Maceió, AL". */
function comparavel(texto: string): string {
  return texto
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

/**
 * Campo de cidade preso à lista do IBGE (RN-17: nada de texto livre).
 *
 * Mora aqui porque as duas portas de cadastro usam o mesmo campo: a A02
 * (#51) e a A02b do Google (#52). A lista vem da rota de municípios (#50).
 */
export function CityField({ value, onChange, onSelect, error }: CityFieldProps) {
  const [cidades, setCidades] = useState<Cidade[]>([]);

  useEffect(() => {
    const busca = value.trim();
    const controle = new AbortController();
    const espera = setTimeout(() => {
      if (busca.length < 2) {
        setCidades([]);
        return;
      }
      buscarCidades(busca, controle.signal)
        .then(setCidades)
        .catch(() => {
          /* Sem lista, o envio avisa que a cidade precisa vir da lista. */
        });
    }, 250);

    return () => {
      clearTimeout(espera);
      controle.abort();
    };
  }, [value]);

  useEffect(() => {
    const alvo = comparavel(value);
    onSelect(cidades.find((cidade) => comparavel(cidade.name) === alvo) ?? null);
  }, [value, cidades, onSelect]);

  return (
    <>
      <Field
        label="Cidade"
        list="cidades-ibge"
        placeholder="Comece a digitar"
        autoComplete="off"
        onValueChange={onChange}
        error={error}
        required
      />
      <datalist id="cidades-ibge">
        {cidades.map((cidade) => (
          <option key={cidade.id} value={cidade.name} />
        ))}
      </datalist>
    </>
  );
}
