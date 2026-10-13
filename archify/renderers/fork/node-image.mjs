// Fork extension (superego18/archify dev_chanju): author-supplied node icons.
// `iconImage` is a self-contained SVG or PNG data URI (for example an official
// cloud service icon the author keeps with the diagram). It is drawn over the
// type sigil in the card's top-left corner, so the artifact stays offline and
// the fork never redistributes third-party artwork. Nodes without it keep their
// exact bytes.
import { esc } from '../shared/utils.mjs';

export const NODE_IMAGE_SIZE = 20;

export function nodeImage(component) {
  if (typeof component?.iconImage !== 'string') return '';
  return `\n          <image data-node-icon-image="" href="${esc(component.iconImage)}" x="${component.x + 7}" y="${component.y + 4}" width="${NODE_IMAGE_SIZE}" height="${NODE_IMAGE_SIZE}" preserveAspectRatio="xMidYMid meet"/>`;
}
