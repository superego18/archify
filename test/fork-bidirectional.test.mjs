// Fork extension test (dev_chanju): bidirectional architecture connections.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../archify/', import.meta.url));
const cli = path.join(root, 'bin/archify.mjs');

function render(t, connection) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'archify-bidirectional-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const source = path.join(dir, 'diagram.json');
  const output = path.join(dir, 'diagram.html');
  fs.writeFileSync(source, JSON.stringify({
    schema_version: 1, diagram_type: 'architecture',
    meta: { title: 'Bidirectional', quality_profile: 'standard', output: 'diagram.html' },
    components: [
      { id: 'a', type: 'backend', label: 'A', pos: [40, 225], size: [120, 60] },
      { id: 'b', type: 'database', label: 'B', pos: [300, 225], size: [120, 60] },
    ],
    connections: [{ from: 'a', to: 'b', label: 'sync', ...connection }],
  }));
  const result = spawnSync(process.execPath, [cli, 'render', 'architecture', source, output], { encoding: 'utf8' });
  return { result, html: () => fs.readFileSync(output, 'utf8') };
}

test('a bidirectional connection draws a reversed arrowhead at its source', (t) => {
  const { result, html } = render(t, { bidirectional: true, variant: 'emphasis' });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const page = html();
  assert.match(page, /<marker id="arrowhead-emphasis-start"[^>]*orient="auto-start-reverse"/);
  assert.match(page, /marker-end="url\(#arrowhead-emphasis\)" marker-start="url\(#arrowhead-emphasis-start\)" data-edge-bidirectional="true"/);
});

test('diagrams without bidirectional connections emit no start markers', (t) => {
  const { result, html } = render(t, { bidirectional: false });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.doesNotMatch(html(), /arrowhead-start|marker-start=|data-edge-bidirectional/);
});

test('bidirectional must be a boolean', (t) => {
  const { result } = render(t, { bidirectional: 'yes' });
  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /bidirectional/);
});
