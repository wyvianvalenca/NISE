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

/**
 * Deixa as animações da página mais lentas (rate 0.25 = 4 vezes), para o teste ver as marcas
 * de animação (data-fresh, data-filled, data-leaving) antes de elas saírem no fim.
 */
export async function slowAnimations(page: Page, rate = 0.25) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Animation.enable");
  await cdp.send("Animation.setPlaybackRate", { playbackRate: rate });
}
