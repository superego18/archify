// Fork extension (superego18/archify dev_chanju): variants (alternatives).
// One authored layout holds every option; elements carry `when` conditions, and
// options that never appear together may share a position. Every combination is
// rendered on its own in layout-report mode, so each passes the same layout
// checks as an ordinary diagram, and its routes, label positions and boundary
// boxes are what the viewer applies when that combination is chosen. The union
// itself is never shown as-is, so it skips the layout checks. Diagrams without
// variants keep their exact bytes.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { esc } from '../shared/utils.mjs';
import { asArray, roundedPath } from '../shared/geometry.mjs';
import { throwDiagnosticProblems } from '../shared/diagnostics.mjs';

export const MAX_VARIANT_COMBINATIONS = 256;
const REPORTED_FAILURES = 10;
const renderer = fileURLToPath(new URL('../architecture/render-architecture.mjs', import.meta.url));

let checkedLayouts = null;
const CHILD_ENV = 'ARCHIFY_FORK_VARIANT_CHILD';

// Combination renders also report where the renderer placed each boundary
// title, which can move between combinations. Ordinary reports are unchanged.
export function variantBoundaryReport(boundary, box) {
  if (process.env[CHILD_ENV] !== '1' || !boundary.title) return box;
  return { ...box, titleAt: [boundary.title.x, boundary.title.y] };
}

function variantsOf(arch) {
  return asArray(arch.variants);
}

export function hasVariants(arch) {
  return variantsOf(arch).length > 0;
}

function defaultChoice(variant) {
  return variant.default ?? variant.options[0].id;
}

export function visibleIn(when, combination) {
  if (!when) return true;
  return Object.entries(when).every(([variantId, allowed]) => (
    Array.isArray(allowed) ? allowed.includes(combination[variantId]) : allowed === combination[variantId]
  ));
}

// A variant whose own `when` does not hold stays at its default, so that
// combination is enumerated once instead of once per meaningless option.
export function combinations(arch) {
  return variantsOf(arch).reduce((all, variant) => all.flatMap((partial) => (
    visibleIn(variant.when, partial)
      ? variant.options.map((option) => ({ ...partial, [variant.id]: option.id }))
      : [{ ...partial, [variant.id]: defaultChoice(variant) }]
  )), [{}]);
}

export function combinationKey(arch, combination) {
  return variantsOf(arch).map((variant) => combination[variant.id]).join('|');
}

function referenceProblems(arch) {
  const problems = [];
  const options = new Map();
  const check = (owner, when) => {
    for (const [variantId, allowed] of Object.entries(when || {})) {
      const ids = options.get(variantId);
      if (!ids) { problems.push(`${owner} uses unknown variant "${variantId}" in when.`); continue; }
      for (const option of [allowed].flat()) {
        if (!ids.has(option)) problems.push(`${owner} uses unknown option "${option}" of variant "${variantId}" in when.`);
      }
    }
  };  for (const variant of variantsOf(arch)) {
    if (options.has(variant.id)) problems.push(`Variant ids must be unique: "${variant.id}".`);
    const ids = new Set(variant.options.map((option) => option.id));
    if (ids.size !== variant.options.length) problems.push(`Variant "${variant.id}" option ids must be unique.`);
    if (variant.default !== undefined && !ids.has(variant.default)) problems.push(`Variant "${variant.id}" default "${variant.default}" is not one of its options.`);
    for (const [variantId] of Object.entries(variant.when || {})) {
      if (!options.has(variantId)) problems.push(`Variant "${variant.id}" when must name an earlier variant, not "${variantId}".`);
    }
    if (variant.when) check(`Variant "${variant.id}"`, variant.when);
    options.set(variant.id, ids);
  }

  for (const component of asArray(arch.components)) check(`Component "${component.id}"`, component.when);
  for (const [index, connection] of asArray(arch.connections).entries()) check(`Connection "${connection.id || `${connection.from}->${connection.to}#${index}`}"`, connection.when);
  for (const boundary of asArray(arch.boundaries)) check(`Boundary "${boundary.label}"`, boundary.when);
  const count = combinations(arch).length;
  if (count > MAX_VARIANT_COMBINATIONS) problems.push(`Variants produce ${count} combinations; the limit is ${MAX_VARIANT_COMBINATIONS}.`);
  return problems;
}

// The plain diagram one combination shows: hidden components drop out, and
// with them their connections; boundaries keep only visible members.
export function filterForCombination(raw, combination) {
  const { variants, ...rest } = raw;
  const strip = ({ when, ...element }) => element;
  const components = asArray(raw.components).filter((component) => visibleIn(component.when, combination)).map(strip);
  const visible = new Set(components.map((component) => component.id));
  const boundaryIndex = [];
  const boundaries = [];
  asArray(raw.boundaries).forEach((boundary, index) => {
    if (!visibleIn(boundary.when, combination)) return;
    const wraps = asArray(boundary.wraps).filter((id) => visible.has(id));
    if (!wraps.length) return;
    boundaryIndex.push(index);
    boundaries.push({ ...strip(boundary), wraps });
  });
  const connectionIndex = [];
  const connections = [];
  asArray(raw.connections).forEach((connection, index) => {
    if (!visibleIn(connection.when, combination) || !visible.has(connection.from) || !visible.has(connection.to)) return;
    connectionIndex.push(index);
    connections.push(strip(connection));
  });
  const meta = { ...raw.meta };
  delete meta.output;
  const diagram = { ...rest, meta, components, connections };
  if (raw.boundaries) diagram.boundaries = boundaries;
  else delete diagram.boundaries;
  return { diagram, boundaryIndex, connectionIndex };
}

function runLayoutReport(input, output) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [renderer, input, output, '--layout-json'], {
      env: { ...process.env, ARCHIFY_DIAGNOSTIC_FORMAT: 'json', [CHILD_ENV]: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('close', (code) => {
      let report = null;
      for (const text of [stdout, stderr]) {
        try { report = JSON.parse(text); break; } catch { /* try the other stream */ }
      }
      resolve({ code, report, stderr });
    });
  });
}

async function pooled(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  const lanes = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(lanes);
  return results;
}

function describe(arch, combination) {
  return variantsOf(arch).map((variant) => `${variant.id}=${combination[variant.id]}`).join(', ');
}

// Renders each combination in layout-report mode and fails the diagram when any
// combination fails. Successful reports keep each combination's boundary boxes
// for the viewer.
export async function checkVariantCombinations(arch, inputArgument) {
  checkedLayouts = null;
  if (!variantsOf(arch).length) return;
  const problems = referenceProblems(arch);
  if (problems.length) throwDiagnosticProblems('Variant validation failed', problems, { code: 'fork/variant-reference' });
  const raw = JSON.parse(fs.readFileSync(path.resolve(inputArgument), 'utf8'));
  const all = combinations(arch);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'archify-variants-'));
  try {
    const results = await pooled(all, Math.max(1, os.availableParallelism?.() ?? os.cpus().length), async (combination, index) => {
      const { diagram, boundaryIndex, connectionIndex } = filterForCombination(raw, combination);
      const input = path.join(directory, `combination-${index}.json`);
      diagram.meta.output = `combination-${index}.html`;
      fs.writeFileSync(input, JSON.stringify(diagram));
      const result = await runLayoutReport(input, path.join(directory, `combination-${index}.html`));
      return { combination, boundaryIndex, connectionIndex, ...result };
    });
    const failures = results.filter((result) => result.code !== 0 || !result.report?.ok);
    if (failures.length) {
      const messages = failures.slice(0, REPORTED_FAILURES).flatMap((failure) => {
        const where = `Variant combination (${describe(arch, failure.combination)})`;
        const diagnostics = asArray(failure.report?.diagnostics).filter((entry) => entry.severity !== 'warning');
        return diagnostics.length
          ? diagnostics.map((entry) => `${where}: ${entry.message}`)
          : [`${where}: ${failure.report?.error || failure.stderr.trim() || 'render failed'}`];
      });
      if (failures.length > REPORTED_FAILURES) messages.push(`${failures.length - REPORTED_FAILURES} more variant combinations also fail.`);
      throwDiagnosticProblems(`Variant combinations failed (${failures.length} of ${all.length})`, messages, { code: 'fork/variant-combination' });
    }
    // Route geometry repeats across combinations; keep each distinct shape once.
    const shapes = [];
    const shapeIds = new Map();
    const shapeId = (value) => {
      const key = JSON.stringify(value);
      if (!shapeIds.has(key)) { shapeIds.set(key, shapes.length); shapes.push(value); }
      return shapeIds.get(key);
    };
    const layouts = Object.fromEntries(results.map((result) => [
      combinationKey(arch, result.combination),
      {
        b: Object.fromEntries(asArray(result.report.boundaries).map((box, filtered) => [
          result.boundaryIndex[filtered],
          [box.x, box.y, box.width, box.height, ...(box.titleAt || [])],
        ])),
        c: Object.fromEntries(asArray(result.report.connections).map((connection, filtered) => [
          result.connectionIndex[filtered],
          shapeId([roundedPath(connection.points, 8), connection.points.map(([x, y]) => `${x},${y}`).join(';'), connection.labelAt || null]),
        ])),
      },
    ]));
    checkedLayouts = { layouts, shapes };
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

export function whenAttr(element) {
  return element?.when ? ` data-when="${esc(JSON.stringify(element.when))}"` : '';
}

function defaultCombination(arch) {
  return Object.fromEntries(variantsOf(arch).map((variant) => [variant.id, defaultChoice(variant)]));
}

// The renderer emits each top-level SVG element as a block that starts at an
// eight-space indent and, when it is an open <g>, ends at the matching
// eight-space </g>. Blocks are the unit the default view keeps or parks.
function svgBlocks(lines, start, end) {
  const blocks = [];
  for (let index = start; index < end; index += 1) {
    const line = lines[index];
    if (/^ {8}<g[\s>]/.test(line) && !/\/>\s*$/.test(line)) {
      let close = index + 1;
      while (close < end && !/^ {8}<\/g>/.test(lines[close])) close += 1;
      blocks.push({ from: index, to: close });
      index = close;
    } else if (/^ {8}<(path|rect)\b/.test(line)) {
      blocks.push({ from: index, to: index });
    }
  }
  return blocks;
}

function attr(text, name) {
  const match = new RegExp(`\\s${name}="([^"]*)"`).exec(text);
  return match ? match[1] : null;
}

function setAttr(line, name, value) {
  return line.replace(new RegExp(`(\\s${name}=")[^"]*(")`), `$1${value}$2`);
}

function placeLabel(lines, block, labelAt) {
  for (let index = block.from; index <= block.to; index += 1) {
    if (/<rect\b/.test(lines[index])) {
      const width = Number(attr(lines[index], 'width'));
      lines[index] = setAttr(setAttr(lines[index], 'x', labelAt[0] - width / 2), 'y', labelAt[1] - 10);
    } else if (/<text\b/.test(lines[index])) {
      lines[index] = setAttr(setAttr(lines[index], 'x', labelAt[0]), 'y', labelAt[1]);
    }
  }
}

function shiftLines(lines, block, dx, dy) {
  for (let index = block.from; index <= block.to; index += 1) {
    if (/<(rect|text)\b/.test(lines[index]) && attr(lines[index], 'x') !== null) {
      lines[index] = setAttr(setAttr(lines[index], 'x', Number(attr(lines[index], 'x')) + dx), 'y', Number(attr(lines[index], 'y')) + dy);
    }
  }
}

// Turns the union SVG into the default combination: visible elements take the
// geometry that combination was validated with, and the other elements are
// parked as markup the viewer restores when a combination needs them. Static
// artifact checks and browser checks therefore see one valid diagram.
export function withVariants(svg, arch) {
  if (!hasVariants(arch) || !checkedLayouts) return svg;
  const choice = defaultCombination(arch);
  const layout = checkedLayouts.layouts[combinationKey(arch, choice)];
  const components = new Map(asArray(arch.components).map((component) => [component.id, component]));
  const lines = svg.split('\n');
  const close = lines.findIndex((line) => /^ {6}<\/svg>/.test(line));
  const pool = [];
  const parked = new Set();
  for (const block of svgBlocks(lines, 0, close)) {
    const first = lines[block.from];
    const text = lines.slice(block.from, block.to + 1).join('\n');
    let visible = true;
    const nodeId = /^ {8}<g [^>]*data-node-id="/.test(first) ? attr(first, 'data-node-id') : null;
    const edgeKey = attr(text, 'data-edge-key');
    const frameId = attr(first, 'data-composition-frame-id');
    if (nodeId !== null) {
      visible = visibleIn(components.get(nodeId)?.when, choice);
    } else if (edgeKey !== null && /data-edge-from/.test(text)) {
      const shape = layout.c[edgeKey];
      visible = shape !== undefined;
      if (visible) {
        const [d, points, labelAt] = checkedLayouts.shapes[shape];
        if (/data-detail="context"/.test(first)) {
          if (labelAt) placeLabel(lines, block, labelAt);
        } else {
          for (let index = block.from; index <= block.to; index += 1) {
            if (/<path\b/.test(lines[index])) lines[index] = setAttr(lines[index], 'd', d);
            if (/data-composition-points="/.test(lines[index])) lines[index] = setAttr(lines[index], 'data-composition-points', points);
          }
        }
      }
    } else if (frameId !== null) {
      const box = layout.b[frameId];
      visible = box !== undefined;
      if (visible && /data-graph-role="structural-frame"/.test(first)) {
        lines[block.from] = ['x', 'y', 'width', 'height'].reduce((line, name, index) => setAttr(line, name, box[index]), first);
      } else if (visible && /data-graph-role="structural-frame-label"/.test(first)) {
        const mask = lines.slice(block.from, block.to + 1).find((line) => /structural-frame-label-mask/.test(line));
        if (mask && box.length >= 6) shiftLines(lines, block, box[4] - Number(attr(mask, 'x')), box[5] - Number(attr(mask, 'y')));
      }
    }
    if (!visible) {
      for (let index = block.from; index <= block.to; index += 1) parked.add(index);
      lines[block.from] = `\u0000${pool.length}\u0000${text}`;
      pool.push(text.replace(/^ {8}/gm, ''));
    }
  }
  const output = [];
  lines.forEach((line, index) => {
    if (line.startsWith('\u0000')) {
      const slot = line.split('\u0000')[1];
      output.push(`        <g data-fork-slot="${slot}"></g>`);
    } else if (!parked.has(index)) {
      output.push(line);
    }
  });
  const data = {
    title: String(arch.meta?.locale || '').startsWith('ko') ? '구성 선택' : 'Variants',
    variants: variantsOf(arch).map((variant) => ({
      id: variant.id,
      label: variant.label,
      default: defaultChoice(variant),
      ...(variant.when ? { when: variant.when } : {}),
      options: variant.options.map(({ id, label, pros, cons }) => ({ id, label, ...(pros ? { pros } : {}), ...(cons ? { cons } : {}) })),
    })),
    layouts: checkedLayouts.layouts,
    shapes: checkedLayouts.shapes,
    pool,
  };
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  return `${output.join('\n')}\n      <script type="application/json" id="fork-variants-data">${json}</script>\n      <script data-archify-fork="variants">\n${VARIANT_SCRIPT}\n      </script>`;
}

const VARIANT_SCRIPT = `(function () {
  var data = JSON.parse(document.getElementById('fork-variants-data').textContent);
  var svg = document.querySelector('svg[data-quality-profile]');
  if (!svg) return;
  var NS = 'http://www.w3.org/2000/svg';
  var choice = {};
  data.variants.forEach(function (variant) { choice[variant.id] = variant.default; });
  // Restore parked elements before the viewer scripts index the diagram.
  svg.querySelectorAll('g[data-fork-slot]').forEach(function (slot) {
    var markup = data.pool[+slot.getAttribute('data-fork-slot')];
    var parsed = new DOMParser().parseFromString('<' + 'svg xmlns="' + NS + '">' + markup + '</' + 'svg>', 'image/svg+xml');
    Array.prototype.slice.call(parsed.documentElement.childNodes).forEach(function (child) {
      slot.appendChild(document.importNode(child, true));
    });
  });
  var frames = Array.prototype.slice.call(svg.querySelectorAll('rect[data-graph-role="structural-frame"]')).map(function (frame) {
    var id = frame.getAttribute('data-composition-frame-id');
    var label = svg.querySelector('g[data-graph-role="structural-frame-label"][data-composition-frame-id="' + id + '"]');
    var parts = label ? Array.prototype.slice.call(label.querySelectorAll('rect, text')).map(function (part) {
      return { element: part, x: +part.getAttribute('x'), y: +part.getAttribute('y') };
    }) : [];
    var mask = label && label.querySelector('[data-graph-role="structural-frame-label-mask"]');
    var x = mask ? +mask.getAttribute('x') : +frame.getAttribute('x');
    var y = mask ? +mask.getAttribute('y') : +frame.getAttribute('y');
    return { id: id, frame: frame, label: label, x: x, y: y, parts: parts };
  });
  function matches(element) {
    var when = element.getAttribute('data-when');
    if (!when) return true;
    var rule = JSON.parse(when);
    return Object.keys(rule).every(function (id) {
      var allowed = rule[id];
      return Array.isArray(allowed) ? allowed.indexOf(choice[id]) !== -1 : allowed === choice[id];
    });
  }
  // Hidden elements also lose their semantic hooks, so viewer features that
  // query the live diagram (focus highlights, relationship lists, search)
  // never pick them up; the hooks come back when the element is shown.
  var HOOKS = ['data-node-id', 'data-edge-from', 'data-edge-to'];
  function show(element, visible) {
    var target = element.parentNode && element.parentNode.getAttribute && element.parentNode.getAttribute('data-graph-role') === 'automatic-crossover' ? element.parentNode : element;
    target.style.display = visible ? '' : 'none';
    if (visible) element.removeAttribute('data-variant-hidden');
    else element.setAttribute('data-variant-hidden', 'true');
    HOOKS.forEach(function (name) {
      var stash = 'data-variant-' + name.slice(5);
      if (visible && element.hasAttribute(stash)) { element.setAttribute(name, element.getAttribute(stash)); element.removeAttribute(stash); }
      if (!visible && element.hasAttribute(name)) { element.setAttribute(stash, element.getAttribute(name)); element.removeAttribute(name); }
    });
  }
  function nodeId(node) { return node.getAttribute('data-node-id') || node.getAttribute('data-variant-node-id'); }
  // The legend badges and the node list are built once by the viewer from
  // every node; keep their counts and entries to the chosen combination.
  function syncIndexes() {
    var visible = Array.prototype.slice.call(svg.querySelectorAll('g[data-node-id]')).filter(function (node) {
      return !node.hasAttribute('data-variant-hidden');
    });
    document.querySelectorAll('[data-legend-kind]').forEach(function (entry) {
      var kind = entry.getAttribute('data-legend-kind');
      var count = visible.filter(function (node) { return node.getAttribute('data-node-kind') === kind; }).length;
      entry.setAttribute('data-legend-count', String(count));
      var text = entry.querySelector('[data-legend-count-badge] text');
      if (text) text.textContent = String(count);
      if (count) entry.removeAttribute('data-legend-zero');
      else entry.setAttribute('data-legend-zero', '');
    });
    var ids = {};
    visible.forEach(function (node) { ids[node.getAttribute('data-node-id')] = true; });
    document.querySelectorAll('[data-outline-node]').forEach(function (button) {
      var item = button.closest('li') || button;
      item.style.display = ids[button.getAttribute('data-outline-node')] ? '' : 'none';
    });
    document.querySelectorAll('.node-outline-group').forEach(function (group) {
      var shown = Array.prototype.slice.call(group.querySelectorAll('[data-outline-node]')).filter(function (button) {
        return ids[button.getAttribute('data-outline-node')];
      }).length;
      group.style.display = shown ? '' : 'none';
      var small = group.querySelector('.node-outline-heading small');
      if (small) small.textContent = String(shown);
    });
    var count = document.getElementById('node-outline-count');
    if (count && document.querySelector('[data-outline-node]')) count.textContent = String(visible.length);
  }
  function holds(when) {
    if (!when) return true;
    return Object.keys(when).every(function (id) {
      var allowed = when[id];
      return Array.isArray(allowed) ? allowed.indexOf(choice[id]) !== -1 : allowed === choice[id];
    });
  }
  function apply() {
    // A variant that does not apply to the current choice falls back to its
    // default, which is the combination that was checked for it.
    data.variants.forEach(function (variant) {
      var active = holds(variant.when);
      if (!active) choice[variant.id] = variant.default;
      document.querySelectorAll('#fork-variant-panel [data-variant-row="' + variant.id + '"]').forEach(function (row) {
        row.style.opacity = active ? '' : '0.45';
        row.querySelectorAll('button').forEach(function (button) { button.disabled = !active; button.style.cursor = active ? 'pointer' : 'not-allowed'; });
      });
    });
    // Close a passport whose node is about to disappear while it is still findable.
    var chip = document.getElementById('focus-chip');
    var focused = document.getElementById('focus-id');
    var clear = document.getElementById('btn-focus-clear');
    var focusedNode = chip && !chip.hidden && focused ? svg.querySelector('g[data-node-id="' + CSS.escape(focused.textContent) + '"]') : null;
    if (focusedNode && !matches(focusedNode) && clear) clear.click();
    var hiddenNodes = {};
    svg.querySelectorAll('g[data-node-id], g[data-variant-node-id]').forEach(function (node) {
      var visible = matches(node);
      if (!visible) hiddenNodes[nodeId(node)] = true;
      show(node, visible);
    });
    var key = data.variants.map(function (variant) { return choice[variant.id]; }).join('|');
    var layout = data.layouts[key] || { b: {}, c: {} };
    svg.querySelectorAll('[data-edge-key]').forEach(function (edge) {
      if (!edge.hasAttribute('data-edge-from') && !edge.hasAttribute('data-variant-edge-from')) return;
      var shape = layout.c[edge.getAttribute('data-edge-key')];
      show(edge, shape !== undefined);
      if (shape === undefined) return;
      var geometry = data.shapes[shape];
      if (edge.tagName.toLowerCase() === 'path') {
        edge.setAttribute('d', geometry[0]);
        edge.setAttribute('data-composition-points', geometry[1]);
        var underlay = edge.parentNode && edge.parentNode.querySelector('[data-graph-role="automatic-crossover-underlay"]');
        if (underlay) underlay.setAttribute('d', geometry[0]);
      } else if (geometry[2]) {
        var rect = edge.querySelector('rect');
        var text = edge.querySelector('text');
        if (rect) { rect.setAttribute('x', geometry[2][0] - (+rect.getAttribute('width')) / 2); rect.setAttribute('y', geometry[2][1] - 10); }
        if (text) { text.setAttribute('x', geometry[2][0]); text.setAttribute('y', geometry[2][1]); }
      }
    });
    frames.forEach(function (entry) {
      var box = layout.b[entry.id];
      show(entry.frame, !!box);
      if (entry.label) show(entry.label, !!box);
      if (!box) return;
      ['x', 'y', 'width', 'height'].forEach(function (name, index) { entry.frame.setAttribute(name, box[index]); });
      if (box.length < 6) return;
      entry.parts.forEach(function (part) {
        part.element.setAttribute('x', part.x + box[4] - entry.x);
        part.element.setAttribute('y', part.y + box[5] - entry.y);
      });
    });
    syncIndexes();
    document.querySelectorAll('#fork-variant-panel button[data-variant]').forEach(function (button) {
      button.setAttribute('aria-pressed', String(choice[button.getAttribute('data-variant')] === button.getAttribute('data-option')));
    });
  }
  apply();
  // Browser checks walk every combination through this hook.
  window.__archifyVariants = {
    keys: Object.keys(data.layouts),
    defaultKey: data.variants.map(function (variant) { return variant.default; }).join('|'),
    set: function (key) {
      var parts = String(key).split('|');
      data.variants.forEach(function (variant, index) { choice[variant.id] = parts[index]; });
      apply();
    },
  };
  function panel() {
    var chip = document.getElementById('focus-chip');
    if (!chip || document.getElementById('fork-variant-panel')) return;
    var box = document.createElement('div');
    box.id = 'fork-variant-panel';
    box.className = 'no-print';
    box.setAttribute('role', 'group');
    box.setAttribute('aria-label', data.title);
    box.style.cssText = 'position:absolute;right:1rem;top:1rem;z-index:11;max-width:18rem;max-height:calc(100% - 6rem);overflow:auto;'
      + 'border:1px solid var(--frontend-stroke);border-radius:0.85rem;background:var(--toolbar-menu-bg);color:var(--toolbar-text);'
      + 'box-shadow:0 18px 48px rgba(0,0,0,0.3);backdrop-filter:blur(16px);font-size:0.72rem;padding:0.6rem 0.7rem;';
    // The panel floats over the canvas, so its heading folds it away.
    var heading = document.createElement('button');
    heading.type = 'button';
    heading.setAttribute('aria-expanded', 'true');
    heading.style.cssText = 'display:flex;justify-content:space-between;width:100%;border:0;background:none;color:inherit;cursor:pointer;padding:0;font:inherit;font-size:0.8rem;font-weight:600;';
    var title = document.createElement('span');
    title.textContent = data.title;
    var mark = document.createElement('span');
    mark.textContent = '\u25be';
    heading.appendChild(title);
    heading.appendChild(mark);
    box.appendChild(heading);
    var body = document.createElement('div');
    heading.addEventListener('click', function () {
      var open = heading.getAttribute('aria-expanded') !== 'true';
      heading.setAttribute('aria-expanded', String(open));
      body.hidden = !open;
      mark.textContent = open ? '\u25be' : '\u25b8';
    });
    // A conditional variant sits under the variant its condition names, indented
    // with the condition spelled out, so the panel reads as a hierarchy.
    var byId = {};
    data.variants.forEach(function (variant) { byId[variant.id] = variant; });
    function parentOf(variant) {
      var keys = variant.when ? Object.keys(variant.when) : [];
      return keys.length ? keys[keys.length - 1] : null;
    }
    var ordered = [];
    function visit(variant, depth) {
      ordered.push({ variant: variant, depth: depth });
      data.variants.forEach(function (child) { if (parentOf(child) === variant.id) visit(child, depth + 1); });
    }
    data.variants.forEach(function (variant) { if (!parentOf(variant) || !byId[parentOf(variant)]) visit(variant, 0); });
    var korean = data.title === '\uad6c\uc131 \uc120\ud0dd';
    ordered.forEach(function (entry) {
      var variant = entry.variant;
      var row = document.createElement('div');
      row.setAttribute('data-variant-row', variant.id);
      row.setAttribute('data-variant-depth', String(entry.depth));
      row.style.cssText = 'margin-top:0.45rem;' + (entry.depth
        ? 'margin-left:' + (entry.depth * 0.7) + 'rem;padding-left:0.55rem;border-left:2px solid var(--frontend-stroke);' : '');
      var name = document.createElement('div');
      name.textContent = variant.label;
      name.style.cssText = 'opacity:0.75;margin-bottom:0.2rem;';
      if (entry.depth) {
        var parent = byId[parentOf(variant)];
        var allowed = [].concat(variant.when[parent.id]).map(function (id) {
          var option = parent.options.filter(function (candidate) { return candidate.id === id; })[0];
          return option ? option.label : id;
        }).join(' / ');
        var condition = document.createElement('small');
        condition.textContent = korean ? ' \u21b3 ' + allowed + '\uc77c \ub54c' : ' \u21b3 when ' + allowed;
        condition.style.cssText = 'display:block;opacity:0.8;font-size:0.65rem;';
        name.appendChild(condition);
      }
      row.appendChild(name);
      var options = document.createElement('div');
      options.style.cssText = 'display:grid;grid-template-columns:repeat(' + variant.options.length + ',1fr);gap:0.25rem;';
      variant.options.forEach(function (option) {
        var button = document.createElement('button');
        button.type = 'button';
        button.textContent = option.label;
        button.setAttribute('data-variant', variant.id);
        button.setAttribute('data-option', option.id);
        button.style.cssText = 'border:1px solid var(--frontend-stroke);border-radius:0.45rem;background:none;color:inherit;cursor:pointer;padding:0.25rem 0.35rem;font:inherit;';
        button.addEventListener('click', function () { choice[variant.id] = option.id; apply(); });
        if (option.pros || option.cons) {
          button.setAttribute('aria-describedby', 'fork-variant-tip');
          ['pointerenter', 'focus'].forEach(function (type) { button.addEventListener(type, function () { tip(button, option); }); });
          ['pointerleave', 'blur'].forEach(function (type) { button.addEventListener(type, function () { tipBox.hidden = true; }); });
        }
        options.appendChild(button);
      });
      row.appendChild(options);
      body.appendChild(row);
    });
    box.appendChild(body);
    // Trade-offs appear beside the option on hover or keyboard focus.
    var tipBox = document.createElement('div');
    tipBox.id = 'fork-variant-tip';
    tipBox.setAttribute('role', 'tooltip');
    tipBox.hidden = true;
    tipBox.style.cssText = 'position:fixed;z-index:30;max-width:16rem;padding:0.45rem 0.55rem;border:1px solid var(--frontend-stroke);border-radius:0.5rem;'
      + 'background:var(--toolbar-menu-bg);color:var(--toolbar-text);box-shadow:0 10px 28px rgba(0,0,0,0.25);font-size:0.7rem;line-height:1.45;pointer-events:none;';
    document.body.appendChild(tipBox);
    function tip(button, option) {
      tipBox.textContent = '';
      [['+', option.pros, 'var(--backend-stroke)'], ['\u2212', option.cons, 'var(--security-stroke)']].forEach(function (line) {
        if (!line[1]) return;
        var row = document.createElement('div');
        var sign = document.createElement('b');
        sign.textContent = line[0] + ' ';
        sign.style.color = line[2];
        row.appendChild(sign);
        row.appendChild(document.createTextNode(line[1]));
        tipBox.appendChild(row);
      });
      tipBox.hidden = false;
      var rect = button.getBoundingClientRect();
      var width = tipBox.offsetWidth;
      tipBox.style.left = Math.max(8, rect.left - width - 8) + 'px';
      tipBox.style.top = Math.max(8, rect.top) + 'px';
    }
    var style = document.createElement('style');
    style.textContent = '[data-variant-hidden]{display:none !important}#fork-variant-panel button[aria-pressed="true"]{background:var(--frontend-stroke) !important;color:var(--toolbar-menu-bg) !important;font-weight:600;}';
    box.appendChild(style);
    chip.parentNode.insertBefore(box, chip.nextSibling);
    apply();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', panel);
  else panel();
})();`;
