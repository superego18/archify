// Fork extension test (dev_chanju): author-supplied node icons.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../archify/', import.meta.url));
const cli = path.join(root, 'bin/archify.mjs');
const svg = `data:image/svg+xml;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><path fill="#c925d1" d="M0 0h64v64H0z"/></svg>').toString('base64')}`;

function render(t, iconImage, extra = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'archify-node-image-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const source = path.join(dir, 'diagram.json');
  const output = path.join(dir, 'diagram.html');
  fs.writeFileSync(source, JSON.stringify({
    schema_version: 1, diagram_type: 'architecture',
    meta: { title: 'Node image', quality_profile: 'standard', output: 'diagram.html' },
    components: [
      { id: 'a', type: 'database', label: 'Aurora', pos: [40, 225], size: [140, 60], ...(iconImage === undefined ? {} : { iconImage }) },
      { id: 'b', type: 'backend', label: 'B', pos: [300, 225], size: [120, 60] },
    ],
    connections: [{ from: 'b', to: 'a', label: 'write' }],
    ...extra,
  }));
  const result = spawnSync(process.execPath, [cli, 'render', 'architecture', source, output], { encoding: 'utf8' });
  return { result, html: () => fs.readFileSync(output, 'utf8') };
}

test('iconImage gets a left icon slot, replaces the sigil and shifts the text', (t) => {
  const { result, html } = render(t, svg);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const card = /<g id="node-a"[\s\S]*?\n {8}<\/g>/.exec(html())[0];
  // Card at x=40, 140x60: slot at x+10, vertically centred; text centre 110 + 19.
  assert.match(card, /<image data-node-icon-image="" href="data:image\/svg\+xml;base64,[^"]+" x="50" y="241" width="28" height="28"/);
  assert.doesNotMatch(card, /data-semantic-sigil/);
  assert.match(card, /<text data-node-label="" x="129"/);
});

test('only self-contained SVG or PNG data URIs are accepted', (t) => {
  for (const value of ['https://example.com/icon.svg', 'data:text/html;base64,PGI+', 'data:image/svg+xml,<svg/>']) {
    const { result } = render(t, value);
    assert.notEqual(result.status, 0, value);
    assert.match(result.stdout + result.stderr, /iconImage/);
  }
});

test('nodes without iconImage carry no image', (t) => {
  const { result, html } = render(t);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.doesNotMatch(html(), /data-node-icon-image/);
});

test('iconSlot moves every type sigil into the slot at slot size', (t) => {
  const { result, html } = render(t, undefined, { iconSlot: true });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const card = /<g id="node-a"[\s\S]*?\n {8}<\/g>/.exec(html())[0];
  assert.match(card, /data-semantic-sigil="database"[^>]*transform="translate\(50 241\) scale\(1\.75\)" data-icon-slot=""/);
  assert.match(card, /<text data-node-label="" x="129"/);
});

test('notationToggle keeps both notations and starts with the type symbols', (t) => {
  const { result, html } = render(t, svg, { iconSlot: true, notationToggle: {} });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const page = html();
  const card = /<g id="node-a"[\s\S]*?\n {8}<\/g>/.exec(page)[0];
  assert.match(card, /<g data-notation-only="c4">[\s\S]*data-semantic-sigil="database"/);
  assert.match(card, /<g data-notation-only="vendor" style="display:none"><image data-node-icon-image=""/);
  const other = /<g id="node-b"[\s\S]*?\n {8}<\/g>/.exec(page)[0];
  assert.match(other, /<text data-notation-c4-x="379" data-notation-vendor-x="360"/, 'cards without an image centre their text in the vendor notation');
  assert.equal(page.match(/<script data-archify-fork="notation">/g)?.length, 1);
});
