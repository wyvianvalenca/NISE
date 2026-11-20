"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { getHomePath } from "@/lib/access-api";

/**
 * Sends whoever is already signed in from A01 to her first screen (the same
 * one the login leads to). It draws nothing: without a session, A01 stays as
 * it is.
 *
 * The check runs in the browser because the session cookie is httpOnly and,
 * like every other screen, A01 talks to the API from the browser. So A01 may
 * show for an instant before the redirect.
 */
export function SignedInRedirect() {
  const router = useRouter();

  useEffect(() => {
    const controller = new AbortController();

    getHomePath(controller.signal).then((path) => {
      // "/" is the NISE team's answer (it has no screens): going there again
      // would loop.
      if (path && path !== "/" && !controller.signal.aborted) {
        router.replace(path);
      }
    });

    return () => controller.abort();
  }, [router]);

  return null;
}
