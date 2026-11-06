import { useCallback, useEffect, useReducer } from "react";
import type { BandCode } from "@/lib/descobrir";
import { getSuggestions, sendChoice, type Choice, type ReasonCode, type Suggestion } from "@/lib/sugestoes";

// Estado da tela de sugestões: a lista da faixa, qual está à mostra e o total do filé.

export type DeckState = {
  status: "loading" | "ready";
  items: Suggestion[];
  /** Posição da sugestão à mostra; igual a items.length depois da última. */
  index: number;
  /** Itens no filé, para a pílula "Meu filé". */
  fileTotal: number;
  /** true enquanto uma escolha está sendo guardada; os botões ficam bloqueados. */
  pending: boolean;
};

export type DeckAction =
  | { type: "loaded"; items: Suggestion[]; fileTotal: number }
  | { type: "choosing" }
  | { type: "chosen"; fileTotal: number }
  | { type: "failed" };

export const initialDeck: DeckState = { status: "loading", items: [], index: 0, fileTotal: 0, pending: false };

export function deckReducer(state: DeckState, action: DeckAction): DeckState {
  switch (action.type) {
    case "loaded":
      return { status: "ready", items: action.items, index: 0, fileTotal: action.fileTotal, pending: false };
    case "choosing":
      return { ...state, pending: true };
    case "chosen":
      // A escolha foi guardada: passa para a próxima e usa o total que o back devolveu.
      return { ...state, index: state.index + 1, fileTotal: action.fileTotal, pending: false };
    case "failed":
      return { ...state, pending: false };
  }
}

export type ChoiceResult = { item: Suggestion; choice: Choice; fileTotal: number };

type Options = {
  /** Chamado depois que o back confirma a escolha (o aviso "Desfazer" da #107 parte daqui). */
  onChoiceConfirmed?: (item: Suggestion, choice: Choice) => void;
};

export function useSuggestionDeck(band: BandCode, { onChoiceConfirmed }: Options = {}) {
  const [state, dispatch] = useReducer(deckReducer, initialDeck);

  useEffect(() => {
    let current = true;
    getSuggestions(band).then((data) => {
      if (current) dispatch({ type: "loaded", items: data.items, fileTotal: data.fileTotal });
    });
    return () => {
      current = false;
    };
  }, [band]);

  const item: Suggestion | undefined = state.items[state.index];

  /** Guarda a escolha sobre a sugestão à mostra; resolve só depois da confirmação. */
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
        dispatch({ type: "failed" });
        throw error;
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
  };
}
