// Fork extension test (dev_chanju): author-chosen text sizes.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../archify/', import.meta.url));
const cli = path.join(root, 'bin/archify.mjs');
const renderer = path.join(root, 'renderers/architecture/render-architecture.mjs');

const TARGET = { label: 14, sublabel: 11, edgeLabel: 11, boundaryLabel: 12 };

function diagram({ textSize, quality = 'standard', extra = {} } = {}) {
  return {
    schema_version: 1, diagram_type: 'architecture',
    meta: { title: 'Text size', quality_profile: quality, output: 'diagram.html', ...(textSize ? { textSize } : {}) },
    components: [
      { id: 'a', type: 'frontend', label: 'Web', sublabel: 'browser app', pos: [60, 120], size: [160, 60] },
      { id: 'b', type: 'backend', label: 'API', sublabel: 'service', pos: [420, 120], size: [160, 60] },
    ],
    connections: [{ from: 'a', to: 'b', label: 'HTTPS' }],
    boundaries: [{ kind: 'region', label: 'Cloud', wraps: ['b'] }],
    ...extra,
  };
}

function run(t, input, mode = 'render') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'archify-text-size-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const source = path.join(dir, 'diagram.json');
  const output = path.join(dir, 'diagram.html');
  fs.writeFileSync(source, JSON.stringify(input));
  const result = mode === 'layout'
    ? spawnSync(process.execPath, [renderer, source, output, '--layout-json'], { encoding: 'utf8' })
    : spawnSync(process.execPath, [cli, 'render', 'architecture', source, output], { encoding: 'utf8' });
  return { result, html: () => fs.readFileSync(output, 'utf8'), json: () => JSON.parse(result.stdout) };
}

test('textSize draws every text kind at its chosen size', (t) => {
  const { result, html } = run(t, diagram({ textSize: TARGET }));
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const svg = html();
  assert.match(svg, /<text data-node-label=""[^>]*font-size="14"[^>]*>Web</);
  assert.match(svg, /<text data-detail="context"[^>]*font-size="11"[^>]*>browser app</);
  assert.match(svg, /class="[^"]*" font-size="11" text-anchor="middle">HTTPS</);
  assert.match(svg, /<text data-boundary-label=""[^>]*font-size="12"[^>]*>Cloud</);
});

test('connection label masks and boundary titles are measured at the chosen size', (t) => {
  const plain = run(t, diagram(), 'layout');
  const sized = run(t, diagram({ textSize: TARGET }), 'layout');
  assert.equal(plain.result.status, 0, plain.result.stdout + plain.result.stderr);
  assert.equal(sized.result.status, 0, sized.result.stdout + sized.result.stderr);
  const [before] = plain.json().labels;
  const [after] = sized.json().labels;
  // 5 units: max(30, 5 * 0.6 * 11 + 10) = 43; height 11 + 6; the mask grows upward.
  assert.equal(before.height, 14);
  assert.equal(after.width, 43);
  assert.equal(after.height, 17);
  assert.equal(after.labelAt[1] - after.y, 13);
  assert.equal(after.y + after.height, before.y + before.height);
  const html = run(t, diagram({ textSize: TARGET })).html();
  const mask = /<rect data-graph-role="structural-frame-label-mask" x="[^"]*" y="[^"]*" width="([^"]*)" height="([^"]*)"/.exec(html);
  // Title height max(16, ceil(12 + 7)) = 19; width 5 * 0.6 * 12 + 10 = 46.
  assert.equal(Number(mask[2]), 19);
  assert.equal(Number(mask[1]), 46);
});

test('a larger name size makes the static overflow check measure the shrink floor, not the preferred size', (t) => {
  // 16 units at 14px would need 134px, but the name shrinks to fit the 120px card.
  const input = diagram({ textSize: { label: 14 } });
  input.components[0] = { ...input.components[0], label: 'ABCDEFGHIJKLMNOP', size: [120, 60] };
  const { result, html } = run(t, input);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(html(), /<text data-node-label=""[^>]*font-size="11.6"[^>]*>ABCDEFGHIJKLMNOP</);
});

test('a smaller name size tightens the static overflow check to that size', (t) => {
  const input = diagram({ textSize: { label: 9 } });
  input.components[0] = { ...input.components[0], label: 'ABCDEFGHIJKLMNOPQRSTUVWX', size: [140, 60] };
  assert.equal(run(t, input).result.status, 0);
  const plain = diagram();
  plain.components[0] = input.components[0];
  assert.notEqual(run(t, plain).result.status, 0);
});

test('diagrams without textSize render the same bytes as before the extension', (t) => {
  const { result, html } = run(t, diagram());
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const svg = html();
  assert.match(svg, /font-size="8" text-anchor="middle">HTTPS</);
  assert.match(svg, /<text data-node-label=""[^>]*y="148"[^>]*font-size="11"/);
  assert.match(svg, /<text data-detail="context"[^>]*y="164"[^>]*font-size="9"/);
  assert.doesNotMatch(svg, /baselineOffset/);
});

test('schema rejects sizes outside the supported range', (t) => {
  for (const textSize of [{ label: 3 }, { edgeLabel: 40 }, { label: '14' }, { other: 10 }]) {
    const { result } = run(t, diagram({ textSize }));
    assert.notEqual(result.status, 0, JSON.stringify(textSize));
    assert.match(result.stdout + result.stderr, /textSize/);
  }
});

test('variant combinations place connection labels with the sized mask', (t) => {
  const input = diagram({
    textSize: TARGET,
    extra: {
      variants: [{ id: 'host', label: 'Host', options: [{ id: 'one', label: 'One' }, { id: 'two', label: 'Two' }] }],
    },
  });
  input.components.push({ id: 'c', type: 'database', label: 'DB', sublabel: 'store', pos: [720, 120], size: [160, 60], when: { host: 'two' } });
  input.connections.push({ from: 'b', to: 'c', label: 'SQL', when: { host: 'two' } });
  const { result, html } = run(t, input);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const svg = html();
  // The viewer script repositions masks with the sized baseline offset.
  assert.match(svg, /geometry\[2\]\[1\] - 13\)/);
  const label = /<rect x="([^"]*)" y="([^"]*)" width="43" height="17" rx="3" class="c-mask"\/>\n {10}<text x="([^"]*)" y="([^"]*)"[^>]*font-size="11"[^>]*>HTTPS</.exec(svg);
  assert.ok(label, 'sized HTTPS label');
  assert.equal(Number(label[4]) - Number(label[2]), 13);
});

test('variant diagrams without textSize keep the default mask offset', (t) => {
  const input = diagram({
    extra: { variants: [{ id: 'host', label: 'Host', options: [{ id: 'one', label: 'One' }, { id: 'two', label: 'Two' }] }] },
  });
  const { result, html } = run(t, input);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(html(), /geometry\[2\]\[1\] - 10\)/);
});
