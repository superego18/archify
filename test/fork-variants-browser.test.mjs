// Fork extension test (dev_chanju): viewer state follows a variant change.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ChromeVisualBrowser, findChrome } from '../archify/bin/visual-check.mjs';

const root = fileURLToPath(new URL('../archify/', import.meta.url));
const chrome = process.env.ARCHIFY_CHROME ? findChrome() : null;

// a reaches d through b for one option and through c for the other.
const diagram = {
  schema_version: 1, diagram_type: 'architecture',
  meta: { title: 'Variant route', quality_profile: 'standard', output: 'diagram.html' },
  variants: [{ id: 'link', label: 'Link', options: [{ id: 'top', label: 'Top' }, { id: 'bottom', label: 'Bottom' }] }],
  components: [
    { id: 'a', type: 'frontend', label: 'A', pos: [40, 200], size: [120, 60] },
    { id: 'b', type: 'database', label: 'B', pos: [300, 80], size: [120, 60], when: { link: 'top' } },
    { id: 'c', type: 'database', label: 'C', pos: [300, 320], size: [120, 60], when: { link: 'bottom' } },
    { id: 'd', type: 'backend', label: 'D', pos: [560, 200], size: [120, 60] },
  ],
  connections: [
    { from: 'a', to: 'b', label: 'up' }, { from: 'b', to: 'd', label: 'over' },
    { from: 'a', to: 'c', label: 'down' }, { from: 'c', to: 'd', label: 'under' },
  ],
};

test('route and lens highlights are rebuilt for the chosen combination', {
  skip: chrome ? false : 'Set ARCHIFY_CHROME to run real-browser variant checks.',
}, async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'archify-variants-browser-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const source = path.join(dir, 'diagram.json');
  const output = path.join(dir, 'diagram.html');
  fs.writeFileSync(source, JSON.stringify(diagram));
  execFileSync(process.execPath, [path.join(root, 'bin/archify.mjs'), 'render', 'architecture', source, output]);

  const browser = new ChromeVisualBrowser(chrome);
  t.after(() => browser.close());
  const session = await browser.sessionPromise;
  const send = (method, params = {}) => browser.cdp.send(method, params, session);
  async function run(expression) {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    assert.equal(result.exceptionDetails, undefined, result.exceptionDetails?.exception?.description);
    return result.result?.value;
  }
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  const loaded = browser.cdp.waitFor('Page.loadEventFired', session);
  await send('Page.navigate', { url: pathToFileURL(output).href });
  await loaded;
  await run('(async () => { await document.fonts.ready; await Archify.viewerChromeLayout.whenStable(); })()');

  const pick = (option) => run(`document.querySelector('#fork-variant-panel button[data-option="${option}"]').click()`);
  const route = () => run(`(() => ({
    nodes: (Archify.routeProbe.result() || {}).nodes || null,
    mode: Archify.routeProbe.active(),
    marked: [...document.querySelectorAll('svg [data-route-match]')].map(e => e.getAttribute('data-node-id') || e.getAttribute('data-variant-node-id')).filter(Boolean),
    hash: location.hash,
  }))()`);

  await run(`Archify.routeProbe.begin({ source: 'a', focusNode: false }); Archify.routeProbe.choose('d')`);
  assert.deepEqual((await route()).nodes, ['a', 'b', 'd']);
  await pick('bottom');
  let state = await route();
  assert.deepEqual(state.nodes, ['a', 'c', 'd'], 'both ends remain, so the route is found again');
  assert.deepEqual(state.marked.sort(), ['a', 'c', 'd'], 'no highlight stays on the hidden path');
  assert.equal(state.hash, '#route=a~d');

  await pick('top');
  await run(`Archify.routeProbe.begin({ source: 'a', focusNode: false }); Archify.routeProbe.choose('b')`);
  await pick('bottom');
  state = await route();
  assert.equal(state.mode, null, 'a route whose end is hidden is cleared');
  assert.deepEqual(state.marked, []);
  assert.equal(state.hash, '');

  await run(`Archify.semanticLens.select('database')`);
  await pick('top');
  const lens = await run(`(() => ({
    active: Archify.semanticLens.active(),
    selected: [...document.querySelectorAll('svg [data-lens-selected]')].map(e => e.getAttribute('data-node-id') || e.getAttribute('data-variant-node-id')),
  }))()`);
  assert.deepEqual(lens, { active: ['database'], selected: ['b'] }, 'the lens counts the shown combination');

  // A zoomed canvas pans from a press; the panel keeps its presses.
  await run('Archify.semanticLens.clear(); Archify.view.zoomIn()');
  const point = await run(`(() => { const r = document.querySelector('#fork-variant-panel button[data-option="bottom"]').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`);
  for (const type of ['mousePressed', 'mouseReleased']) {
    await send('Input.dispatchMouseEvent', { type, x: point[0], y: point[1], button: 'left', clickCount: 1 });
  }
  assert.equal(await run(`document.querySelector('#fork-variant-panel button[data-option="bottom"]').getAttribute('aria-pressed')`), 'true');
});
