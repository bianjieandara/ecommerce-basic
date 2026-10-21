# Working rules for this repository

Before any task, read `docs/IMPLEMENTATION_PLAN.md` and `docs/PROGRESS.md`. Work in stage order.

## Code rules

- Everything in English: code, identifiers, comments, docs. Each file starts with a 1–3 line header comment.
- Every exported symbol has a JSDoc comment. Comment the _why_.
- Respect the layer boundaries in `docs/ARCHITECTURE.md`. ESLint enforces them.
- No duplicated code. Search `src/` before adding a helper or component.
- Money: integer minor units (`*_minor`). Tax: basis points. Never floats for money.
- Strings in UI come from `src/ui/i18n`. Never hardcode user-visible text.
- Mobile first (design at 360px). Touch targets ≥ 44px. Honor `prefers-reduced-motion`.
- Keep files under ~250 lines.
- Dependencies: only the approved list in the plan. New ones need a note in `docs/DECISIONS.md`.
- No automated tests for now. Verification is `npm run check`, `npm run build` and the stage smoke checks.

## Process rules

- After every numbered step: `npm run check`. Fix errors before moving on.
- End of stage: `npm run check && npm run build`, tick `docs/PROGRESS.md`, commit `feat(stage-N): <summary>`, push.
- Never commit secrets. Never edit generated files (`wrangler.jsonc`, `worker-configuration.d.ts`, `.astro/`).
- Ask the user for anything that needs their accounts (Cloudflare login, Stripe, PayPal, Meta, domains).
