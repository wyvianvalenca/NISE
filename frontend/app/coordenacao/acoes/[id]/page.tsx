import { Suspense } from "react";
import { getCoordinator } from "@/lib/coordinator";
import { ActionPageView } from "./ActionPageView";

/**
 * K11 "Ação", coordinator side (#233, RF-F1.14): where the action stands and
 * the girls registered in it. The id comes from the URL, so the page waits
 * inside a `Suspense`.
 */
export default async function CoordActionPage() {
  const coordinator = await getCoordinator();

  return (
    <Suspense fallback={null}>
      <ActionPageView groupName={coordinator.groupName} accountInitial={coordinator.initial} />
    </Suspense>
  );
}
