import type { CSSProperties } from "react";
import styles from "./Icon.module.css";

// Ícones exportados do Figma (Iconoir), em public/icons/.
// O número é o tamanho original de cada SVG no Figma, em px.
const ICON_SIZES = {
  home: 22,
  file: 22,
  bookmark: 22,
  user: 22,
  dashboard: 22,
  calendar: 22,
  "users-lg": 22,
  reports: 22,
  sheet: 22,
  users: 15,
  left: 16,
  "chevron-down": 16,
  "chevron-right": 18,
  "arrow-right": 16,
  external: 14,
  check: 16,
  search: 16,
  sparkle: 16,
  pin: 14,
  eye: 14,
  info: 13,
  "info-lg": 18,
  bell: 18,
  x: 20,
  code: 13,
  "code-lg": 44,
  mail: 34,
  clipboard: 34,
  compass: 20,
  "check-sm": 12,
  "topic-programacao": 22,
  "topic-robotica": 22,
  "topic-ia": 22,
  "topic-dados": 22,
  "topic-ciberseguranca": 22,
  "topic-jogos": 22,
  "topic-sites": 22,
  "topic-design": 22,
} as const;

export type IconName = keyof typeof ICON_SIZES;

type IconProps = {
  name: IconName;
  /** Troca o tamanho padrão do Figma, quando a tela pede outro. */
  size?: number;
  className?: string;
};

/**
 * Ícone decorativo que herda a cor do texto (currentColor).
 * O SVG vira uma máscara, então dá para trocar a cor só com CSS,
 * como pede a Barra inferior ("aba ativa fica teal").
 */
export function Icon({ name, size, className }: IconProps) {
  const px = size ?? ICON_SIZES[name];
  const style = {
    "--icon-url": `url(/icons/${name}.svg)`,
    width: px,
    height: px,
  } as CSSProperties;

  return (
    <span
      aria-hidden="true"
      className={className ? `${styles.icon} ${className}` : styles.icon}
      style={style}
    />
  );
}
