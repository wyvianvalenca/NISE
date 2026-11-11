// "Por que filé?" (A06·0): the explanation that opens the filé the first time
// (#82, #83).
//
// TEMPORARY: the "already seen" flag lives in sessionStorage. The type follows
// the route described in issue #84 (flag on the profile) and will be replaced
// by the types generated from OpenAPI; swapping it for the /api call is issue
// #85. The data is fictional; nothing leaves the browser.
//
// Named file-intro and not file to leave lib/file.ts for the "Seu filé"
// screen (#115), which is a different thing.

/** The filé's paths, in the order she goes through them. */
export const FILE_PATHS = {
  /** A06·0. Without `?rever=1` it only shows the first time. */
  intro: "/por-que-file",
  /** A06·1, the bands screen (#87). */
  discover: "/descobrir",
} as const;

/** Query that forces the explanation to show again, for the "?" of #114. */
export const REVIEW_PARAM = "rever";

const STORAGE_KEY = "nise-mock-file-intro";

function readSeen(): boolean {
  try {
    return sessionStorage.getItem(STORAGE_KEY) === "seen";
  } catch {
    return false;
  }
}

/**
 * Whether she has already seen the explanation. It will come from the profile
 * once #84 exists; here it is only the test data.
 */
export async function introAlreadySeen(): Promise<boolean> {
  return readSeen();
}

/** Marks the explanation as seen, so it does not show again (RF-F10.02). */
export async function markIntroSeen(): Promise<void> {
  try {
    sessionStorage.setItem(STORAGE_KEY, "seen");
  } catch {
    // No sessionStorage (a blocked private window): the explanation shows
    // again, which is the safe way to be wrong.
  }
}

/** One step of the filé metaphor, in the order it appears on screen. */
export type FileStep = {
  /** File name in public/file/, without the extension. */
  image: string;
  title: string;
  text: string;
};

// Wording from the Figma screen (A06·0). Kept in Portuguese: she reads it.
export const FILE_STEPS: FileStep[] = [
  {
    image: "file-passo-1",
    title: "A rede é a base.",
    text: "Aqui, a NISE traz as sugestões.",
  },
  {
    image: "file-passo-2",
    title: "A rendeira escolhe cada ponto.",
    text: "Você escolhe o que quer fazer.",
  },
  {
    image: "file-passo-3",
    title: "No fim, sai uma peça única.",
    text: "E cada experiência vai formando sua história na computação.",
  },
];
