// Counts a figure marked with `data-count` up from zero the first time it scrolls into view, so the numbers that carry the
// "Por qué te conviene" section land with some weight. The page already ships the final value as text, so no JavaScript, an old
// browser or `prefers-reduced-motion` all leave the real number on screen.

const DURATION = 1100;
const PARTS = /^(\D*?)([\d.,]+)(.*)$/s;

/** Splits "+19.2 %" into its prefix, its number and its suffix, and remembers how the page wrote the number. */
function parse(text) {
  const match = PARTS.exec(text);
  if (!match) return null;
  const [, prefix, digits, suffix] = match;
  const plain = digits.replace(/,/g, '');
  const value = Number.parseFloat(plain);
  if (!Number.isFinite(value)) return null;
  const dot = plain.indexOf('.');
  return {
    prefix,
    suffix,
    value,
    decimals: dot === -1 ? 0 : plain.length - dot - 1,
    // Kept so the counting reads exactly as the page wrote it, instead of switching separators by locale half-way up.
    group: digits.includes(',') ? ',' : '',
  };
}

function write(value, shape) {
  const fixed = value.toFixed(shape.decimals);
  if (!shape.group) return fixed;
  const [whole, fraction] = fixed.split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, shape.group);
  return fraction ? `${grouped}.${fraction}` : grouped;
}

function run(el, shape) {
  const start = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - start) / DURATION);
    // Ease out, so the number slows down as it reaches its real value instead of stopping dead.
    const eased = 1 - Math.pow(1 - t, 3);
    el.textContent = shape.prefix + write(shape.value * eased, shape) + shape.suffix;
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function setUp() {
  const figures = document.querySelectorAll('[data-count]:not([data-counted])');
  if (figures.length === 0) return;
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (still || typeof IntersectionObserver === 'undefined') return;

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        observer.unobserve(entry.target);
        const shape = parse(entry.target.dataset.countFrom ?? '');
        if (shape) run(entry.target, shape);
      }
    },
    { threshold: 0.4 },
  );

  for (const el of figures) {
    const shape = parse(el.textContent ?? '');
    if (!shape) continue;
    el.dataset.counted = '';
    el.dataset.countFrom = el.textContent ?? '';
    // Hold the width the final number needs, so nothing around it jumps while it counts.
    el.style.minWidth = `${el.getBoundingClientRect().width}px`;
    el.textContent = shape.prefix + '0' + shape.suffix;
    observer.observe(el);
  }
}

setUp();
document.addEventListener('astro:page-load', setUp);
