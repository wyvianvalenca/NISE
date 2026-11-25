import { LinkButton } from "@/components/Button";
import styles from "./CoordinatorInviteProblem.module.css";

/**
 * Why a coordinator invite link does not work (story #458).
 * "expired" also covers a link that does not exist, so nobody learns which
 * links were ever issued. "replaced" is an expired link plus one extra line.
 */
export type InviteProblem = "expired" | "replaced" | "used" | "has_account";

type Screen = {
  title: string;
  lines: string[];
  /** "used" and "has_account" offer sign in and password recovery. */
  recovery: boolean;
};

const SCREENS: Record<InviteProblem, Screen> = {
  expired: {
    title: "Esse convite expirou",
    lines: ["Os convites da NISE duram 7 dias."],
    recovery: false,
  },
  replaced: {
    title: "Esse convite expirou",
    lines: [
      "Os convites da NISE duram 7 dias.",
      "Veja o e-mail mais recente da NISE.",
    ],
    recovery: false,
  },
  used: {
    title: "Esse convite já foi usado",
    lines: ["Esse convite já virou uma conta. Entre com ela."],
    recovery: true,
  },
  has_account: {
    title: "Você já tem conta na NISE",
    lines: [
      "O convite não transforma a sua conta em conta de coordenadora.",
      "A equipe NISE tem de convidar outro e-mail.",
    ],
    recovery: true,
  },
};

/**
 * CV04, CV05 and CV06 on the computer (Figma 2549-1093, 2549-1124, 2549-1154;
 * design card #438). Shows no data of the group, the coordinator or anyone.
 */
export function CoordinatorInviteProblem({
  problem,
}: {
  problem: InviteProblem;
}) {
  const screen = SCREENS[problem];

  return (
    <main className={styles.box}>
      <h1 className={styles.title}>{screen.title}</h1>
      {screen.lines.map((line) => (
        <p key={line} className={styles.lead}>
          {line}
        </p>
      ))}

      <div className={styles.actions}>
        {screen.recovery ? (
          <>
            <LinkButton href="/entrar">Entrar</LinkButton>
            <LinkButton href="/entrar/recuperar" variant="secondary">
              Esqueci minha senha
            </LinkButton>
          </>
        ) : (
          <LinkButton href="/entrar">Entrar com outra conta</LinkButton>
        )}
      </div>
    </main>
  );
}
