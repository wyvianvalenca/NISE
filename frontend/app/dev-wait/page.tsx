import { notFound } from "next/navigation";
import { Suspense } from "react";
import { WaitHarness } from "./WaitHarness";

/**
 * Test bench for `useLongWait` (issue #81): no screen uses the hook yet, and
 * the e2e needs a surface to drive it. It only exists outside production.
 */
export default function Page() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <Suspense>
      <WaitHarness />
    </Suspense>
  );
}
