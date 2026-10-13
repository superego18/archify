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

function render(t, iconImage) {
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
  }));
  const result = spawnSync(process.execPath, [cli, 'render', 'architecture', source, output], { encoding: 'utf8' });
  return { result, html: () => fs.readFileSync(output, 'utf8') };
}

test('iconImage draws the data URI in the card corner', (t) => {
  const { result, html } = render(t, svg);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(html(), /<image data-node-icon-image="" href="data:image\/svg\+xml;base64,[^"]+" x="47" y="229" width="20" height="20"/);
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
