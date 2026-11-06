// "Por que filé?" (A06·0): a explicação que abre o filé na primeira vez (#82, #83).
//
// TEMPORÁRIO: o "já viu" fica no sessionStorage. O tipo segue a rota descrita na
// issue #84 (marca no perfil) e será trocado pelos tipos gerados do OpenAPI; a
// troca pela chamada a /api é a issue #85. Dados fictícios; nada sai do navegador.

/** Caminhos do filé, na ordem em que ela passa por eles. */
export const FILE_PATHS = {
  /** A06·0. Sem o `?rever=1`, só aparece na primeira vez. */
  intro: "/por-que-file",
  /** A06·1, a tela das faixas (#87). */
  discover: "/descobrir",
} as const;

/** Query que força a explicação a aparecer de novo, para o "?" da #114. */
export const REVER = "rever";

const STORAGE_KEY = "nise-mock-file";

function lerVisto(): boolean {
  try {
    return sessionStorage.getItem(STORAGE_KEY) === "visto";
  } catch {
    return false;
  }
}

/**
 * Se ela já viu a explicação. Vem do perfil quando a #84 existir; aqui é só o
 * dado de teste.
 */
export async function introJaVista(): Promise<boolean> {
  return lerVisto();
}

/** Marca a explicação como vista, para ela não aparecer de novo (RF-F10.02). */
export async function marcarIntroVista(): Promise<void> {
  try {
    sessionStorage.setItem(STORAGE_KEY, "visto");
  } catch {
    // Sem sessionStorage (aba anônima bloqueada): a explicação aparece de novo,
    // que é o lado seguro de errar.
  }
}

/** Um passo da metáfora do filé, na ordem em que aparece na tela. */
export type PassoDoFile = {
  /** Nome do arquivo em public/file/, sem a extensão. */
  imagem: string;
  titulo: string;
  texto: string;
};

// Textos do Figma (A06·0).
export const PASSOS: PassoDoFile[] = [
  {
    imagem: "file-passo-1",
    titulo: "A rede é a base.",
    texto: "Aqui, a NISE traz as sugestões.",
  },
  {
    imagem: "file-passo-2",
    titulo: "A rendeira escolhe cada ponto.",
    texto: "Você escolhe o que quer fazer.",
  },
  {
    imagem: "file-passo-3",
    titulo: "No fim, sai uma peça única.",
    texto: "E cada experiência vai formando sua história na computação.",
  },
];
