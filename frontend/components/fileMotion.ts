import { cellOrigin, type Cell, type FileChanges } from "@/lib/file";

// As animações do desenho do filé (FileDrawing.tsx), pela Web Animations API.
//
// Não são classes CSS de propósito: com cacheComponents, o Next esconde o Seu filé
// (display: none) enquanto ela está em outra tela, e o navegador reinicia as animações CSS
// de um elemento que volta a aparecer. A animação de uma volta se repetia na volta seguinte.
// Uma animação disparada por JavaScript roda uma vez e acaba; quem dispara (FileDrawing)
// lembra qual rodada de mudanças já animou.

// As etapas, nesta ordem, para ela ver cada mudança no quadradinho que ela mexeu:
// 1. na casa antiga, o que andou se preenche (FILL_MS) e o que saiu se desfaz (LEAVE_MS);
// 2. os que mudaram de casa deslizam para a nova (SLIDE_MS);
// 3. os novos desenham a borda, um depois do outro (FRESH_STAGGER_MS).
const FILL_MS = 500;
const LEAVE_MS = 700;
const SLIDE_MS = 350;
const FRESH_STAGGER_MS = 120;

function translate(cell: Cell) {
  const { x, y } = cellOrigin(cell);
  return `translate(${x}px, ${y}px)`;
}

type Callbacks = {
  /** Um quadradinho novo ou que andou terminou de se animar. */
  onSettled: (id: string) => void;
  /** Um quadradinho removido terminou de sair. */
  onRemoved: (id: string) => void;
};

/** A borda desenhada de 0 a 1 (o retângulo tem pathLength 1). */
const BORDER_DRAWN: Keyframe[] = [
  { strokeDasharray: "1", strokeDashoffset: 1 },
  { strokeDasharray: "1", strokeDashoffset: 0 },
];
const FADE_IN: Keyframe[] = [{ opacity: 0 }, { opacity: 1 }];
// O miolo cresce de um ponto (a origem fica no CSS: o canto na metade teal, o centro no concluído).
const GROW: Keyframe[] = [{ scale: 0 }, { scale: 1 }];

function reversed(keyframes: Keyframe[]): Keyframe[] {
  return [...keyframes].reverse();
}

/** O ancestral que rola (no Seu filé, o meio da tela, entre o cabeçalho e a barra de baixo). */
function scrollParent(element: Element): HTMLElement | null {
  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    const { overflowY } = getComputedStyle(parent);
    if (overflowY === "auto" || overflowY === "scroll") return parent;
  }
  return null;
}

/**
 * Traz o desenho para o meio da tela, se ele não estiver inteiro à vista, e resolve quando
 * a rolagem termina. Ao voltar de uma atividade aberta pela lista, a tela volta rolada para
 * baixo, e a animação aconteceria fora da vista.
 */
export function bringIntoView(element: Element): Promise<void> {
  const parent = scrollParent(element);
  const area = parent ? parent.getBoundingClientRect() : { top: 0, bottom: window.innerHeight };
  const box = element.getBoundingClientRect();
  if (box.top >= area.top && box.bottom <= area.bottom) return Promise.resolve();

  element.scrollIntoView({ block: "center", behavior: "smooth" });
  return new Promise((resolve) => {
    const target: EventTarget = parent ?? window;
    function done() {
      target.removeEventListener("scrollend", done);
      clearTimeout(timer);
      resolve();
    }
    // Se o navegador não avisar o fim da rolagem, as animações começam assim mesmo.
    const timer = setTimeout(done, 800);
    target.addEventListener("scrollend", done);
  });
}

/**
 * Anima uma rodada de mudanças no desenho: o que entrou desenha a borda, o que andou se
 * preenche e o que saiu faz o caminho de volta. Avisa no fim de cada um. Com
 * prefers-reduced-motion, nada se move: avisa na hora.
 *
 * Se o desenho estiver fora da vista, ele entra na tela antes, e as animações esperam,
 * paradas no primeiro quadro (a borda ainda sem desenho, o miolo ainda vazio).
 */
export function playFileChanges(svg: SVGSVGElement, changes: FileChanges, { onSettled, onRemoved }: Callbacks) {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const hasMotion = changes.fresh.size + changes.filled.size + changes.removed.length > 0;
  const inView = reduce || !hasMotion ? Promise.resolve() : bringIntoView(svg);
  const waiting: Animation[] = [];

  function animate(element: Element | null, keyframes: Keyframe[], options: KeyframeAnimationOptions) {
    if (!element) return null;
    const animation = element.animate(keyframes, options);
    animation.pause();
    waiting.push(animation);
    return animation;
  }

  // Quando todas terminam, avisa. Uma animação cancelada não avisa.
  function whenDone(animations: (Animation | null)[], done: () => void) {
    const running = animations.filter((animation): animation is Animation => animation !== null);
    Promise.all(running.map((animation) => animation.finished)).then(done, () => {});
  }

  function part(group: Element, name: string) {
    return group.querySelector(`[data-part='${name}']`);
  }

  function group(attribute: string, id: string) {
    return svg.querySelector(`[${attribute}='${CSS.escape(id)}']`);
  }

  // Quando cada etapa começa.
  const slideAt = Math.max(changes.removed.length > 0 ? LEAVE_MS : 0, changes.filled.size > 0 ? FILL_MS : 0);
  const freshAt = slideAt + (changes.moved.size > 0 ? SLIDE_MS : 0);

  // 2. Os que mudaram de casa ficam na antiga até a vez deles, e então deslizam.
  for (const [id, { from, to }] of reduce ? [] : changes.moved) {
    animate(group("data-square", id), [{ transform: translate(from) }, { transform: translate(to) }], {
      duration: SLIDE_MS,
      delay: slideAt,
      easing: "ease-in-out",
      fill: "backwards",
    });
  }

  let order = 0;
  for (const id of changes.fresh) {
    const square = group("data-square", id);
    if (reduce || !square) {
      onSettled(id);
      continue;
    }
    const delay = freshAt + order++ * FRESH_STAGGER_MS;
    whenDone(
      [
        animate(part(square, "border"), BORDER_DRAWN, { duration: 600, delay, easing: "ease-out", fill: "backwards" }),
        animate(part(square, "fill"), FADE_IN, { duration: 300, delay: delay + 400, easing: "ease-out", fill: "backwards" }),
        animate(part(square, "half"), FADE_IN, { duration: 300, delay: delay + 400, easing: "ease-out", fill: "backwards" }),
        // O concluído não tem borda: a cor aparece de uma vez.
        animate(part(square, "solid"), FADE_IN, { duration: 400, delay, easing: "ease-out", fill: "backwards" }),
      ],
      () => onSettled(id),
    );
  }

  for (const id of changes.filled) {
    const square = group("data-square", id);
    if (reduce || !square) {
      onSettled(id);
      continue;
    }
    whenDone(
      [
        animate(part(square, "half"), GROW, { duration: FILL_MS, easing: "ease-out" }),
        animate(part(square, "solid"), GROW, { duration: FILL_MS, easing: "ease-out" }),
      ],
      () => onSettled(id),
    );
  }

  for (const { square: removed } of changes.removed) {
    const square = group("data-leaving", removed.id);
    if (reduce || !square) {
      onRemoved(removed.id);
      continue;
    }
    // O miolo encolhe, a borda se desfaz, e o quadradinho some.
    const gone: KeyframeAnimationOptions = { easing: "ease-in", fill: "forwards" };
    animate(part(square, "half"), reversed(GROW), { ...gone, duration: 350 });
    animate(part(square, "solid"), reversed(GROW), { ...gone, duration: 350 });
    animate(part(square, "fill"), reversed(FADE_IN), { ...gone, duration: 250, delay: 150 });
    animate(part(square, "border"), reversed(BORDER_DRAWN), { ...gone, duration: 400, delay: 250 });
    whenDone(
      [animate(square, [{ opacity: 1 }, { opacity: 1, offset: 0.9 }, { opacity: 0 }], { ...gone, duration: LEAVE_MS })],
      () => onRemoved(removed.id),
    );
  }

  inView.then(() => waiting.forEach((animation) => animation.play()));
}
