"use client";

import { useId, useRef, useState, type KeyboardEvent } from "react";
import { Icon } from "@/components/Icon";
import styles from "./RowMenu.module.css";

/** Height of one item plus the padding and border around the list, to know if it fits below. */
const ITEM_HEIGHT = 44;
const MENU_CHROME = 14;

export type RowMenuItem = {
  label: string;
  onSelect: () => void;
};

type RowMenuProps = {
  /** Name of the action the menu belongs to, so the button says which one. */
  actionName: string;
  items: RowMenuItem[];
};

/**
 * The "..." menu of a list row (Figma: Action / Mais opções). It is a native
 * popover, so it sits above the list, closes with Esc or a click outside and
 * hands the focus back to the button. It opens below the button, or above it
 * when there is no room left on the screen. A row with no item shows the button
 * only: it has nothing to open.
 */
export function RowMenu({ actionName, items }: RowMenuProps) {
  const menuId = useId();
  const menuRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const label = `Mais opções de ${actionName}`;

  if (items.length === 0) {
    return (
      <button type="button" className={styles.button} aria-label={label}>
        <Icon name="more" />
      </button>
    );
  }

  function place(button: HTMLButtonElement) {
    const rect = button.getBoundingClientRect();
    const menu = menuRef.current;
    if (!menu) return;
    const height = items.length * ITEM_HEIGHT + MENU_CHROME;
    const fitsBelow = rect.bottom + 4 + height <= document.documentElement.clientHeight;
    menu.style.top = `${fitsBelow ? rect.bottom + 4 : rect.top - 4 - height}px`;
    menu.style.right = `${document.documentElement.clientWidth - rect.right}px`;
  }

  function moveFocus(event: KeyboardEvent<HTMLDivElement>) {
    const entries = [...event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]')];
    const at = entries.indexOf(document.activeElement as HTMLElement);
    if (event.key === "ArrowDown") entries[(at + 1) % entries.length].focus();
    else if (event.key === "ArrowUp") entries[(at - 1 + entries.length) % entries.length].focus();
    else if (event.key === "Tab") menuRef.current?.hidePopover();
    else return;
    event.preventDefault();
  }

  return (
    <>
      <button
        type="button"
        className={styles.button}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={expanded}
        popoverTarget={menuId}
        onClick={(event) => place(event.currentTarget)}
      >
        <Icon name="more" />
      </button>
      <div
        ref={menuRef}
        id={menuId}
        popover="auto"
        role="menu"
        aria-label={`Opções de ${actionName}`}
        className={styles.menu}
        onKeyDown={moveFocus}
        onToggle={(event) => {
          const open = event.newState === "open";
          setExpanded(open);
          if (open) menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
        }}
      >
        {items.map((item) => (
          <button
            key={item.label}
            type="button"
            role="menuitem"
            className={styles.item}
            onClick={() => {
              menuRef.current?.hidePopover();
              item.onSelect();
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
    </>
  );
}
