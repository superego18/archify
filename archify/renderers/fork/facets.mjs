// Fork extension (superego18/archify dev_chanju): author-defined facets.
// A diagram declares the concepts it wants to show (provider, owner, stage...)
// and each facet's values; components pick a value per facet. Facets with a
// stripe marker color the card edge and get legend rows; every facet value is
// shown as a chip in the Semantic Passport. Diagrams without facets keep their
// exact bytes.
import { esc } from '../shared/utils.mjs';
import { asArray } from '../shared/geometry.mjs';

const PALETTE = ['#FF9900', '#FF3621', '#03C75A', '#2D6CDF', '#8B5CF6', '#0EA5E9', '#64748B', '#D946EF'];
const STRIPES = ['stripe-left', 'stripe-right'];

function resolvedFacets(arch) {
  return asArray(arch.facets).map((facet, index) => ({
    ...facet,
    marker: facet.marker || (index === 0 ? 'stripe-left' : 'none'),
    values: new Map(asArray(facet.values).map((value, valueIndex) => [value.id, {
      ...value,
      color: value.color || PALETTE[valueIndex % PALETTE.length],
    }])),
  }));
}

function picks(arch, component) {
  return resolvedFacets(arch).flatMap((facet) => {
    const value = facet.values.get(component.facets?.[facet.id]);
    return value ? [{ facet, value }] : [];
  });
}

export function facetProblems(arch) {
  const facets = resolvedFacets(arch);
  const problems = [];
  const byId = new Map(facets.map((facet) => [facet.id, facet]));
  if (byId.size !== facets.length) problems.push('Facets must have unique ids.');
  for (const facet of facets) {
    if (facet.values.size !== asArray(arch.facets.find((entry) => entry.id === facet.id)?.values).length) {
      problems.push(`Facet "${facet.id}" values must have unique ids.`);
    }
  }
  const stripes = facets.filter((facet) => STRIPES.includes(facet.marker)).map((facet) => facet.marker);
  if (new Set(stripes).size !== stripes.length) problems.push('Only one facet may use each stripe marker.');
  for (const component of asArray(arch.components)) {
    for (const [facetId, valueId] of Object.entries(component.facets || {})) {
      const facet = byId.get(facetId);
      if (!facet) problems.push(`Component "${component.id}" uses unknown facet "${facetId}" — declare it in facets.`);
      else if (!facet.values.has(valueId)) problems.push(`Component "${component.id}" uses unknown ${facetId} value "${valueId}" — declare it in facets.`);
    }
  }
  return problems;
}

// Legend rows follow the type rows for facets that color the canvas. They
// describe a facet value, not a type, so they are not interactive filters.
export function withFacetLegend(entries, arch) {
  if (arch.meta?.legend?.mode === 'hidden') return entries;
  const facets = resolvedFacets(arch).filter((facet) => STRIPES.includes(facet.marker));
  const prefix = facets.length > 1;
  const rows = facets.flatMap((facet) => {
    const used = new Set(asArray(arch.components).map((component) => component.facets?.[facet.id]).filter(Boolean));
    return [...facet.values.values()].filter((value) => used.has(value.id)).map((value) => ({
      kind: `facet:${facet.id}:${value.id}`,
      label: prefix ? `${facet.label}: ${value.label}` : value.label,
      facetColor: value.color,
      present: true,
      interactive: false,
    }));
  });
  return rows.length ? [...entries, ...rows] : entries;
}

export function facetSwatch(renderSwatch) {
  return (entry) => entry.facetColor
    ? `<rect x="${entry.x + 6}" y="${entry.baseline - 10}" width="4" height="12" rx="2" fill="${esc(entry.facetColor)}"/>`
    : renderSwatch(entry);
}

export function facetNodeAttr(arch, component) {
  const chosen = picks(arch, component);
  if (!chosen.length) return '';
  const data = chosen.map(({ facet, value }) => ({ facet: facet.label, value: value.label, color: value.color }));
  return ` data-node-facets="${esc(JSON.stringify(data))}"`;
}

// Stripes sit inside the card edge, clear of the type sigil and label.
export function facetStripes(arch, component) {
  return picks(arch, component).filter(({ facet }) => STRIPES.includes(facet.marker)).map(({ facet, value }) => {
    const x = facet.marker === 'stripe-left' ? component.x + 2.5 : component.x + component.width - 5.5;
    return `\n          <rect data-facet-stripe="${esc(facet.id)}" x="${x}" y="${component.y + 8}" width="3" height="${Math.max(4, component.height - 16)}" rx="1.5" fill="${esc(value.color)}" pointer-events="none"/>`;
  }).join('');
}

const FACET_SCRIPT = `(function () {
  function start() {
    var id = document.getElementById('focus-id');
    var meta = document.getElementById('focus-passport-meta');
    if (!id || !meta || document.getElementById('focus-facets')) return;
    var holder = document.createElement('span');
    holder.id = 'focus-facets';
    holder.style.display = 'contents';
    meta.insertBefore(holder, id);
    function sync() {
      holder.textContent = '';
      var key = id.hidden ? '' : id.textContent;
      var node = key ? document.querySelector('g[data-node-id="' + CSS.escape(key) + '"]') : null;
      var data = [];
      try { data = JSON.parse(node ? node.getAttribute('data-node-facets') || '[]' : '[]'); } catch (error) { data = []; }
      data.forEach(function (entry) {
        var chip = document.createElement('span');
        chip.setAttribute('data-passport', 'facet');
        chip.title = entry.facet;
        chip.textContent = entry.facet + ': ' + entry.value;
        chip.style.color = entry.color;
        holder.appendChild(chip);
      });
    }
    new MutationObserver(sync).observe(id, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
    sync();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();`;

export function facetScript(arch) {
  return asArray(arch.components).some((component) => picks(arch, component).length)
    ? `\n      <script data-archify-fork="facets">\n${FACET_SCRIPT}\n      </script>` : '';
}
