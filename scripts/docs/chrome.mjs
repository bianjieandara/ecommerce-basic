// Minimal Chrome DevTools Protocol client for the documentation scripts. It starts the Chrome installed on this machine in
// headless mode with its own throw-away profile and needs no npm package (Node's global WebSocket is enough).
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Where Chrome usually lives; set CHROME_PATH to use another browser. */
const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);

/**
 * Waits.
 * @param ms Milliseconds.
 * @returns A promise that resolves after the delay.
 */
export const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Starts headless Chrome and connects to its first page.
 * @param {{ port?: number, width: number, height: number, scale?: number, mobile?: boolean }} options Debug port and phone or desktop viewport.
 * @returns The session: cdp(), evaluate(), goto(), click(), type(), shot(), cookie(), close().
 */
export async function openBrowser({ port = 9400, width, height, scale = 1, mobile = false }) {
  const chromePath = CHROME_CANDIDATES.find((path) => existsSync(path));
  if (!chromePath) throw new Error('Chrome was not found. Set CHROME_PATH to its executable.');
  const profile = mkdtempSync(join(tmpdir(), 'docs-chrome-'));
  const chrome = spawn(
    chromePath,
    [
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profile}`,
      '--headless=new',
      '--no-first-run',
      '--disable-extensions',
      '--hide-scrollbars',
      '--force-color-profile=srgb',
      'about:blank',
    ],
    { stdio: 'ignore' },
  );
  let target;
  for (let attempt = 0; attempt < 40 && !target; attempt += 1) {
    try {
      target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find(
        (entry) => entry.type === 'page',
      );
    } catch {
      await wait(500);
    }
  }
  if (!target) throw new Error('Chrome did not start');
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve) => (socket.onopen = resolve));
  let nextId = 0;
  const pending = new Map();
  socket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) pending.get(message.id)(message);
  };
  const cdp = (method, params = {}) =>
    new Promise((resolve) => {
      nextId += 1;
      pending.set(nextId, resolve);
      socket.send(JSON.stringify({ id: nextId, method, params }));
    });
  await cdp('Page.enable');
  await cdp('Network.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: scale, mobile });
  if (mobile) await cdp('Emulation.setTouchEmulationEnabled', { enabled: true });
  const evaluate = async (expression) =>
    (await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result?.result
      ?.value;

  /**
   * Position of an element's centre in the viewport, scrolled into view.
   * @param selector CSS selector.
   * @returns x and y, or null when the element does not exist.
   */
  const centre = (selector) =>
    evaluate(
      `(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e) return null; e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`,
    );

  return {
    cdp,
    evaluate,
    centre,
    /** Opens a URL and waits for the page to settle. */
    async goto(url, settleMs = 1200) {
      await cdp('Page.navigate', { url });
      await wait(settleMs);
    },
    /** Clicks the element a selector matches with a real mouse event. Returns false when it is missing. */
    async click(selector) {
      const point = await centre(selector);
      if (!point) return false;
      for (const type of ['mousePressed', 'mouseReleased']) {
        await cdp('Input.dispatchMouseEvent', {
          type,
          x: point.x,
          y: point.y,
          button: 'left',
          clickCount: 1,
        });
      }
      await wait(300);
      return true;
    },
    /** Types into the element a selector matches, as the keyboard would. */
    async type(selector, text) {
      if (!(await this.click(selector))) return false;
      await evaluate(`document.querySelector(${JSON.stringify(selector)}).select?.()`);
      await cdp('Input.insertText', { text });
      return true;
    },
    /** Adds a cookie for a host. */
    cookie(name, value, url) {
      return cdp('Network.setCookie', { name, value, url, httpOnly: true, sameSite: 'Lax' });
    },
    /** Saves a screenshot. `fullPage` captures the whole scroll height; `format` is png or jpeg. */
    async shot(path, { fullPage = false, format = 'png', quality = 85 } = {}) {
      const response = await cdp('Page.captureScreenshot', {
        format,
        quality: format === 'jpeg' ? quality : undefined,
        captureBeyondViewport: fullPage,
      });
      writeFileSync(path, Buffer.from(response.result.data, 'base64'));
    },
    /** Stops Chrome and removes its profile. */
    close() {
      socket.close();
      chrome.kill();
      setTimeout(() => rmSync(profile, { recursive: true, force: true }), 1500);
    },
  };
}
