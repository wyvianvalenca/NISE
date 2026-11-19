import type { Page } from "@playwright/test";

/**
 * Registra, a cada quadro, quais destes textos estavam visíveis na tela. Serve para pegar o
 * que aparece por um instante só, como a tela de antes piscando na volta, que um `expect`
 * comum pode não ver. O registro roda no requestAnimationFrame, logo antes de o quadro ser
 * pintado, e lê o innerText, que deixa de fora o que está escondido (display: none).
 *
 * Devolve uma função que lê os textos vistos desde a chamada.
 */
export async function watchFrames(page: Page, texts: string[]): Promise<() => Promise<string[]>> {
  await page.evaluate((watched) => {
    const seen: string[] = [];
    (window as unknown as { __framesSeen: string[] }).__framesSeen = seen;
    const tick = () => {
      const text = document.body.innerText;
      for (const item of watched) {
        if (text.includes(item) && !seen.includes(item)) seen.push(item);
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, texts);

  return () => page.evaluate(() => (window as unknown as { __framesSeen: string[] }).__framesSeen);
}
