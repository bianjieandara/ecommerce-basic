// Reveal-on-scroll: adds `is-visible` to `[data-reveal]` elements as they enter the viewport.
// Without IntersectionObserver or with reduced motion, every element is shown immediately (see animations.css).

/**
 * Starts observing all reveal elements on the page.
 */
export function initReveal(): void {
  const items = document.querySelectorAll<HTMLElement>('[data-reveal]');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce || !('IntersectionObserver' in window)) {
    items.forEach((item) => item.classList.add('is-visible'));
    return;
  }
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      }
    },
    { rootMargin: '0px 0px -10% 0px' },
  );
  items.forEach((item) => observer.observe(item));
}
