// Fork extension (superego18/archify dev_chanju): author-chosen text sizes.
// `meta.textSize` sets the preferred px size of card names (`label`), card
// descriptions (`sublabel`), connection labels (`edgeLabel`) and boundary
// titles (`boundaryLabel`). Every measurement that reads a size reads it from
// here, so the drawn text, its mask, the static layout checks and the browser
// checks agree. Diagrams without `meta.textSize` keep their exact bytes.
import { textUnits } from '../shared/utils.mjs';
import { nodeTextFit } from '../shared/text-fit.mjs';
import { ICON_SLOT } from './node-image.mjs';

const DEFAULT = Object.freeze({ label: 11, labelMinimum: 8, sublabel: 9, edgeLabel: 8 });

function sizes(arch) {
  const value = arch?.meta?.textSize;
  return value && typeof value === 'object' ? value : {};
}

function size(arch, key) {
  const value = sizes(arch)[key];
  return Number.isFinite(value) ? value : null;
}

// Boundary titles and sublabels are measured from these upstream tables; one
// call after they are defined makes every reader use the chosen size. A
// minimum never exceeds its preferred size.
export function applyTextSize(arch, layout, componentTextFit) {
  const boundary = size(arch, 'boundaryLabel');
  if (boundary !== null) {
    // The title mask keeps a fixed 3px under the baseline, but the descent
    // grows with the size; widen the gaps to the cards and stacked titles
    // below by the extra descent so the painted glyphs keep the 4px label
    // clearance.
    const descent = Math.max(0, Math.ceil((boundary - layout.boundaryLabelFontPreferred) * 0.3));
    layout.boundaryLabelClearance += descent;
    layout.boundaryLabelRailGap += descent;
    layout.boundaryLabelFontPreferred = boundary;
    layout.boundaryLabelFontMinimum = Math.min(layout.boundaryLabelFontMinimum, boundary);
  }
  const sublabel = size(arch, 'sublabel');
  if (sublabel !== null) {
    componentTextFit.sublabelPreferred = sublabel;
    componentTextFit.sublabelMinimum = Math.min(componentTextFit.sublabelMinimum, sublabel);
  }
}

// [preferred, minimum] for fittedNodeFontSize on a card name.
export function labelFontRange(arch) {
  const label = size(arch, 'label');
  return label === null ? [DEFAULT.label, DEFAULT.labelMinimum] : [label, Math.min(DEFAULT.labelMinimum, label)];
}

// Px per text unit the static name-overflow check measures. The name shrinks
// to fit, so the check keeps the default reading size as its ceiling.
export function labelCheckAdvance(arch) {
  const label = size(arch, 'label');
  return label === null ? 6.6 : 0.6 * Math.min(DEFAULT.label, label);
}

// Width a card's text may fit into. With a text size set, an icon slot's
// footprint is left out, because the text is centred beside the slot.
export function textFitWidth(arch, component, width) {
  if (!hasTextSize(arch)) return width;
  if (typeof component?.iconImage !== 'string' && arch.iconSlot !== true) return width;
  // fittedNodeFontSize takes its horizontal padding back off this width.
  return Math.max(1, width - (ICON_SLOT.inset + ICON_SLOT.size + ICON_SLOT.gap + ICON_SLOT.end) + nodeTextFit.horizontalPadding);
}

export function hasTextSize(arch) {
  return ['label', 'sublabel', 'edgeLabel', 'boundaryLabel'].some((key) => size(arch, key) !== null);
}

// Baselines for the name and description rows. The default rows are kept;
// with a size set, the two rows are spaced for their sizes and centred where
// the default rows sit.
export function componentTextRows(arch, c, hasSub) {
  const labelSize = size(arch, 'label');
  const sublabelSize = size(arch, 'sublabel');
  if (labelSize === null && sublabelSize === null) {
    return {
      labelY: hasSub ? c.y + c.height / 2 - 2 : c.y + c.height / 2 + 4,
      sublabelY: c.y + c.height / 2 + 14,
    };
  }
  const label = labelSize ?? DEFAULT.label;
  const sublabel = sublabelSize ?? DEFAULT.sublabel;
  const cy = c.y + c.height / 2;
  if (!hasSub) return { labelY: round(cy + 0.35 * label + 0.15), sublabelY: null };
  const gap = sublabel + 7;
  const labelY = round(cy + 2.5 - (0.8 * label + gap + 0.2 * sublabel) / 2 + 0.8 * label);
  return { labelY, sublabelY: round(labelY + gap) };
}

export function edgeLabelFont(arch) {
  return size(arch, 'edgeLabel') ?? DEFAULT.edgeLabel;
}

// Distance from a connection label mask's top to the text baseline.
export function edgeLabelTop(arch) {
  const edge = size(arch, 'edgeLabel');
  return edge === null ? 10 : edge + 2;
}

// The connection label mask at a baseline point. A larger size grows the mask
// upward; its bottom stays 4px below the baseline, so the clearance to the
// route under a default label does not change.
export function edgeLabelBoxAt(arch, label, lx, ly) {
  const edge = size(arch, 'edgeLabel');
  if (edge === null) {
    const width = Math.max(30, textUnits(label) * 4.8 + 10);
    return { x: lx - width / 2, y: ly - 10, width, height: 14, lx, ly };
  }
  const width = Math.max(30, textUnits(label) * 0.6 * edge + 10);
  const baselineOffset = edge + 2;
  return { x: lx - width / 2, y: ly - baselineOffset, width, height: edge + 6, lx, ly, baselineOffset };
}

function round(value) {
  return Math.round(value * 10) / 10;
}
