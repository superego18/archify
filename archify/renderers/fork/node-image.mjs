// Fork extension (superego18/archify dev_chanju): author-supplied node icons.
// `iconImage` is a self-contained SVG or PNG data URI (for example an official
// cloud service icon the author keeps with the diagram). A card with one gets a
// dedicated icon slot on its left, vertically centred; its type sigil is
// dropped and its text is centred in the remaining width. The artifact stays
// offline and the fork never redistributes third-party artwork.
// Top-level `"iconSlot": true` gives every card the same slot, filled by its
// type sigil scaled to the slot size. Nodes using neither keep their exact bytes.
import { esc } from '../shared/utils.mjs';

export const ICON_SLOT = Object.freeze({ inset: 10, size: 28, gap: 6, end: 6 });

// Horizontal shift that centres text between the icon slot and the right edge.
export function iconTextShift() {
  return (ICON_SLOT.inset + ICON_SLOT.size + ICON_SLOT.gap - ICON_SLOT.end) / 2;
}

const SIGIL = / {10}<g aria-hidden="true" data-semantic-sigil="[^"]*"[^>]*>[\s\S]*?\n {10}<\/g>\n?/;
// Sigils are drawn on a 16-unit grid.
const SIGIL_GRID = 16;

function shiftText(line, shift) {
  return line.replace(/(\sx=")([\d.-]+)(")/, (match, open, value, close) => `${open}${Number(value) + shift}${close}`);
}

function imageTag(component, x, y) {
  return `<image data-node-icon-image="" href="${esc(component.iconImage)}" x="${x}" y="${y}" width="${ICON_SLOT.size}" height="${ICON_SLOT.size}" preserveAspectRatio="xMidYMid meet"/>`;
}

// With `notationToggle`, a card carries both notations: the type sigil (C4,
// default) and the vendor look (its iconImage in the slot, or no sigil and
// full-width text, plus an optional vendorTint wash). The viewer switches
// between them; the default view is the C4 one.
function withNotations(markup, component, x, y, shift) {
  const image = typeof component.iconImage === 'string';
  const sigil = SIGIL.exec(markup);
  const c4 = sigil
    ? `          <g data-notation-only="c4">\n${sigil[0].replace(/transform="[^"]*"/, `transform="translate(${x} ${y}) scale(${ICON_SLOT.size / SIGIL_GRID})" data-icon-slot=""`).replace(/\n?$/, '\n')}          </g>\n`
    : '';
  const vendorParts = [];
  if (typeof component.vendorTint === 'string') {
    vendorParts.push(`<rect x="${component.x}" y="${component.y}" width="${component.width}" height="${component.height}" rx="6" fill="${esc(component.vendorTint)}" fill-opacity="0.32" pointer-events="none"/>`);
  }
  if (image) vendorParts.push(imageTag(component, x, y));
  const vendor = vendorParts.length
    ? `          <g data-notation-only="vendor" style="display:none">${vendorParts.join('')}</g>\n` : '';
  let placed = false;
  return markup.replace(SIGIL, '')
    .split('\n')
    .map((line) => {
      if (!/<text\b/.test(line) || !/text-anchor="middle"/.test(line)) return line;
      let shifted = shiftText(line, shift);
      if (!image) {
        const original = /\sx="([\d.-]+)"/.exec(line)[1];
        shifted = shifted.replace(/<text\b/, `<text data-notation-c4-x="${Number(original) + shift}" data-notation-vendor-x="${original}"`);
      }
      if (placed) return shifted;
      placed = true;
      return c4 + vendor + shifted;
    })
    .join('\n');
}

export function withNodeImage(markup, component, arch = {}) {
  const image = typeof component?.iconImage === 'string';
  if (!image && arch.iconSlot !== true) return markup;
  const shift = iconTextShift();
  const x = component.x + ICON_SLOT.inset;
  const y = component.y + (component.height - ICON_SLOT.size) / 2;
  if (arch.notationToggle && arch.iconSlot === true) return withNotations(markup, component, x, y, shift);
  let slot = '';
  if (image) {
    slot = `          ${imageTag(component, x, y)}\n`;
  } else {
    const sigil = SIGIL.exec(markup);
    if (!sigil) return markup;
    slot = sigil[0].replace(/transform="[^"]*"/, `transform="translate(${x} ${y}) scale(${ICON_SLOT.size / SIGIL_GRID})" data-icon-slot=""`);
    if (!slot.endsWith('\n')) slot += '\n';
  }
  let placed = false;
  return markup.replace(SIGIL, '')
    .split('\n')
    .map((line) => {
      if (!/<text\b/.test(line) || !/text-anchor="middle"/.test(line)) return line;
      const shifted = shiftText(line, shift);
      if (placed) return shifted;
      placed = true;
      return slot + shifted;
    })
    .join('\n');
}

const NOTATION_SCRIPT = `(function () {
  var config = JSON.parse(document.getElementById('fork-notation-data').textContent);
  var svg = document.querySelector('svg[data-quality-profile]');
  if (!svg) return;
  function set(mode) {
    svg.setAttribute('data-notation', mode);
    svg.querySelectorAll('[data-notation-only]').forEach(function (element) {
      element.style.display = element.getAttribute('data-notation-only') === mode ? '' : 'none';
    });
    svg.querySelectorAll('[data-notation-' + mode + '-x]').forEach(function (text) {
      text.setAttribute('x', text.getAttribute('data-notation-' + mode + '-x'));
    });
    document.querySelectorAll('#fork-notation button[data-notation]').forEach(function (button) {
      button.setAttribute('aria-pressed', String(button.getAttribute('data-notation') === mode));
    });
  }
  // Browser checks measure both notations through this hook.
  window.__archifyNotation = { modes: ['c4', 'vendor'], defaultMode: 'c4', set: set };
  function control() {
    var chip = document.getElementById('focus-chip');
    if (!chip || document.getElementById('fork-notation')) return;
    var row = document.createElement('div');
    row.id = 'fork-notation';
    row.className = 'no-print';
    row.setAttribute('role', 'group');
    row.setAttribute('aria-label', config.title);
    var name = document.createElement('div');
    name.textContent = config.title;
    name.style.cssText = 'opacity:0.75;margin-bottom:0.2rem;';
    row.appendChild(name);
    var options = document.createElement('div');
    options.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:0.25rem;';
    [['c4', config.c4], ['vendor', config.vendor]].forEach(function (entry) {
      var button = document.createElement('button');
      button.type = 'button';
      button.textContent = entry[1];
      button.setAttribute('data-notation', entry[0]);
      button.style.cssText = 'border:1px solid var(--frontend-stroke);border-radius:0.45rem;background:none;color:inherit;cursor:pointer;padding:0.25rem 0.35rem;font:inherit;';
      button.addEventListener('click', function () { set(entry[0]); });
      options.appendChild(button);
    });
    row.appendChild(options);
    var style = document.createElement('style');
    style.textContent = '#fork-notation button[aria-pressed="true"]{background:var(--frontend-stroke);color:var(--toolbar-menu-bg);font-weight:600;}';
    row.appendChild(style);
    var panel = document.getElementById('fork-variant-panel');
    var body = panel && panel.querySelector(':scope > div');
    if (body) {
      row.style.cssText = 'margin:0.35rem 0 0.2rem;padding-bottom:0.45rem;border-bottom:1px solid var(--frontend-stroke);';
      body.insertBefore(row, body.firstChild);
    } else {
      row.style.cssText = 'position:absolute;right:1rem;top:1rem;z-index:11;width:14rem;border:1px solid var(--frontend-stroke);border-radius:0.85rem;'
        + 'background:var(--toolbar-menu-bg);color:var(--toolbar-text);font-size:0.72rem;padding:0.6rem 0.7rem;';
      chip.parentNode.insertBefore(row, chip.nextSibling);
    }
    set(svg.getAttribute('data-notation') || 'c4');
  }
  // After the variant panel exists, so the control can join it.
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(control, 0); });
  else setTimeout(control, 0);
})();`;

export function notationScript(arch) {
  if (!arch.notationToggle || arch.iconSlot !== true) return '';
  const korean = String(arch.meta?.locale || '').startsWith('ko');
  const config = {
    title: korean ? '표기' : 'Notation',
    c4: arch.notationToggle.c4Label || (korean ? '종류 기호 (C4)' : 'Type symbols (C4)'),
    vendor: arch.notationToggle.vendorLabel || (korean ? '벤더 표기' : 'Vendor style'),
  };
  const json = JSON.stringify(config).replace(/</g, '\\u003c');
  return `\n      <script type="application/json" id="fork-notation-data">${json}</script>\n      <script data-archify-fork="notation">\n${NOTATION_SCRIPT}\n      </script>`;
}
