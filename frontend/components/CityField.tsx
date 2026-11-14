"use client";

import { useEffect, useId, useState, type KeyboardEvent } from "react";
import { Field } from "./Field";
import styles from "./CityField.module.css";
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
 *
 * The suggestion list is our own, not a native `<datalist>`: Chrome on Android
 * filters a datalist again by what she typed, taking accents into account, so
 * "sao jose" hid "São José da Tapera, AL" even though the API found it. Here
 * the list shows exactly what the API returned.
 */
export function CityField({ value, onChange, onSelect, error }: CityFieldProps) {
  const inputId = useId();
  const listId = useId();
  const [cities, setCities] = useState<City[]>([]);
  const [open, setOpen] = useState(false);
  /** The option highlighted with the arrow keys, or -1 for none. */
  const [active, setActive] = useState(-1);

  const showList = open && cities.length > 0;
  const optionId = (index: number) => `${listId}-${index}`;

  useEffect(() => {
    const search = value.trim();
    const controller = new AbortController();
    const wait = setTimeout(() => {
      if (search.length < 2) {
        setCities([]);
        return;
      }
      searchCities(search, controller.signal)
        .then((found) => {
          setCities(found);
          setActive(-1);
        })
        .catch(() => {
          /* Without the list, submitting tells her the city must come from it. */
        });
    }, 250);

    return () => {
      clearTimeout(wait);
      controller.abort();
    };
  }, [value]);

  // Typing the full name, with or without accents, also picks the city.
  useEffect(() => {
    const target = comparable(value);
    onSelect(cities.find((city) => comparable(city.name) === target) ?? null);
  }, [value, cities, onSelect]);

  // On the phone the keyboard covers the bottom of the screen: when the list
  // opens, the page scrolls just enough to show it.
  useEffect(() => {
    if (showList) {
      document.getElementById(listId)?.scrollIntoView({ block: "nearest" });
    }
  }, [showList, listId]);

  // Keeps the highlighted option in view when the list scrolls.
  useEffect(() => {
    if (active >= 0) {
      document
        .getElementById(`${listId}-${active}`)
        ?.scrollIntoView({ block: "nearest" });
    }
  }, [active, listId]);

  function type(text: string) {
    onChange(text);
    setOpen(true);
  }

  function choose(city: City) {
    // The field is uncontrolled (see Field), so the text is written straight
    // into the input, and the mirror is updated by hand.
    const input = document.getElementById(inputId) as HTMLInputElement | null;
    if (input) {
      input.value = city.name;
    }
    onChange(city.name);
    onSelect(city);
    setOpen(false);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" && cities.length > 0) {
      event.preventDefault();
      setOpen(true);
      setActive((index) => Math.min(index + 1, cities.length - 1));
    } else if (event.key === "ArrowUp" && showList) {
      event.preventDefault();
      setActive((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter" && showList && active >= 0) {
      // Enter picks the highlighted city instead of submitting the form.
      event.preventDefault();
      choose(cities[active]);
    } else if (event.key === "Escape" && showList) {
      event.preventDefault();
      setOpen(false);
    }
  }

  return (
    <Field
      id={inputId}
      label="Cidade"
      placeholder="Comece a digitar"
      autoComplete="off"
      role="combobox"
      aria-autocomplete="list"
      aria-expanded={showList}
      aria-controls={showList ? listId : undefined}
      aria-activedescendant={
        showList && active >= 0 ? optionId(active) : undefined
      }
      onValueChange={type}
      onKeyDown={handleKeyDown}
      onBlur={() => setOpen(false)}
      error={error}
      required
    >
      {showList && (
        // "Sugestões", not "Cidades": a label containing "Cidade" would make the
        // list compete with the input for the field's name.
        <ul id={listId} role="listbox" aria-label="Sugestões" className={styles.list}>
          {cities.map((city, index) => (
            <li
              key={city.id}
              id={optionId(index)}
              role="option"
              aria-selected={index === active}
              className={styles.option}
              // Keeps the focus in the input, so the list does not close
              // (on blur) before the click picks the city.
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(city)}
            >
              {city.name}
            </li>
          ))}
        </ul>
      )}
    </Field>
  );
}
