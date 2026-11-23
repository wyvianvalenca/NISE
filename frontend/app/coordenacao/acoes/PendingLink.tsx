import Link from "next/link";
import type { ReactNode } from "react";
import styles from "./PendingLink.module.css";

type PendingLinkProps = {
  children: ReactNode;
  /** "primary": filled button. "secondary": outline. "text": teal text link. */
  variant: "primary" | "secondary" | "text";
  /** The destination, once its screen exists; without it the control stays unavailable. */
  href?: string;
};

/**
 * A control that leads to a screen. While the screen does not exist yet (the
 * form, #212, the attendance) it has no `href` and is announced as an
 * unavailable link, the same pattern as the top menu tabs, so nothing leads to
 * a 404. With an `href` (the action page, #233) it is a real link.
 */
export function PendingLink({ children, variant, href }: PendingLinkProps) {
  if (href) {
    return (
      <Link href={href} className={`${styles.link} ${styles[variant]} ${styles.live}`}>
        {children}
      </Link>
    );
  }
  return (
    <span role="link" aria-disabled="true" className={`${styles.link} ${styles[variant]}`}>
      {children}
    </span>
  );
}
