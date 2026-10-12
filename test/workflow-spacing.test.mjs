import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { compactFinalizeReceipt } from '../archify/bin/finalize.mjs';

const root = fileURLToPath(new URL('../archify/', import.meta.url));
const cli = path.join(root, 'bin/archify.mjs');
const checker = path.join(root, 'scripts/check-render-output.mjs');

function workflow(offsets = [0, 140, 280]) {
  return {
    schema_version: 2, diagram_type: 'workflow',
    meta: { title: 'Stacked steps', quality_profile: 'standard', output: 'diagram.html' },
    lanes: [{ id: 'work', label: 'Work' }],
    nodes: offsets.map((yOffset, i) => ({
      id: `n${i}`, lane: 'work', col: 0, type: 'backend', label: `Step ${i + 1}`,
      width: 162, height: 64, yOffset,
    })),
    edges: [0, 1].map(i => ({ id: `e${i}`, from: `n${i}`, to: `n${i + 1}` })),
  };
}

function render(t, spec = workflow()) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'archify-workflow-spacing-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const input = path.join(dir, 'candidate.json');
  const output = path.join(dir, 'diagram.html');
  fs.writeFileSync(input, JSON.stringify(spec));
  const result = spawnSync(process.execPath, [cli, 'render', 'workflow', input, output], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  return { input, output, html: fs.readFileSync(output, 'utf8') };
}

function check(output) {
  const result = spawnSync(process.execPath, [checker, output], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  return JSON.parse(result.stdout);
}

function summary(report, type = 'workflow', ok = true) {
  return compactFinalizeReceipt({ ok, type, status: ok ? 'pass' : 'fail', diagnostics: [],
    stages: { check: { status: ok ? 'pass' : 'fail', receipt: report } } });
}

test('downward-only stacking reports asymmetric space without failing or rewriting', t => {
  const { output, html, input } = render(t);
  const original = fs.readFileSync(input, 'utf8');
  const report = check(output);
  const space = report.composition.workflowSpacing;
  assert.ok(space, 'check must disclose Workflow spacing evidence');
  assert.equal(space.measured, true);
  assert.equal(space.reviewSuggested, true);
  assert.equal(space.lanes.length, 1);
  const lane = space.lanes[0];
  assert.equal(lane.frameId, 'lane-0');
  assert.deepEqual(lane.nodeIds, ['n0', 'n1', 'n2']);
  assert.ok(lane.emptyTopPx > 250);
  assert.ok(lane.emptyBottomPx < 10);
  assert.equal(lane.reviewSuggested, true);
  assert.deepEqual(report.composition.summary, { errors: 0, warnings: 0 });
  assert.equal(summary(report).layoutReviewRecommendation.action, 'inspect-workflow-spacing');
  assert.deepEqual(summary(report).layoutReviewRecommendation.evidence, space);
  assert.match(summary(report).layoutReviewRecommendation.repair, /user-fixed|fixed geometry/);
  assert.equal(summary(report, 'architecture').layoutReviewRecommendation, undefined);
  assert.equal(summary(report, 'workflow', false).layoutReviewRecommendation, undefined);
  assert.equal(fs.readFileSync(output, 'utf8'), html);
  assert.equal(fs.readFileSync(input, 'utf8'), original);
});

test('centering alone clears the advice while preserving relative gaps and content', t => {
  const before = workflow();
  const after = structuredClone(before);
  after.nodes.forEach(node => { node.yOffset -= 140; });
  const a = render(t, before);
  const b = render(t, after);
  assert.equal(check(a.output).composition.workflowSpacing.reviewSuggested, true);
  assert.equal(check(b.output).composition.workflowSpacing.reviewSuggested, false);
  assert.equal(summary(check(b.output)).layoutReviewRecommendation, undefined);
  assert.deepEqual(after.edges, before.edges);
  assert.deepEqual(after.nodes.map(({ yOffset, ...node }) => node), before.nodes.map(({ yOffset, ...node }) => node));
  assert.ok(Number(b.html.match(/<svg viewBox="0 0 \d+ (\d+)"/)[1]) < Number(a.html.match(/<svg viewBox="0 0 \d+ (\d+)"/)[1]));
});

test('upward-only stacking also exposes excess bottom space', t => {
  const space = check(render(t, workflow([-280, -140, 0])).output).composition.workflowSpacing;
  assert.equal(space.reviewSuggested, true);
  assert.ok(space.lanes[0].emptyBottomPx > 250);
  assert.ok(space.lanes[0].emptyTopPx < 10);
});

test('automatic cross-lane ingress does not hide asymmetric stacking', t => {
  const spec = workflow();
  spec.lanes.unshift({ id: 'entry', label: 'Entry' });
  spec.nodes.unshift({ id: 'entry', lane: 'entry', col: 0, type: 'frontend', label: 'Entry' });
  spec.edges.unshift({ from: 'entry', to: 'n0' });
  const space = check(render(t, spec).output).composition.workflowSpacing;
  assert.equal(space.reviewSuggested, true);
  assert.equal(space.lanes.find(lane => lane.nodeIds.includes('n0')).reviewSuggested, true);
});

test('internal return routes and explanation text reserve apparent blank space', t => {
  const original = render(t);
  const base = check(original.output).composition.workflowSpacing.lanes[0];
  const y = base.contentTop + 40;
  const pathTag = original.html.match(/<path\b[^>]*data-edge-id="e0"[^>]*>/)[0];
  const d = pathTag.match(/\bd="([^"]+)"/)[1];
  const coords = d.match(/-?\d+(?:\.\d+)?/g).map(Number);
  const changed = pathTag.replace(`d="${d}"`, `d="M ${coords[0]} ${coords[1]} H ${coords[0] + 100} V ${y} H ${coords[0] + 150} V ${coords.at(-1)} H ${coords.at(-2)}"`);
  fs.writeFileSync(original.output, original.html.replace(pathTag, changed));
  assert.equal(check(original.output).composition.workflowSpacing.reviewSuggested, false);

  fs.writeFileSync(original.output, original.html.replace('<!-- Workflow groups -->', `<!-- Workflow groups -->\n<text x="60" y="${y}" font-size="10">Reserved explanation</text>`));
  assert.equal(check(original.output).composition.workflowSpacing.reviewSuggested, false);
});

test('authored relationship labels reserve their rendered lane space', t => {
  const spec = workflow();
  const base = check(render(t, spec).output).composition.workflowSpacing.lanes[0];
  spec.edges[0].label = 'Reserved review';
  spec.edges[0].labelAt = [140, base.contentTop + 40];
  const { output, input } = render(t, spec);
  const original = fs.readFileSync(input, 'utf8');
  assert.equal(check(output).composition.workflowSpacing.reviewSuggested, false);
  assert.deepEqual(JSON.parse(original).edges, spec.edges);
  assert.equal(fs.readFileSync(input, 'utf8'), original);
});

test('group titles and brand badges do not hide empty lane content', t => {
  const spec = workflow();
  spec.groups = [{ id: 'stages', lane: 'work', fromCol: 0, toCol: 0, label: 'Stages' }];
  spec.nodes[0].brand = 'github';
  const { output } = render(t, spec);
  assert.equal(check(output).composition.workflowSpacing.reviewSuggested, true);
  spec.nodes.forEach(node => { node.yOffset -= 140; });
  assert.equal(check(render(t, spec).output).composition.workflowSpacing.reviewSuggested, false);
});

test('authored canvases are measured as advice only and keep their geometry', t => {
  const spec = workflow();
  spec.meta.viewBox = [1100, 900];
  const { output, html } = render(t, spec);
  assert.equal(check(output).composition.workflowSpacing.reviewSuggested, true);
  assert.equal(fs.readFileSync(output, 'utf8'), html);
});

test('unknown contracts and transformed geometry do not invite a repair', t => {
  const { output, html } = render(t);
  for (const changed of [
    html.replace('data-layout-contract="readable-v2"', 'data-layout-contract="fixed-v1"'),
    html.replace('<svg viewBox=', '<svg transform="translate(0 10)" viewBox='),
    html.replace('<g id="node-n0"', '<g transform="translate(0 10)" id="node-n0"'),
    html.replace('data-edge-id="e0"', 'transform="translate(0 10)" data-edge-id="e0"'),
  ]) {
    assert.notEqual(changed, html);
    fs.writeFileSync(output, changed);
    const space = check(output).composition.workflowSpacing;
    assert.notEqual(space?.reviewSuggested, true);
    assert.equal(summary(check(output)).layoutReviewRecommendation, undefined);
  }
});

test('unsupported text offsets do not mistake shifted explanations for empty space', t => {
  const { output, html } = render(t);
  for (const attrs of ['x="60" y="420" dy="-300"', 'x="1060" y="120" dx="-1000"']) {
    fs.writeFileSync(output, html.replace('<!-- Workflow groups -->', `<!-- Workflow groups -->\n<text ${attrs} font-size="10">Reserved explanation</text>`));
    const space = check(output).composition.workflowSpacing;
    assert.equal(space.measured, false);
    assert.equal(space.reviewSuggested, false);
    assert.equal(summary(check(output)).layoutReviewRecommendation, undefined);
  }
});
