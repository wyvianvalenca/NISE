"use client";

import { AfterActionResults } from "./AfterActionResults";
import { EnteredFieldResults } from "./EnteredFieldResults";
import { InterestCards } from "./InterestCards";

/** Os cards da tela: os filtros ficam em AfterActionResults e valem para todos. */
export function ResultsCards() {
  return (
    <AfterActionResults
      below={(filters) => (
        <>
          <InterestCards key={JSON.stringify(filters)} filters={filters} />
          <EnteredFieldResults key={JSON.stringify(filters)} filters={filters} />
        </>
      )}
    />
  );
}
