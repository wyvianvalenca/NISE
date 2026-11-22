"use client";

import { useRouter } from "next/navigation";
import { useLayoutEffect } from "react";
import { getHomePath } from "@/lib/access-api";
import {
  clearSignedInHint,
  hasSignedInHint,
  WAITING_ATTRIBUTE,
} from "@/lib/signed-in-hint";

/**
 * After this long, A01 shows the welcome anyway (a cold server in production
 * can take seconds). The check goes on: if it answers later, she still goes
 * to her screen.
 */
const WAIT_LIMIT_MS = 2000;

/**
 * Sends whoever is already signed in from A01 to her first screen (the same
 * one the login leads to). It draws nothing itself.
 *
 * Only a browser with the session hint asks the server. Meanwhile
 * `WAITING_ATTRIBUTE` on <html> swaps the welcome for the loading screen (see
 * the A01 CSS); the script in app/layout.tsx sets it before the first paint
 * on a full load, and this component sets it on a navigation inside the app.
 * Without the hint, A01 shows at once and nothing is asked.
 */
export function SignedInRedirect() {
  const router = useRouter();

  // A layout effect: on a navigation inside the app it hides the welcome
  // before the browser paints it.
  useLayoutEffect(() => {
    if (!hasSignedInHint()) {
      return;
    }

    const root = document.documentElement;
    root.setAttribute(WAITING_ATTRIBUTE, "");
    const showWelcome = () => root.removeAttribute(WAITING_ATTRIBUTE);

    const controller = new AbortController();
    const limit = window.setTimeout(showWelcome, WAIT_LIMIT_MS);

    getHomePath(controller.signal).then((result) => {
      if (controller.signal.aborted) {
        return;
      }

      // "/" is the NISE team's answer (it has no screens): going there again
      // would loop.
      if (result.kind === "signed_in" && result.nextPath !== "/") {
        router.replace(result.nextPath);
        return;
      }

      // The hint outlived the session: drop it so the next visit does not wait.
      if (result.kind === "signed_out") {
        clearSignedInHint();
      }
      window.clearTimeout(limit);
      showWelcome();
    });

    return () => {
      controller.abort();
      window.clearTimeout(limit);
      showWelcome();
    };
  }, [router]);

  return null;
}
