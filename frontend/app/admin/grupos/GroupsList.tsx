"use client";

import { useState } from "react";
import { Button } from "@/components/Button";
import { groupNumbersLabel, type GroupCard } from "@/lib/admin-groups";
import { InviteDrawer } from "../coordenadoras/InviteDrawer";
import { NewGroupDrawer } from "./NewGroupDrawer";
import styles from "./GroupsList.module.css";

type GroupsListProps = {
  /** Already in the order of D-120: who needs a coordinator first, then by name. */
  groups: GroupCard[];
  /** A group or an invite was created: the list is fetched again. */
  onChanged: () => void;
};

/**
 * The interactive part of AD06: one card per group with its numbers, the
 * "Precisa de coordenadora" tag and the "Convidar" shortcut. There is no link
 * to open a group, and girls show only as a count (RN-41).
 */
export function GroupsList({ groups, onChanged }: GroupsListProps) {
  const [creating, setCreating] = useState(false);
  /** The group the invite drawer opens with; null: closed. */
  const [invitingGroup, setInvitingGroup] = useState<number | null>(null);

  return (
    <>
      <div className={styles.heading}>
        <h1 className={styles.title}>Grupos</h1>
        <p className={styles.subtitle}>Onde há coordenadora e onde ainda falta.</p>
        <Button className={styles.create} onClick={() => setCreating(true)}>
          + Novo grupo
        </Button>
      </div>
      {groups.length === 0 ? (
        <p role="status" className={styles.empty}>
          Ainda não existe nenhum grupo.
        </p>
      ) : (
        <ul className={styles.cards}>
          {groups.map((group) => (
            <li key={group.id} className={styles.card}>
              <div className={styles.info}>
                <h2 className={styles.name}>{group.name}</h2>
                {group.city && <p className={styles.city}>{group.city}</p>}
                <p className={styles.numbers}>{groupNumbersLabel(group)}</p>
              </div>
              {group.needs_coordinator && (
                <div className={styles.need}>
                  <span className={styles.tag}>Precisa de coordenadora</span>
                  <Button variant="secondary" size="sm" onClick={() => setInvitingGroup(group.id)}>
                    Convidar
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {creating && <NewGroupDrawer onCreated={onChanged} onClose={() => setCreating(false)} />}
      {invitingGroup !== null && (
        <InviteDrawer
          groupId={invitingGroup}
          onInvited={onChanged}
          onClose={() => setInvitingGroup(null)}
        />
      )}
    </>
  );
}
