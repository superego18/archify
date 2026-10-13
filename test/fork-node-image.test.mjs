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

test('sigil swaps in a fork glyph at the type sigil place, in and out of the slot', (t) => {
  const plain = render(t, undefined, { components: [
    { id: 'a', type: 'external', label: 'Users', pos: [40, 225], size: [140, 60], sigil: 'users' },
    { id: 'b', type: 'backend', label: 'B', pos: [300, 225], size: [120, 60] },
  ] });
  assert.equal(plain.result.status, 0, plain.result.stdout + plain.result.stderr);
  assert.match(plain.html(), /data-semantic-sigil="users" data-fork-sigil=""[^>]*transform="translate\(46 231\) scale\(0\.458/);
  const slotted = render(t, undefined, { iconSlot: true, components: [
    { id: 'a', type: 'external', label: 'Users', pos: [40, 225], size: [140, 60], sigil: 'users' },
    { id: 'b', type: 'backend', label: 'B', pos: [300, 225], size: [120, 60] },
  ] });
  assert.equal(slotted.result.status, 0, slotted.result.stdout + slotted.result.stderr);
  assert.match(slotted.html(), /data-semantic-sigil="users" data-fork-sigil="" data-icon-slot=""[^>]*transform="translate\(50 241\) scale\(1\.16/);
});

test('unknown fork sigils are rejected', (t) => {
  const { result } = render(t, undefined, { components: [
    { id: 'a', type: 'external', label: 'Users', pos: [40, 225], size: [140, 60], sigil: 'rocket' },
    { id: 'b', type: 'backend', label: 'B', pos: [300, 225], size: [120, 60] },
  ] });
  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /sigil/);
});
