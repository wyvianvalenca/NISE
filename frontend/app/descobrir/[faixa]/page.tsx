// A06·2 · Sugestões de uma faixa, uma de cada vez. Atende RF-F10.04 (issues #102 e #103).

import { notFound } from "next/navigation";
import { Suspense } from "react";
import { BAND_CODES, type BandCode } from "@/lib/descobrir";
import { SuggestionsScreen } from "./SuggestionsScreen";

export function generateStaticParams() {
  return BAND_CODES.map((faixa) => ({ faixa }));
}

function isBand(value: string): value is BandCode {
  return (BAND_CODES as readonly string[]).includes(value);
}

// Com Cache Components, ler params fora de um <Suspense> trava a navegação e o Next avisa no dev.
export default function BandSuggestionsPage({ params }: PageProps<"/descobrir/[faixa]">) {
  return (
    <Suspense>
      <Band params={params} />
    </Suspense>
  );
}

async function Band({ params }: Pick<PageProps<"/descobrir/[faixa]">, "params">) {
  const { faixa } = await params;
  if (!isBand(faixa)) notFound();
  return <SuggestionsScreen band={faixa} />;
}
