import styles from "./Loading.module.css";

type LoadingProps = {
  /** O que está carregando, quando ajuda dizer (ex.: "Carregando convite…"). */
  label?: string;
};

/**
 * Espera enquanto a tela busca o que precisa mostrar.
 *
 * Use no lugar do conteúdo inteiro, e não ao lado dele: assim nada da tela aparece antes
 * de os dados chegarem, nem pisca quando a resposta manda para outra página (ex.: a A04·1
 * sem sessão volta para a página inicial). Ocupa o espaço que sobrar e fica no meio dele.
 *
 * Para a espera longa das sugestões existe a E03 "Tecendo seu filé…" (#81).
 */
export function Loading({ label = "Carregando…" }: LoadingProps) {
  return (
    <div className={styles.loading} role="status">
      <span className={styles.spinner} aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}
