// Fork extension test (dev_chanju): author-defined facets.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../archify/', import.meta.url));
const cli = path.join(root, 'bin/archify.mjs');

const provider = { id: 'provider', label: 'Provider', values: [{ id: 'aws', label: 'AWS' }, { id: 'ours', label: 'In-house', color: '#123456' }] };
const stage = { id: 'stage', label: 'Stage', values: [{ id: 'base', label: 'Base' }, { id: 'ext', label: 'Extension' }] };

function render(t, { facets, picked } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'archify-facets-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const source = path.join(dir, 'diagram.json');
  const output = path.join(dir, 'diagram.html');
  fs.writeFileSync(source, JSON.stringify({
    schema_version: 1, diagram_type: 'architecture',
    meta: { title: 'Facets', quality_profile: 'standard', output: 'diagram.html' },
    ...(facets ? { facets } : {}),
    components: [
      { id: 'a', type: 'backend', label: 'A', pos: [40, 225], size: [120, 60], ...(picked ? { facets: picked } : {}) },
      { id: 'b', type: 'database', label: 'B', pos: [300, 225], size: [120, 60] },
    ],
    connections: [{ from: 'a', to: 'b', label: 'write' }],
  }));
  const result = spawnSync(process.execPath, [cli, 'render', 'architecture', source, output], { encoding: 'utf8' });
  return { result, html: () => fs.readFileSync(output, 'utf8') };
}

test('the first facet colors a left stripe and legend; every facet reaches the passport', (t) => {
  const { result, html } = render(t, { facets: [provider, stage], picked: { provider: 'ours', stage: 'ext' } });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const page = html();
  assert.match(page, /<rect data-facet-stripe="provider"[^>]*fill="#123456"/);
  assert.doesNotMatch(page, /data-facet-stripe="stage"/, 'later facets default to passport only');
  assert.match(page, /data-legend-semantic-kind="facet:provider:ours"[\s\S]*?>In-house</);
  assert.doesNotMatch(page, /facet:provider:aws|facet:stage:/);
  assert.match(page, /data-node-facets="\[\{&quot;facet&quot;:&quot;Provider&quot;,&quot;value&quot;:&quot;In-house&quot;/);
  assert.match(page, /&quot;facet&quot;:&quot;Stage&quot;,&quot;value&quot;:&quot;Extension&quot;/);
  assert.equal(page.match(/<script data-archify-fork="facets">/g)?.length, 1);
});

test('a second stripe facet goes on the right and prefixes legend rows', (t) => {
  const { result, html } = render(t, { facets: [provider, { ...stage, marker: 'stripe-right' }], picked: { provider: 'aws', stage: 'base' } });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const page = html();
  assert.match(page, /data-facet-stripe="stage" x="154.5"/);
  assert.match(page, />Provider: AWS</);
  assert.match(page, />Stage: Base</);
});

test('unknown facets, values and shared stripe markers are rejected', (t) => {
  for (const [input, message] of [
    [{ facets: [provider], picked: { owner: 'x' } }, /unknown facet "owner"/],
    [{ facets: [provider], picked: { provider: 'gcp' } }, /unknown provider value "gcp"/],
    [{ facets: [provider, { ...stage, marker: 'stripe-left' }], picked: { provider: 'aws' } }, /one facet may use each stripe/],
    [{ facets: [provider, provider], picked: { provider: 'aws' } }, /unique ids/],
  ]) {
    const { result } = render(t, input);
    assert.notEqual(result.status, 0);
    assert.match(result.stdout + result.stderr, message);
  }
});

test('diagrams without facets carry no facet markup', (t) => {
  const { result, html } = render(t);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.doesNotMatch(html(), /data-node-facets|data-facet-stripe|facet:|data-archify-fork/);
});
