import { useCallback, useEffect, useReducer, useState } from "react";
import type { BandCode } from "@/lib/descobrir";
import { getSuggestions, sendChoice, type Choice, type ReasonCode, type Suggestion } from "@/lib/sugestoes";

// Estado da tela de sugestões: a lista da faixa, qual está à mostra e o total do filé.

export type DeckState = {
  /** "error": a busca da faixa falhou; a tela mostra o aviso com "Tentar de novo". */
  status: "loading" | "ready" | "error";
  items: Suggestion[];
  /** Posição da sugestão à mostra; igual a items.length depois da última. */
  index: number;
  /** Itens no filé, para a pílula "Meu filé". */
  fileTotal: number;
  /** true enquanto uma escolha está sendo guardada; os botões ficam bloqueados. */
  pending: boolean;
  /** true quando a última escolha não foi guardada; some na próxima tentativa. */
  choiceFailed: boolean;
};

export type DeckAction =
  | { type: "loading" }
  | { type: "loaded"; items: Suggestion[]; fileTotal: number }
  | { type: "loadFailed" }
  | { type: "choosing" }
  | { type: "chosen"; fileTotal: number }
  | { type: "failed" };

export const initialDeck: DeckState = {
  status: "loading",
  items: [],
  index: 0,
  fileTotal: 0,
  pending: false,
  choiceFailed: false,
};

export function deckReducer(state: DeckState, action: DeckAction): DeckState {
  switch (action.type) {
    case "loading":
      return initialDeck;
    case "loaded":
      return { ...initialDeck, status: "ready", items: action.items, fileTotal: action.fileTotal };
    case "loadFailed":
      return { ...initialDeck, status: "error" };
    case "choosing":
      return { ...state, pending: true, choiceFailed: false };
    case "chosen":
      // A escolha foi guardada: passa para a próxima e usa o total que o back devolveu.
      return { ...state, index: state.index + 1, fileTotal: action.fileTotal, pending: false };
    case "failed":
      // A sugestão continua à mostra; ela vê o aviso e pode tocar de novo.
      return { ...state, pending: false, choiceFailed: true };
  }
}

export type ChoiceResult = { item: Suggestion; choice: Choice; fileTotal: number };

type Options = {
  /** Chamado depois que o back confirma a escolha (o aviso "Desfazer" da #107 parte daqui). */
  onChoiceConfirmed?: (item: Suggestion, choice: Choice) => void;
};

export function useSuggestionDeck(band: BandCode, { onChoiceConfirmed }: Options = {}) {
  const [state, dispatch] = useReducer(deckReducer, initialDeck);
  // Cada "Tentar de novo" soma 1 e refaz a busca.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let current = true;
    getSuggestions(band).then(
      (data) => {
        if (current) dispatch({ type: "loaded", items: data.items, fileTotal: data.fileTotal });
      },
      (error: unknown) => {
        console.warn("Não foi possível carregar as sugestões.", error);
        if (current) dispatch({ type: "loadFailed" });
      },
    );
    return () => {
      current = false;
    };
  }, [band, attempt]);

  /** Refaz a busca da faixa depois de um erro. */
  const reload = useCallback(() => {
    dispatch({ type: "loading" });
    setAttempt((count) => count + 1);
  }, []);

  const item: Suggestion | undefined = state.items[state.index];

  /**
   * Guarda a escolha sobre a sugestão à mostra; resolve só depois da confirmação.
   * Se falhar, resolve com null e marca choiceFailed: a tela avisa e ela pode tocar de novo.
   */
  const choose = useCallback(
    async (choice: Choice, reason?: ReasonCode): Promise<ChoiceResult | null> => {
      if (!item || state.pending) return null;
      dispatch({ type: "choosing" });
      try {
        const { fileTotal } = await sendChoice(item.id, choice, reason);
        dispatch({ type: "chosen", fileTotal });
        onChoiceConfirmed?.(item, choice);
        return { item, choice, fileTotal };
      } catch (error) {
        console.warn("Não foi possível guardar a escolha.", error);
        dispatch({ type: "failed" });
        return null;
      }
    },
    [item, state.pending, onChoiceConfirmed],
  );

  return {
    state,
    dispatch,
    /** Sugestão à mostra; undefined depois da última. */
    item,
    /** Posição para o "Sugestão 3 de 8", contando de 1. */
    position: state.index + 1,
    total: state.items.length,
    choose,
    reload,
  };
}
