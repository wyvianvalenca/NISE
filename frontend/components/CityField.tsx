"use client";

import { useEffect, useState } from "react";
import { Field } from "./Field";
import { searchCities, type City } from "@/lib/signup-api";

type CityFieldProps = {
  /** What she typed. The input owns the text; this is only the mirror. */
  value: string;
  onChange: (text: string) => void;
  /** Reports which municipality matched, or `null` while none does. */
  onSelect: (city: City | null) => void;
  error?: string;
};

/** Drops accents and case, so "maceió, al" matches "Maceió, AL". */
function comparable(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

/**
 * City field tied to the IBGE list (RN-17: no free text).
 *
 * It lives here because both sign-up doors use the same field: A02 (#51) and
 * the Google A02b (#52). The list comes from the municipalities route (#50).
 */
export function CityField({ value, onChange, onSelect, error }: CityFieldProps) {
  const [cities, setCities] = useState<City[]>([]);

  useEffect(() => {
    const search = value.trim();
    const controller = new AbortController();
    const wait = setTimeout(() => {
      if (search.length < 2) {
        setCities([]);
        return;
      }
      searchCities(search, controller.signal)
        .then(setCities)
        .catch(() => {
          /* Without the list, submitting tells her the city must come from it. */
        });
    }, 250);

    return () => {
      clearTimeout(wait);
      controller.abort();
    };
  }, [value]);

  useEffect(() => {
    const target = comparable(value);
    onSelect(cities.find((city) => comparable(city.name) === target) ?? null);
  }, [value, cities, onSelect]);

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
        {cities.map((city) => (
          <option key={city.id} value={city.name} />
        ))}
      </datalist>
    </>
  );
}
