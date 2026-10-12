// Fork extension test (dev_chanju): node notes in the Semantic Passport.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../archify/', import.meta.url));
const cli = path.join(root, 'bin/archify.mjs');

function render(t, note) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'archify-node-note-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const source = path.join(dir, 'diagram.json');
  const output = path.join(dir, 'diagram.html');
  fs.writeFileSync(source, JSON.stringify({
    schema_version: 1, diagram_type: 'architecture',
    meta: { title: 'Node note', quality_profile: 'standard', output: 'diagram.html' },
    components: [
      { id: 'a', type: 'backend', label: 'A', pos: [40, 225], size: [120, 60], ...(note === undefined ? {} : { note }) },
      { id: 'b', type: 'database', label: 'B', pos: [300, 225], size: [120, 60] },
    ],
    connections: [{ from: 'a', to: 'b', label: 'write' }],
  }));
  const result = spawnSync(process.execPath, [cli, 'render', 'architecture', source, output], { encoding: 'utf8' });
  return { result, html: () => fs.readFileSync(output, 'utf8') };
}

test('a node note becomes a passport attribute with its viewer script', (t) => {
  const { result, html } = render(t, 'Stores <orders> & plans');
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const page = html();
  assert.match(page, /data-node-id="a"[^>]*data-node-note="Stores &lt;orders&gt; &amp; plans"/);
  assert.equal(page.match(/<script data-archify-fork="node-note">/g)?.length, 1);
  assert.match(page, /<\/svg>\n      <script data-archify-fork="node-note">/);
});

test('diagrams without notes carry no note attribute or script', (t) => {
  for (const note of [undefined, '   ']) {
    const { result, html } = render(t, note);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.doesNotMatch(html(), /data-node-note|data-archify-fork/);
  }
});

test('note must be a string', (t) => {
  const { result } = render(t, 42);
  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /note/);
});
