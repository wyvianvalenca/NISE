import { Suspense } from "react";
import { ActionPageView } from "./ActionPageView";

/**
 * K11 "Ação", coordinator side (#233, RF-F1.14): where the action stands and
 * the girls registered in it. The id comes from the URL, so the page waits
 * inside a `Suspense`.
 */
export default function CoordActionPage() {
  return (
    <Suspense fallback={null}>
      <ActionPageView />
    </Suspense>
  );
}
