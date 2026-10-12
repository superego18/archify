// Fork extension test (dev_chanju): variants with per-combination checks.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../archify/', import.meta.url));
const cli = path.join(root, 'bin/archify.mjs');

function diagram(changes = {}) {
  return {
    schema_version: 1, diagram_type: 'architecture',
    meta: { title: 'Variants', quality_profile: 'standard', output: 'diagram.html' },
    variants: [{ id: 'host', label: 'Host', options: [{ id: 'ecs', label: 'ECS' }, { id: 'apps', label: 'Apps' }] }],
    components: [
      { id: 'db', type: 'database', label: 'DB', pos: [40, 225], size: [120, 60] },
      // Alternatives may share one position: they never appear together.
      { id: 'ecs', type: 'backend', label: 'ECS', pos: [300, 225], size: [120, 60], when: { host: 'ecs' } },
      { id: 'apps', type: 'backend', label: 'Apps', pos: [300, 225], size: [120, 60], when: { host: 'apps' } },
    ],
    connections: [{ from: 'ecs', to: 'db', label: 'read' }, { from: 'apps', to: 'db', label: 'query' }],
    ...changes,
  };
}

function render(t, input) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'archify-variants-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const source = path.join(dir, 'diagram.json');
  const output = path.join(dir, 'diagram.html');
  fs.writeFileSync(source, JSON.stringify(input));
  const result = spawnSync(process.execPath, [cli, 'render', 'architecture', source, output], { encoding: 'utf8' });
  return { result, html: () => fs.readFileSync(output, 'utf8') };
}

test('the SVG shows the default combination and parks the alternatives', (t) => {
  const { result, html } = render(t, diagram());
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const page = html();
  const svg = page.slice(page.indexOf('<svg'), page.indexOf('</svg>'));
  assert.match(svg, /data-node-id="ecs"/);
  assert.doesNotMatch(svg, /data-node-id="apps"/, 'the non-default option stays out of the SVG');
  assert.match(svg, /<g data-fork-slot="\d+"><\/g>/);
  const data = JSON.parse(/<script type="application\/json" id="fork-variants-data">(.*?)<\/script>/.exec(page)[1]);
  assert.deepEqual(Object.keys(data.layouts).sort(), ['apps', 'ecs']);
  assert.ok(data.pool.some((markup) => markup.includes('data-node-id="apps"')));
  assert.equal(page.match(/<svg\b/g).length, 1, 'one primary diagram SVG');
});

test('a layout problem in any combination fails the render', (t) => {
  const input = diagram();
  // In the apps combination the Cache card overlaps the Apps card.
  input.components.push({ id: 'cache', type: 'database', label: 'Cache', pos: [300, 225], size: [120, 60], when: { host: 'apps' } });
  const { result } = render(t, input);
  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /Variant combination \(host=apps\)/);
});

test('unknown variants or options in when are rejected', (t) => {
  for (const when of [{ region: 'x' }, { host: 'k8s' }]) {
    const input = diagram();
    input.components[1].when = when;
    const { result } = render(t, input);
    assert.notEqual(result.status, 0);
    assert.match(result.stdout + result.stderr, /unknown (variant|option)/);
  }
});

test('diagrams without variants keep no variant markup', (t) => {
  const input = diagram({ variants: undefined });
  delete input.variants;
  input.components = input.components.filter((component) => component.id !== 'apps').map(({ when, ...component }) => component);
  input.connections = [input.connections[0]];
  const { result, html } = render(t, input);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.doesNotMatch(html(), /data-fork-slot|fork-variants-data|data-when/);
});
