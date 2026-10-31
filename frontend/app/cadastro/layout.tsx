import { AppHeader } from "@/components/AppHeader";
import styles from "./layout.module.css";

/** Moldura das telas de cadastro da menina: cabeçalho com a marca e uma coluna central. */
export default function SignupLayout({ children }: LayoutProps<"/cadastro">) {
  return (
    <div className={styles.page}>
      <AppHeader />
      <main className={styles.main}>{children}</main>
    </div>
  );
}
