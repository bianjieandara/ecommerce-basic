// Runs one external command for the deploy and provisioning scripts. Dry-run mode prints the command and runs nothing.
// Commands go through the shell so that `npx` and `npm` resolve to their Windows .cmd shims as well.
import { spawnSync } from 'node:child_process';
import { ROOT } from './clients.mjs';

/**
 * Quotes one argument for the shell when it holds anything beyond a plain path or word.
 * @param {string} arg Argument.
 * @returns {string} Shell-safe argument.
 */
export function quoteArg(arg) {
  return /^[A-Za-z0-9_./:=@-]+$/.test(arg) ? arg : `"${arg.replace(/"/g, '\\"')}"`;
}

/**
 * Runs a command in the repository root, or only prints it in dry-run mode.
 * @param {{ command: string, args: string[], env?: NodeJS.ProcessEnv, dryRun?: boolean, capture?: boolean }} step
 *   `capture` collects stdout and stderr (for parsing) instead of showing them live.
 * @returns {{ ok: boolean, output: string }} `ok` is true in dry-run mode.
 */
export function runStep({ command, args, env = process.env, dryRun = false, capture = false }) {
  const line = [command, ...args].map(quoteArg).join(' ');
  if (dryRun) {
    console.log(`[dry-run] $ ${line}`);
    return { ok: true, output: '' };
  }
  console.log(`$ ${line}`);
  const result = spawnSync(line, {
    cwd: ROOT,
    env,
    shell: true,
    encoding: 'utf8',
    stdio: capture ? 'pipe' : 'inherit',
  });
  const output = capture ? `${result.stdout ?? ''}${result.stderr ?? ''}` : '';
  return { ok: result.status === 0, output };
}

/**
 * Runs a Wrangler create command and treats "already exists" as success, so provisioning can be run again.
 * Queues report "is already taken"; buckets, KV and D1 report "already exists".
 * @param {{ args: string[], env?: NodeJS.ProcessEnv, dryRun?: boolean }} step Arguments after `npx wrangler`.
 * @returns {{ created: boolean }} `created` is false when the resource already existed.
 * @throws {Error} When the command fails for any other reason.
 */
export function createIfMissing({ args, env, dryRun = false }) {
  const result = runStep({ command: 'npx', args: ['wrangler', ...args], env, dryRun, capture: true });
  if (result.ok) return { created: !dryRun };
  if (/already (exists|taken)|is taken/i.test(result.output)) {
    console.log(`[exists] wrangler ${args.join(' ')}`);
    return { created: false };
  }
  throw new Error(`wrangler ${args.join(' ')} failed:\n${result.output}`);
}
