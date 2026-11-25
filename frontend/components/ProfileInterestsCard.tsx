import { TextLink } from "./TextLink";
import styles from "./ProfileCard.module.css";

type ProfileInterestsCardProps = {
  /** Nomes dos temas, na ordem da lista da A05. */
  topics: string[];
  /** "Ainda não sei, me mostra de tudo": aparece como um chip no lugar dos temas. */
  allTopics: boolean;
  /** Nome da etapa de estudo; vazio se ela ainda não escolheu. */
  studyStage: string | null;
  /** Para onde "Editar" leva (a tela é da #392). */
  editHref: string;
};

const ALL_TOPICS_LABEL = "Ainda não sei, me mostra de tudo";

/** "O que te interessa" na A10 (RF-F7.11): só leitura, com o link para editar. */
export function ProfileInterestsCard({
  topics,
  allTopics,
  studyStage,
  editHref,
}: ProfileInterestsCardProps) {
  const chips = allTopics ? [ALL_TOPICS_LABEL] : topics;

  return (
    <section className={styles.section} aria-labelledby="perfil-interesses">
      <div className={styles.headingRow}>
        <h2 id="perfil-interesses" className={styles.heading}>
          O que te interessa
        </h2>
        <TextLink href={editHref}>Editar</TextLink>
      </div>

      <div className={styles.card}>
        {chips.length > 0 && (
          <div className={styles.chips}>
            {chips.map((label) => (
              <span key={label} className={styles.chip}>
                {label}
              </span>
            ))}
          </div>
        )}
        {studyStage && <p className={styles.body}>Momento de estudo: {studyStage}</p>}
        <p className={styles.text}>Suas sugestões levam isso em conta.</p>
      </div>
    </section>
  );
}
