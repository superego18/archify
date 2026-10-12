// Fork extension (superego18/archify dev_chanju): bidirectional connections.
// Kept out of upstream renderers so upstream merges touch only the call sites.
import { asArray } from '../shared/geometry.mjs';

const START_SUFFIX = '-start';

// Start markers mirror the shared arrowheads with orient="auto-start-reverse",
// so the head at the source points back toward it. Emitted only when needed so
// diagrams without bidirectional connections keep their exact bytes.
export function bidirectionalMarkerDefinitions(connections) {
  if (!asArray(connections).some((conn) => conn?.bidirectional === true)) return '';
  return ['default', 'emphasis', 'security', 'dashed'].map((tone) => {
    const id = tone === 'default' ? 'arrowhead' : `arrowhead-${tone}`;
    return `
          <marker id="${id}${START_SUFFIX}" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto-start-reverse">
            <polygon points="0 0, 10 3.5, 0 7" class="m-${tone}" />
          </marker>`;
  }).join('');
}

export function bidirectionalEdgeAttrs(conn, marker) {
  return conn?.bidirectional === true ? ` marker-start="url(#${marker}${START_SUFFIX})" data-edge-bidirectional="true"` : '';
}
