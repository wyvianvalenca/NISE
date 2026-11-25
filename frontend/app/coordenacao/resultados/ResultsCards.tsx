"use client";

import { AfterActionResults } from "./AfterActionResults";
import { FutureSelfSection } from "./FutureSelfSection";
import { InterestCards } from "./InterestCards";

/** Os cards da tela: os filtros ficam em AfterActionResults e valem para todos. */
export function ResultsCards() {
  return (
    <AfterActionResults
      below={(filters) => (
        <>
          <InterestCards key={JSON.stringify(filters)} filters={filters} />
          <FutureSelfSection key={JSON.stringify(filters)} filters={filters} />
        </>
      )}
    />
  );
}
