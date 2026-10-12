// Fork extension test (dev_chanju): clickable boundaries with notes.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../archify/', import.meta.url));
const cli = path.join(root, 'bin/archify.mjs');

function render(t, boundary) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'archify-boundary-note-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const source = path.join(dir, 'diagram.json');
  const output = path.join(dir, 'diagram.html');
  fs.writeFileSync(source, JSON.stringify({
    schema_version: 1, diagram_type: 'architecture',
    meta: { title: 'Boundary note', quality_profile: 'standard', output: 'diagram.html' },
    components: [
      { id: 'a', type: 'backend', label: 'A', pos: [80, 225], size: [120, 60] },
      { id: 'b', type: 'database', label: 'B', pos: [340, 225], size: [120, 60] },
    ],
    boundaries: [{ kind: 'region', label: 'Private network', wraps: ['a', 'b'], ...boundary }],
    connections: [{ from: 'a', to: 'b', label: 'write' }],
  }));
  const result = spawnSync(process.execPath, [cli, 'render', 'architecture', source, output], { encoding: 'utf8' });
  return { result, html: () => fs.readFileSync(output, 'utf8') };
}

test('a boundary with id and note becomes clickable with its members', (t) => {
  const { result, html } = render(t, { id: 'vpc', note: 'Holds <app> & DB' });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const page = html();
  assert.match(page, /<rect data-graph-role="structural-frame"[^>]*data-boundary-id="vpc" data-boundary-note="Holds &lt;app&gt; &amp; DB" data-boundary-members="a b" data-boundary-interactive="true"/);
  assert.match(page, /<g data-graph-role="structural-frame-label"[^>]*data-boundary-id="vpc"[^>]*tabindex="0" role="button" aria-label="Private network"/);
  assert.equal(page.match(/<script data-archify-fork="boundary-note">/g)?.length, 1);
});

test('an id alone is enough to make the boundary clickable', (t) => {
  const { result, html } = render(t, { id: 'vpc' });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(html(), /data-boundary-id="vpc" data-boundary-members="a b"/);
});

test('boundaries without id or note keep their exact markup', (t) => {
  const { result, html } = render(t, {});
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.doesNotMatch(html(), /data-boundary-(id|note|members|interactive)|data-archify-fork/);
});

test('boundary id must follow the id pattern', (t) => {
  const { result } = render(t, { id: 'has space' });
  assert.notEqual(result.status, 0);
});
