import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { findChrome, runBrowserCheck } from '../archify/bin/visual-check.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'archify');

// Inserts defects the static validators cannot see into the rendered diagram
// SVG, so the browser check has to measure painted geometry to find them.
function injectProbes(html) {
  const open = html.lastIndexOf('<svg', html.indexOf('data-quality-profile'));
  assert.ok(open >= 0, 'rendered diagram SVG not found');
  let depth = 0;
  let index = open;
  const pattern = /<svg\b|<\/svg>/g;
  pattern.lastIndex = open;
  let match;
  while ((match = pattern.exec(html))) {
    depth += match[0] === '</svg>' ? -1 : 1;
    if (depth === 0) { index = match.index; break; }
  }
  const viewBox = /viewBox="([^"]+)"/.exec(html.slice(open, html.indexOf('>', open)))[1].split(/\s+/).map(Number);
  const x = viewBox[0] + 12;
  const y = viewBox[1] + viewBox[3] - 120;
  const probes = `
<g data-node-id="probe-node"><rect x="${x}" y="${y}" width="60" height="30" rx="4" class="c-mask"/>
<text data-node-label="" x="${x + 30}" y="${y + 19}" font-size="11" text-anchor="middle">An overflowing probe label</text>
<image href="missing-probe-icon.png" x="${x + 4}" y="${y + 4}" width="12" height="12"/></g>
<path data-edge-from="probe-a" data-edge-to="probe-b" data-edge-id="probe-short" data-composition-points="${x},${y + 70};${x + 60},${y + 70};${x + 60},${y + 78}" d="M ${x} ${y + 70} L ${x + 60} ${y + 70} L ${x + 60} ${y + 78}" class="a-default" fill="none" marker-end="url(#arrowhead)"/>
<path data-edge-from="probe-c" data-edge-to="probe-d" data-edge-id="probe-short-source" data-composition-points="${x + 100},${y + 90};${x + 100},${y + 98};${x + 160},${y + 98}" d="M ${x + 100} ${y + 90} L ${x + 100} ${y + 98} L ${x + 160} ${y + 98}" class="a-default" fill="none" marker-start="url(#arrowhead)"/>
<g data-detail="context" data-edge-from="probe-a" data-edge-to="probe-b" data-edge-id="probe-label"><text x="${x + 30}" y="${y + 26}" font-size="8" text-anchor="middle">probe label</text></g>`;
  return html.slice(0, index) + probes + html.slice(index);
}

test('browser-check measures painted text, arrow, label and icon geometry', async (t) => {
  if (!Object.hasOwn(process.env, 'ARCHIFY_CHROME')) return t.skip('Set ARCHIFY_CHROME for real browser checks');
  const chrome = findChrome();
  assert.ok(chrome);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'archify-graphic-quality-'));
  const input = path.join(root, 'examples/web-app.architecture.json');
  const clean = path.join(dir, 'clean.html');
  execFileSync(process.execPath, [path.join(root, 'bin/archify.mjs'), 'render', 'architecture', input, clean]);

  const cleanResult = await runBrowserCheck({ artifactPath: clean, chromePath: chrome });
  assert.equal(cleanResult.receipt.graphics.profile, 'showcase');
  assert.notEqual(cleanResult.receipt.graphics.status, 'fail', 'the official example has no measured graphic defect');
  assert.equal(cleanResult.receipt.graphics.issues.some(({ defect }) => defect), false);

  const probed = path.join(dir, 'probed.html');
  fs.writeFileSync(probed, injectProbes(fs.readFileSync(clean, 'utf8')));
  const result = await runBrowserCheck({ artifactPath: probed, chromePath: chrome });
  const { graphics, diagnostics } = result.receipt;
  assert.equal(result.exitCode, 1);
  assert.equal(graphics.status, 'fail');
  assert.equal(result.receipt.containment.status, 'pass', 'the probes stay inside the canvas');

  const find = (code, predicate) => diagnostics.find((entry) => entry.code === code && predicate(entry));
  const text = find('viewer/node-text-overflow', ({ subject }) => subject.graphic?.id === 'probe-node');
  assert.ok(text, 'overflowing node text is measured from its glyph box');
  assert.equal(text.severity, 'error');
  assert.ok(text.evidence.marginX < 0);

  const arrow = find('viewer/arrow-visible-length', ({ subject }) => subject.graphic?.id === 'probe-short');
  assert.ok(arrow, 'an 8px final segment behind the arrowhead is reported');
  assert.equal(arrow.severity, 'error');
  assert.equal(arrow.evidence.lastSegment, 8);
  assert.ok(arrow.evidence.arrowhead > 8);

  const source = find('viewer/arrow-visible-length', ({ subject }) => subject.graphic?.id === 'probe-short-source');
  assert.ok(source, 'an 8px first segment behind a source arrowhead is reported');
  assert.equal(source.evidence.end, 'source');
  assert.match(source.message, /first segment/);

  const label = find('viewer/label-clearance', ({ evidence }) => evidence.obstacle?.id === 'probe-node');
  assert.ok(label, 'a relationship label painted over a node is reported');
  assert.equal(label.evidence.overlap, true);
  assert.equal(label.severity, 'error');

  const icon = find('viewer/icon-geometry', ({ evidence, subject }) => subject.graphic?.id === 'probe-node' && evidence.kind === 'load-failed');
  assert.ok(icon, 'an icon that cannot load is reported');
});
