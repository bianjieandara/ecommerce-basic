// Carousel controller: one implementation for every carousel in the store. Scroll-snap does the swiping natively;
// this adds prev/next buttons, dots, and autoplay that pauses on hover, focus, hidden tabs and reduced motion.

/** Autoplay delay used when a carousel does not set data-autoplay. */
const DEFAULT_AUTOPLAY_MS = 6000;

/**
 * Wires one carousel element. Expects: a track with `data-carousel-track`, slides as its children,
 * optional `data-carousel-prev` / `data-carousel-next` buttons and a `data-carousel-dots` container.
 * @param root The carousel root element.
 */
export function initCarousel(root: HTMLElement): void {
  const track = root.querySelector<HTMLElement>('[data-carousel-track]');
  if (!track) return;
  const slides = [...track.children] as HTMLElement[];
  if (slides.length < 2) return;

  const prev = root.querySelector<HTMLButtonElement>('[data-carousel-prev]');
  const next = root.querySelector<HTMLButtonElement>('[data-carousel-next]');
  const dotsHost = root.querySelector<HTMLElement>('[data-carousel-dots]');
  const autoplayMs = Number(root.dataset.autoplay ?? DEFAULT_AUTOPLAY_MS);
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // The button is the touch target (44px square). The visible dot is its child, so the dots stay small on screen but easy to hit.
  const dots = slides.map((_, index) => {
    const dot = document.createElement('button');
    dot.type = 'button';
    dot.className = 'group flex min-h-11 min-w-11 items-center justify-center';
    dot.setAttribute('aria-label', `${index + 1} / ${slides.length}`);
    const bar = document.createElement('span');
    bar.className = 'h-2.5 w-2.5 rounded-full bg-text/25 group-aria-[current=true]:bg-primary';
    dot.appendChild(bar);
    dot.addEventListener('click', () => goTo(index));
    dotsHost?.appendChild(dot);
    return dot;
  });

  let current = 0;
  let timer: number | undefined;
  let paused = false;

  /** Index of the slide nearest the current scroll position. */
  const indexFromScroll = (): number => {
    const left = track.scrollLeft;
    let best = 0;
    let bestDistance = Infinity;
    slides.forEach((slide, index) => {
      const distance = Math.abs(slide.offsetLeft - track.offsetLeft - left);
      if (distance < bestDistance) {
        best = index;
        bestDistance = distance;
      }
    });
    return best;
  };

  /**
   * Scrolls to a slide and updates the dots.
   * @param index Slide index (wraps around).
   */
  const goTo = (index: number): void => {
    current = (index + slides.length) % slides.length;
    const target = slides[current];
    if (target)
      track.scrollTo({
        left: target.offsetLeft - track.offsetLeft,
        behavior: reduceMotion ? 'auto' : 'smooth',
      });
    dots.forEach((dot, i) => dot.setAttribute('aria-current', String(i === current)));
  };

  const stop = (): void => {
    if (timer !== undefined) window.clearInterval(timer);
    timer = undefined;
  };
  const start = (): void => {
    if (reduceMotion || paused || autoplayMs <= 0) return;
    stop();
    timer = window.setInterval(() => goTo(current + 1), autoplayMs);
  };

  prev?.addEventListener('click', () => goTo(current - 1));
  next?.addEventListener('click', () => goTo(current + 1));
  track.addEventListener(
    'scroll',
    () => {
      current = indexFromScroll();
      dots.forEach((dot, i) => dot.setAttribute('aria-current', String(i === current)));
    },
    { passive: true },
  );
  root.addEventListener('mouseenter', () => {
    paused = true;
    stop();
  });
  root.addEventListener('mouseleave', () => {
    paused = false;
    start();
  });
  root.addEventListener('focusin', () => {
    paused = true;
    stop();
  });
  root.addEventListener('focusout', () => {
    paused = false;
    start();
  });
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));

  goTo(0);
  start();
}

/** Initializes every carousel on the page. Safe to call more than once: each root is wired once. */
export function initCarousels(): void {
  document.querySelectorAll<HTMLElement>('[data-carousel]').forEach((root) => {
    if (root.dataset.carouselReady === 'true') return;
    root.dataset.carouselReady = 'true';
    initCarousel(root);
  });
}
