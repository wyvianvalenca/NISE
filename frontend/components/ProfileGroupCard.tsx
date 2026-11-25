import styles from "./ProfileCard.module.css";
import groupStyles from "./ProfileGroupCard.module.css";

type ProfileGroupCardProps = {
  /** A origem que o servidor devolve; o front não decide quem vê o quê. */
  origin: { kind: "group"; groupName: string } | { kind: "self" };
};

// RN-01: a liderança do grupo de origem vê o filé, as respostas e as avaliações.
const GROUP_SEES =
  "A liderança do grupo vê seu filé, suas respostas aos questionários e suas avaliações das ações. Outros grupos só veem números gerais, sem identificar você.";

// RN-04, D-110: sem grupo, só números gerais. Não promete que um grupo vai
// aparecer (RN-32). Texto provisório, a confirmar com a equipe (P2 do épico #130).
const NO_GROUP_TEXT = "Os grupos só veem números gerais seus, sem identificar você.";

/** Iniciais do grupo para o ícone ("Rendeiras do Código" → "RC"): as palavras com mais de 2 letras. */
function initials(groupName: string): string {
  const words = groupName.split(/\s+/).filter((word) => word.length > 2);
  const letters = (words.length >= 2 ? words : groupName.split(/\s+/).filter(Boolean))
    .slice(0, 2)
    .map((word) => word.charAt(0));
  return letters.join("").toUpperCase();
}

/** "Seu grupo" na A10 (RF-F7.11): de onde ela veio e quem vê os dados dela. */
export function ProfileGroupCard({ origin }: ProfileGroupCardProps) {
  return (
    <section className={styles.section} aria-labelledby="perfil-grupo">
      <h2 id="perfil-grupo" className={styles.heading}>
        Seu grupo
      </h2>
      <div className={styles.card}>
        {origin.kind === "group" ? (
          <>
            <div className={styles.row}>
              <span className={groupStyles.icon} aria-hidden="true">
                {initials(origin.groupName)}
              </span>
              <div className={styles.texts}>
                <p className={styles.name}>{origin.groupName}</p>
                <p className={styles.text}>Você chegou pelo convite delas</p>
              </div>
            </div>
            <p className={styles.body}>{GROUP_SEES}</p>
          </>
        ) : (
          <div className={styles.texts}>
            <p className={styles.name}>Você ainda não está num grupo</p>
            <p className={styles.text}>{NO_GROUP_TEXT}</p>
          </div>
        )}
      </div>
    </section>
  );
}
