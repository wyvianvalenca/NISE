import { AppHeader } from "@/components/AppHeader";
import { LinkButton } from "@/components/Button";
import { FileIllustration } from "@/components/FileIllustration";
import { TextLink } from "@/components/TextLink";
import styles from "./page.module.css";

/**
 * A01 "Boas-vindas" (Figma 511:15325): a porta de entrada de quem chega
 * sozinha, sem convite de grupo (fluxo M2, issue #51).
 *
 * Fica no servidor: não há estado nem busca aqui, e "Criar conta" é
 * navegação, então é link e não botão com `router.push`.
 */
export default function Home() {
  return (
    <div className={styles.page}>
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
  );
}
