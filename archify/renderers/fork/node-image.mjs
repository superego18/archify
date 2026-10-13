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

export function withNodeImage(markup, component, arch = {}) {
  const image = typeof component?.iconImage === 'string';
  if (!image && arch.iconSlot !== true) return markup;
  const shift = iconTextShift();
  const x = component.x + ICON_SLOT.inset;
  const y = component.y + (component.height - ICON_SLOT.size) / 2;
  let slot = '';
  let body = markup;
  if (image) {
    slot = `          <image data-node-icon-image="" href="${esc(component.iconImage)}" x="${x}" y="${y}" width="${ICON_SLOT.size}" height="${ICON_SLOT.size}" preserveAspectRatio="xMidYMid meet"/>\n`;
    body = markup.replace(SIGIL, '');
  } else {
    const sigil = SIGIL.exec(markup);
    if (!sigil) return markup;
    slot = sigil[0].replace(/transform="[^"]*"/, `transform="translate(${x} ${y}) scale(${ICON_SLOT.size / SIGIL_GRID})" data-icon-slot=""`);
    if (!slot.endsWith('\n')) slot += '\n';
    body = markup.replace(SIGIL, '');
  }
  let placed = false;
  return body
    .split('\n')
    .map((line) => {
      if (!/<text\b/.test(line) || !/text-anchor="middle"/.test(line)) return line;
      const shifted = line.replace(/(\sx=")([\d.-]+)(")/, (match, open, value, close) => `${open}${Number(value) + shift}${close}`);
      if (placed) return shifted;
      placed = true;
      return slot + shifted;
    })
    .join('\n');
}
