// Browser-measured graphic quality: rendered glyph boxes, arrow shafts, label
// clearance and icon geometry. Static checks estimate text width from character
// counts; these checks read the geometry the browser actually painted.

export const GRAPHIC_QUALITY_THRESHOLDS = Object.freeze({
  nodeTextPaddingX: 4,
  nodeTextPaddingY: 3,
  arrowShaftMinimum: 6,
  labelClearance: 4,
  iconAspectTolerance: 0.05,
});

export const GRAPHIC_QUALITY_CODES = Object.freeze({
  nodeText: 'viewer/node-text-overflow',
  arrow: 'viewer/arrow-visible-length',
  label: 'viewer/label-clearance',
  icon: 'viewer/icon-geometry',
});

const MAX_DIAGNOSTICS_PER_CODE = 20;
const MAX_RECORDED_ISSUES = 200;

// Evaluated inside the page with awaitPromise. All measurements are in SVG
// user units, so the result does not depend on the viewport size.
const MEASURE_SCRIPT = `(async function (T) {
  var diagram = document.querySelector('.diagram-container');
  var svg = diagram && (
    diagram.querySelector(':scope > svg') ||
    diagram.querySelector(':scope > .diagram-stage > svg')
  );
  if (!svg || typeof svg.getScreenCTM !== 'function') return null;
  var ctm = svg.getScreenCTM();
  if (!ctm) return null;
  var inverse = ctm.inverse();
  var profile = svg.getAttribute('data-quality-profile') || 'standard';
  var issues = [];
  function round(value) { return Math.round(value * 10) / 10; }
  // Floor clearances so a 3.96px gap is never reported as meeting a 4px rule.
  function floor1(value) { return Math.floor(value * 10) / 10; }
  function visible(element) {
    for (var current = element; current && current !== svg; current = current.parentElement) {
      var style = window.getComputedStyle(current);
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
    }
    return true;
  }
  function box(element) {
    if (!element || !visible(element)) return null;
    var rect = element.getBoundingClientRect();
    if (!rect.width && !rect.height) return null;
    var a = svg.createSVGPoint(); a.x = rect.left; a.y = rect.top;
    var b = svg.createSVGPoint(); b.x = rect.right; b.y = rect.bottom;
    a = a.matrixTransform(inverse); b = b.matrixTransform(inverse);
    return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) };
  }
  function gap(a, b) {
    var dx = Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w), 0);
    var dy = Math.max(b.y - (a.y + a.h), a.y - (b.y + b.h), 0);
    if (dx === 0 && dy === 0) {
      var ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      var oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      return -Math.min(ox, oy);
    }
    return Math.max(dx, dy);
  }
  function contains(outer, inner, tolerance) {
    return inner.x >= outer.x - tolerance && inner.y >= outer.y - tolerance
      && inner.x + inner.w <= outer.x + outer.w + tolerance
      && inner.y + inner.h <= outer.y + outer.h + tolerance;
  }
  function centerInside(outer, inner) {
    var cx = inner.x + inner.w / 2, cy = inner.y + inner.h / 2;
    return cx >= outer.x && cx <= outer.x + outer.w && cy >= outer.y && cy <= outer.y + outer.h;
  }
  function text(element) { return (element.textContent || '').trim().slice(0, 80); }
  function edgeOwner(element) {
    var edge = element.closest('[data-edge-from][data-edge-to]');
    return edge ? {
      kind: 'edge',
      id: edge.getAttribute('data-edge-id'),
      from: edge.getAttribute('data-edge-from'),
      to: edge.getAttribute('data-edge-to')
    } : null;
  }

  var nodes = Array.from(svg.querySelectorAll('g[data-node-id]')).map(function (node) {
    var shape = node.querySelector(':scope > rect.c-mask') || node.querySelector(':scope > rect');
    var bounds = box(shape);
    return bounds ? { id: node.getAttribute('data-node-id'), element: node, box: bounds } : null;
  }).filter(Boolean);

  // 1. Node text must stay inside its node with inner padding.
  nodes.forEach(function (node) {
    Array.from(node.element.querySelectorAll('text')).forEach(function (label) {
      if (label.closest('.brand-mark')) return;
      var bounds = box(label);
      if (!bounds || !centerInside(node.box, bounds)) return;
      var margins = {
        left: bounds.x - node.box.x,
        right: node.box.x + node.box.w - (bounds.x + bounds.w),
        top: bounds.y - node.box.y,
        bottom: node.box.y + node.box.h - (bounds.y + bounds.h)
      };
      var horizontal = Math.min(margins.left, margins.right);
      var vertical = Math.min(margins.top, margins.bottom);
      if (horizontal >= T.nodeTextPaddingX && vertical >= T.nodeTextPaddingY) return;
      issues.push({
        check: 'nodeText',
        subject: { kind: 'node', id: node.id },
        text: text(label),
        overflow: horizontal < 0 || vertical < 0,
        defect: horizontal < 0 || vertical < 0,
        marginX: floor1(horizontal),
        marginY: floor1(vertical),
        requiredX: T.nodeTextPaddingX,
        requiredY: T.nodeTextPaddingY
      });
    });
  });

  // 2. The last segment must leave a visible shaft behind the arrowhead.
  function markerLength(element, attribute) {
    var reference = element.getAttribute(attribute) || '';
    var match = /url\\(#([^)]+)\\)/.exec(reference);
    if (!match) return null;
    var marker = document.getElementById(match[1]);
    if (!marker) return null;
    var markerWidth = parseFloat(marker.getAttribute('markerWidth') || '3');
    var viewBox = marker.viewBox && marker.viewBox.baseVal;
    var viewBoxWidth = viewBox && viewBox.width ? viewBox.width : markerWidth;
    var refX = parseFloat(marker.getAttribute('refX') || '0') || markerWidth;
    var units = marker.getAttribute('markerUnits') || 'strokeWidth';
    var strokeWidth = parseFloat(window.getComputedStyle(element).strokeWidth) || 1;
    var scale = (units === 'userSpaceOnUse' ? 1 : strokeWidth) * (markerWidth / viewBoxWidth);
    return refX * scale;
  }
  Array.from(svg.querySelectorAll('path[marker-end], line[marker-end], polyline[marker-end], path[marker-start]')).forEach(function (route) {
    if (!visible(route) || /underlay/.test(route.getAttribute('data-graph-role') || '')) return;
    var points = (route.getAttribute('data-composition-points') || '').split(';').map(function (pair) {
      var xy = pair.split(',').map(Number);
      return xy.length === 2 && xy.every(Number.isFinite) ? xy : null;
    }).filter(Boolean);
    // Each end with a marker needs its own shaft; both heads share one segment
    // when the route is a single straight run.
    [['marker-end', points.length - 2, points.length - 1], ['marker-start', 1, 0]].forEach(function (end) {
      var head = markerLength(route, end[0]);
      if (!head) return;
      var heads = head;
      if (points.length === 2 && markerLength(route, end[0] === 'marker-end' ? 'marker-start' : 'marker-end')) heads = head * 2;
      var segment = null;
      if (points.length >= 2) {
        var a = points[end[1]], b = points[end[2]];
        segment = Math.hypot(b[0] - a[0], b[1] - a[1]);
      } else if (typeof route.getTotalLength === 'function') {
        segment = route.getTotalLength();
      }
      if (segment === null || segment >= heads + T.arrowShaftMinimum) return;
      issues.push({
        check: 'arrow',
        subject: edgeOwner(route) || { kind: 'route', id: route.getAttribute('id') },
        end: end[0] === 'marker-end' ? 'target' : 'source',
        defect: segment - heads <= 0,
        lastSegment: round(segment),
        arrowhead: round(heads),
        shaft: floor1(segment - heads),
        requiredShaft: T.arrowShaftMinimum
      });
    });
  });

  // 3. Relationship and boundary labels keep clearance from nodes, other labels and icons.
  var labels = [];
  Array.from(svg.querySelectorAll('g[data-edge-from][data-edge-to]')).forEach(function (group) {
    Array.from(group.querySelectorAll('text')).forEach(function (label) {
      var bounds = box(label);
      if (bounds) labels.push({ kind: 'edge-label', owner: edgeOwner(group), text: text(label), box: bounds, element: label });
    });
  });
  Array.from(svg.querySelectorAll('text[data-boundary-label]')).forEach(function (label) {
    var bounds = box(label);
    if (bounds) labels.push({ kind: 'boundary-label', owner: { kind: 'boundary', id: null }, text: text(label), box: bounds, element: label });
  });
  var icons = Array.from(svg.querySelectorAll('g.brand-mark, g[data-semantic-sigil], image')).map(function (icon) {
    if (icon.tagName.toLowerCase() === 'image' && icon.closest('g.brand-mark')) return null;
    var bounds = box(icon);
    var node = icon.closest('g[data-node-id]');
    return bounds ? { element: icon, box: bounds, node: node ? node.getAttribute('data-node-id') : null } : null;
  }).filter(Boolean);
  labels.forEach(function (label, index) {
    var obstacles = nodes.map(function (node) { return { kind: 'node', id: node.id, box: node.box }; })
      .concat(labels.slice(index + 1).map(function (other) {
        return { kind: other.kind, id: other.owner && other.owner.id, text: other.text, box: other.box };
      }))
      .concat(icons.filter(function (icon) { return !icon.node; }).map(function (icon) {
        return { kind: 'icon', id: null, box: icon.box };
      }));
    obstacles.forEach(function (obstacle) {
      var distance = gap(label.box, obstacle.box);
      if (distance >= T.labelClearance) return;
      issues.push({
        check: 'label',
        subject: label.owner,
        label: label.kind,
        text: label.text,
        obstacle: { kind: obstacle.kind, id: obstacle.id || null, text: obstacle.text || null },
        overlap: distance <= 0,
        defect: distance <= 0,
        gap: floor1(distance),
        required: T.labelClearance
      });
    });
  });

  // 4. Icons load, keep their aspect ratio, stay inside their node and clear of its text.
  function loadImage(href) {
    return new Promise(function (resolve) {
      var image = new Image();
      var timer = setTimeout(function () { resolve(null); }, 3000);
      image.onload = function () { clearTimeout(timer); resolve(image.naturalWidth ? image : null); };
      image.onerror = function () { clearTimeout(timer); resolve(null); };
      image.src = href;
    });
  }
  for (var i = 0; i < icons.length; i += 1) {
    var icon = icons[i];
    var element = icon.element;
    var subject = icon.node ? { kind: 'node', id: icon.node } : { kind: 'icon', id: null };
    if (element.tagName.toLowerCase() === 'image' || element.querySelector('image')) {
      var imageElement = element.tagName.toLowerCase() === 'image' ? element : element.querySelector('image');
      var href = imageElement.getAttribute('href') || imageElement.getAttribute('xlink:href') || '';
      var loaded = href ? await loadImage(href) : null;
      if (!loaded) {
        issues.push({ check: 'icon', subject: subject, kind: 'load-failed', defect: true, href: href.slice(0, 120) });
      } else if ((imageElement.getAttribute('preserveAspectRatio') || '').trim() === 'none') {
        var imageBox = box(imageElement);
        var natural = loaded.naturalWidth / loaded.naturalHeight;
        var drawn = imageBox && imageBox.h ? imageBox.w / imageBox.h : natural;
        var distortion = Math.abs(drawn / natural - 1);
        if (distortion > T.iconAspectTolerance) {
          issues.push({ check: 'icon', subject: subject, kind: 'aspect-distorted', defect: true, distortion: round(distortion * 100) / 100, tolerance: T.iconAspectTolerance });
        }
      }
    }
    if (!icon.node) continue;
    var owner = nodes.find(function (node) { return node.id === icon.node; });
    if (!owner) continue;
    if (!contains(owner.box, icon.box, 0.5)) {
      issues.push({ check: 'icon', subject: subject, kind: 'clipped', defect: true, overflow: round(-gap(icon.box, owner.box)) });
    }
    Array.from(owner.element.querySelectorAll('text')).forEach(function (label) {
      if (label.closest('.brand-mark') || element.contains(label)) return;
      var bounds = box(label);
      if (bounds && gap(icon.box, bounds) < 0) {
        issues.push({ check: 'icon', subject: subject, kind: 'text-overlap', defect: true, text: text(label), overlap: round(-gap(icon.box, bounds)) });
      }
    });
  }

  var counts = { nodeText: 0, arrow: 0, label: 0, icon: 0 };
  issues.forEach(function (issue) { counts[issue.check] += 1; });
  return { profile: profile, thresholds: T, counts: counts, issueCount: issues.length, issues: issues.slice(0, ${MAX_RECORDED_ISSUES}) };
})`;

// A diagram with fork variants exposes window.__archifyVariants; every
// combination is shown and measured in turn, and repeated issues are kept once
// with the first combination that shows them.
export const GRAPHIC_QUALITY_SCRIPT = `(async function (T) {
  var measure = ${MEASURE_SCRIPT};
  var api = window.__archifyVariants;
  if (!api || !api.keys || !api.keys.length) return measure(T);
  var merged = null;
  var seen = {};
  for (var i = 0; i < api.keys.length; i += 1) {
    api.set(api.keys[i]);
    var result = await measure(T);
    if (!result) continue;
    if (!merged) merged = { profile: result.profile, thresholds: T, counts: { nodeText: 0, arrow: 0, label: 0, icon: 0 }, issueCount: 0, issues: [], combinations: api.keys.length };
    result.issues.forEach(function (issue) {
      var id = JSON.stringify(issue);
      if (seen[id]) return;
      seen[id] = true;
      issue.variant = api.keys[i];
      merged.counts[issue.check] += 1;
      merged.issueCount += 1;
      if (merged.issues.length < ${MAX_RECORDED_ISSUES}) merged.issues.push(issue);
    });
  }
  api.set(api.defaultKey);
  return merged;
})`;

export function graphicQualityExpression(thresholds = GRAPHIC_QUALITY_THRESHOLDS) {
  return `${GRAPHIC_QUALITY_SCRIPT}(${JSON.stringify(thresholds)})`;
}

function describe(issue) {
  const who = issue.subject?.kind === 'edge'
    ? `relationship ${issue.subject.id || `${issue.subject.from} -> ${issue.subject.to}`}`
    : issue.subject?.kind === 'node' ? `node ${issue.subject.id}`
      : issue.subject?.kind === 'boundary' ? 'boundary label' : 'graphic';
  if (issue.check === 'nodeText') {
    return {
      message: issue.overflow
        ? `Text "${issue.text}" overflows ${who}.`
        : `Text "${issue.text}" sits closer than the inner padding to the edge of ${who}.`,
      fix: `widen or heighten ${who}, shorten the text, or move it until it keeps ${issue.requiredX}px horizontal and ${issue.requiredY}px vertical padding`,
    };
  }
  if (issue.check === 'arrow') {
    return {
      message: `The ${issue.end === 'source' ? 'first' : 'final'} segment of ${who} is ${issue.lastSegment}px, leaving ${issue.shaft}px of line behind ${issue.end === 'source' ? 'its source' : 'a'} ${issue.arrowhead}px arrowhead.`,
      fix: `move the endpoints apart or change the port so that segment is at least ${issue.arrowhead + issue.requiredShaft}px`,
    };
  }
  if (issue.check === 'label') {
    const obstacle = issue.obstacle.kind === 'node' ? `node ${issue.obstacle.id}`
      : issue.obstacle.kind === 'icon' ? 'an icon'
        : `the ${issue.obstacle.kind} "${issue.obstacle.text || ''}"`;
    return {
      message: issue.overlap
        ? `The ${issue.label} "${issue.text}" of ${who} overlaps ${obstacle}.`
        : `The ${issue.label} "${issue.text}" of ${who} is ${issue.gap}px from ${obstacle}.`,
      fix: `move the label or the ${issue.obstacle.kind} until they are at least ${issue.required}px apart`,
    };
  }
  const iconMessages = {
    'load-failed': `An icon in ${who} did not load.`,
    'aspect-distorted': `An icon in ${who} is stretched ${Math.round(issue.distortion * 100)}% away from its natural aspect ratio.`,
    clipped: `An icon extends outside ${who}.`,
    'text-overlap': `An icon in ${who} overlaps the text "${issue.text}".`,
  };
  const iconFixes = {
    'load-failed': 'embed the icon or fix its source, then rerun',
    'aspect-distorted': 'keep preserveAspectRatio or size the icon box to the image ratio',
    clipped: 'move or shrink the icon so it stays inside its node',
    'text-overlap': 'move the icon or the text so they no longer intersect',
  };
  return { message: iconMessages[issue.kind], fix: iconFixes[issue.kind] };
}

// Turns one measured graphics result into a receipt section and diagnostics.
// A measured defect (overflow, overlap, arrowhead with no visible line, broken
// icon) fails a showcase diagram. Clearance below the preferred spacing, and
// every finding in a standard diagram, is a warning that leaves the gate open.
export function graphicQualityReceipt(graphics, { artifact, viewport, command }) {
  if (!graphics) {
    return { section: { status: 'not-measured', issueCount: 0, counts: null, issues: [] }, diagnostics: [] };
  }
  const severityOf = (issue) => (graphics.profile === 'showcase' && issue.defect ? 'error' : 'warning');
  const hasError = graphics.issues.some((issue) => severityOf(issue) === 'error');
  const status = graphics.issueCount === 0 ? 'pass' : hasError ? 'fail' : 'warn';
  const perCode = new Map();
  const diagnostics = [];
  for (const issue of graphics.issues) {
    const code = GRAPHIC_QUALITY_CODES[issue.check];
    const seen = perCode.get(code) || 0;
    perCode.set(code, seen + 1);
    if (seen >= MAX_DIAGNOSTICS_PER_CODE) continue;
    const described = describe(issue);
    const message = issue.variant ? `${described.message} (variant combination ${issue.variant})` : described.message;
    const { fix } = described;
    const { check, ...evidence } = issue;
    diagnostics.push({
      code,
      severity: severityOf(issue),
      message,
      subject: { artifact, viewport, ...(issue.subject ? { graphic: issue.subject } : {}) },
      evidence: { ...evidence, measurement: 'SVG user units, measured from rendered glyph and element boxes' },
      supportedFixes: [`${fix}, then rerun ${command}`],
    });
  }
  return {
    section: {
      status,
      profile: graphics.profile,
      ...(graphics.combinations ? { combinations: graphics.combinations } : {}),
      thresholds: graphics.thresholds,
      viewport,
      issueCount: graphics.issueCount,
      counts: graphics.counts,
      issues: graphics.issues,
    },
    diagnostics,
  };
}
