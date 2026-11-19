import { useCallback, useEffect, useReducer } from "react";
import { sendChoice, undoChoice, type Choice, type ReasonCode, type Suggestion, type SuggestionsData } from "@/lib/sugestoes";

// Estado da tela de sugestões: a lista da faixa, qual está à mostra e o total do filé.
// Quem busca a faixa é a SuggestionsScreen, com a espera da #81; este hook recebe o resultado.

export type DeckState = {
  /** "loading" até a faixa chegar; enquanto isso, a tela não mostra nada no meio. */
  status: "loading" | "ready";
  items: Suggestion[];
  /** Posição da sugestão à mostra; igual a items.length depois da última. */
  index: number;
  /** Itens no filé, para a pílula "Meu filé". */
  fileTotal: number;
  /** true enquanto uma escolha é guardada ou desfeita; os botões ficam bloqueados. */
  pending: boolean;
  /** true quando a última escolha não foi guardada; some na próxima tentativa. */
  choiceFailed: boolean;
};

export type DeckAction =
  | { type: "reset" }
  | { type: "loaded"; items: Suggestion[]; fileTotal: number }
  | { type: "choosing" }
  | { type: "chosen"; fileTotal: number }
  | { type: "undone"; id: string; fileTotal: number }
  | { type: "failed" }
  | { type: "undoFailed" };

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
    case "reset":
      return initialDeck;
    case "loaded":
      return { ...initialDeck, status: "ready", items: action.items, fileTotal: action.fileTotal };
    case "choosing":
      return { ...state, pending: true, choiceFailed: false };
    case "chosen":
      // A escolha foi guardada: passa para a próxima e usa o total que o back devolveu.
      return { ...state, index: state.index + 1, fileTotal: action.fileTotal, pending: false };
    case "undone": {
      // A escolha foi desfeita: a mesma sugestão volta a ser a atual (#107).
      const index = state.items.findIndex((item) => item.id === action.id);
      return { ...state, index: index === -1 ? state.index : index, fileTotal: action.fileTotal, pending: false };
    }
    case "failed":
      // A sugestão continua à mostra; ela vê o aviso e pode tocar de novo.
      return { ...state, pending: false, choiceFailed: true };
    case "undoFailed":
      // O erro do "Desfazer" aparece no próprio aviso (UndoToast).
      return { ...state, pending: false };
  }
}

export type ChoiceResult = { item: Suggestion; choice: Choice; fileTotal: number };

type Options = {
  /** Chamado depois que o back confirma a escolha (o aviso "Desfazer" da #107 parte daqui). */
  onChoiceConfirmed?: (item: Suggestion, choice: Choice) => void;
};

/** `data` é a faixa que o back devolveu (#104); null enquanto ela não chega. */
export function useSuggestionDeck(data: SuggestionsData | null, { onChoiceConfirmed }: Options = {}) {
  const [state, dispatch] = useReducer(deckReducer, initialDeck);

  useEffect(() => {
    // Sem dados (a tela foi escondida e vai buscar de novo), volta a "loading", para não
    // mostrar a lista e o "Sugestão N de M" de antes.
    dispatch(data ? { type: "loaded", items: data.items, fileTotal: data.fileTotal } : { type: "reset" });
  }, [data]);

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

  /** Desfaz a escolha sobre um item; resolve só depois da confirmação e lança erro se falhar. */
  const undo = useCallback(async (id: string) => {
    dispatch({ type: "choosing" });
    try {
      const { fileTotal } = await undoChoice(id);
      dispatch({ type: "undone", id, fileTotal });
    } catch (error) {
      dispatch({ type: "undoFailed" });
      throw error;
    }
  }, []);

  return {
    state,
    dispatch,
    /** Sugestão à mostra; undefined depois da última. */
    item,
    /** Posição para o "Sugestão 3 de 8", contando de 1. */
    position: state.index + 1,
    total: state.items.length,
    choose,
    undo,
  };
}
