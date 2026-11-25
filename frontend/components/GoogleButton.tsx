import Image from "next/image";
import type { MouseEvent } from "react";
import { googleStartUrl } from "@/lib/signup-api";
import styles from "./GoogleButton.module.css";

type GoogleButtonProps = {
  /** The group's invite code, when she arrived through one (RN-29). */
  invite?: string;
  label?: string;
  /** Overrides the address, for flows with their own query (coordinator invite, #455). */
  href?: string;
  /** Second line under the label, as in "Use a conta Google de ...". */
  hint?: string;
  /** Lets the page stop the click, for example while the terms are unchecked. */
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
  /**
   * Makes it a button with no address (coordinator invite, #455): the page
   * checks the terms and asks the back-end where to go, so a middle click or
   * "open in new tab" cannot skip that check.
   */
  onPress?: () => void;
  disabled?: boolean;
};

/**
 * The "Criar conta com o Google" action (Figma: Action / Criar conta com o
 * Google, on A02). It is a link and not a button because it leads outside:
 * the back-end redirects to Google.
 */
export function GoogleButton({
  invite,
  label = "Criar conta com o Google",
  href,
  hint,
  onClick,
  onPress,
  disabled,
}: GoogleButtonProps) {
  const content = (
    <>
      <Image src="/icons/google.svg" alt="" width={20} height={20} unoptimized />
      {hint ? (
        <span className={styles.texts}>
          {label}
          <span className={styles.hint}>{hint}</span>
        </span>
      ) : (
        label
      )}
    </>
  );

  if (onPress) {
    return (
      <button type="button" className={styles.button} onClick={onPress} disabled={disabled}>
        {content}
      </button>
    );
  }

  return (
    <a
      className={styles.button}
      href={href ?? googleStartUrl({ invite })}
      onClick={onClick}
    >
      {content}
    </a>
  );
}
