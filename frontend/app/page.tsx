import { AppHeader } from "@/components/AppHeader";
import { LinkButton } from "@/components/Button";
import { FileIllustration } from "@/components/FileIllustration";
import { Loading } from "@/components/Loading";
import { SignedInRedirect } from "@/components/SignedInRedirect";
import { TextLink } from "@/components/TextLink";
import styles from "./page.module.css";

/**
 * A01 "Boas-vindas" (Figma 511:15325): the door for whoever arrives on her
 * own, with no group invite (flow M2, issue #51).
 *
 * It stays on the server: there is no state and no fetching here, and "Criar
 * conta" is navigation, so it is a link and not a button with `router.push`.
 * The only client piece is `SignedInRedirect`, which sends whoever is already
 * signed in to her first screen. While it asks the server, a browser with the
 * session hint sees the loading screen instead of the welcome (see the CSS).
 */
export default function Home() {
  return (
    <div className={styles.page}>
      <SignedInRedirect />

      <div className={styles.waiting}>
        <AppHeader />
        <Loading />
      </div>

      <div className={styles.welcome}>
        <AppHeader>
          <TextLink href="/entrar">Entrar</TextLink>
        </AppHeader>

        <main className={styles.main}>
          <h1 className={styles.title}>
            Núcleo de Incentivo e Suporte às Egressas e Estudantes
          </h1>
          <p className={styles.lead}>
            Uma plataforma para conectar experiências, próximos passos e grupos
            de apoio.
          </p>

          <FileIllustration />

          <div className={styles.spacer} />

          <LinkButton href="/criar-conta" className={styles.fullWidth}>
            Criar conta
          </LinkButton>
        </main>
      </div>
    </div>
  );
}
