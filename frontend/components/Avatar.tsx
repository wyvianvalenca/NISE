import styles from "./Avatar.module.css";

type AvatarProps = {
  /** Nome da pessoa; mostramos só a primeira letra. */
  name: string;
  size?: 36 | 40;
};

/** Círculo com a inicial do nome (Figma: Avatar, Conta). */
export function Avatar({ name, size = 40 }: AvatarProps) {
  return (
    <span
      className={styles.avatar}
      style={{ width: size, height: size, fontSize: size === 40 ? 16 : 15 }}
      aria-hidden="true"
    >
      {name.trim().charAt(0).toUpperCase()}
    </span>
  );
}
