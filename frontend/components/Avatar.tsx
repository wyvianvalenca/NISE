import styles from "./Avatar.module.css";

type AvatarProps = {
  /** Nome da pessoa; mostramos só a primeira letra. */
  name: string;
  /** 48 é o do cartão da conta no perfil (Figma: A10, Avatar). */
  size?: 36 | 40 | 48;
};

const FONT_SIZES = { 36: 15, 40: 16, 48: 20 } as const;

/** Círculo com a inicial do nome (Figma: Avatar, Conta). */
export function Avatar({ name, size = 40 }: AvatarProps) {
  return (
    <span
      className={styles.avatar}
      style={{ width: size, height: size, fontSize: FONT_SIZES[size] }}
      aria-hidden="true"
    >
      {name.trim().charAt(0).toUpperCase()}
    </span>
  );
}
