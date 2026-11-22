import type { ReactNode } from "react";
import styles from "./PendingLink.module.css";

type PendingLinkProps = {
  children: ReactNode;
  /** "primary": filled button. "secondary": outline. "text": teal text link. */
  variant: "primary" | "secondary" | "text";
};

/**
 * A control that will lead to a screen that does not exist yet (the action
 * page, #233, and the form, #212). It has no `href` and is announced as an
 * unavailable link, the same pattern as the top menu tabs, so nothing leads to
 * a 404. When the destination lands, swap this for a real link.
 */
export function PendingLink({ children, variant }: PendingLinkProps) {
  return (
    <span role="link" aria-disabled="true" className={`${styles.link} ${styles[variant]}`}>
      {children}
    </span>
  );
}
