import Image from "next/image";
import styles from "./FileIllustration.module.css";

/**
 * The filé illustration on the entry screens (Figma: Ilustração / Filé, on
 * A01 and A01b). Two layers: the faded mesh behind and the motifs on top.
 *
 * In Figma the mesh is drawn line by line — about forty 1px rectangles with a
 * gradient. Here it becomes a CSS grid at the same spacing, 18px, with a mask
 * that fades the edges, which is what those gradients were doing. Only the
 * motifs are a real image.
 */
export function FileIllustration() {
  return (
    <div className={styles.wrap} aria-hidden="true">
      <div className={styles.mesh} />
      <Image
        className={styles.motifs}
        src="/motivos-de-file.svg"
        alt=""
        width={396}
        height={342}
        priority
        unoptimized
      />
    </div>
  );
}
