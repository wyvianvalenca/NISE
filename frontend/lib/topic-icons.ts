import type { IconName } from "@/components/Icon";

/**
 * Icon of each topic, shared by the sign-up screen (A05) and the profile (A10).
 * Topics come from the back-end: a code without an icon here uses the generic
 * one instead of breaking the image.
 */
export const TOPIC_ICONS: Record<string, IconName> = {
  programacao: "topic-programacao",
  robotica: "topic-robotica",
  ia: "topic-ia",
  dados: "topic-dados",
  ciberseguranca: "topic-ciberseguranca",
  jogos: "topic-jogos",
  sites: "topic-sites",
  design: "topic-design",
};

export const DEFAULT_TOPIC_ICON: IconName = "sparkle";
