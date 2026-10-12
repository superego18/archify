// Fork extension (superego18/archify dev_chanju): clickable boundaries.
// A boundary with an `id` or `note` opens a small panel with its note and the
// components it wraps. The viewer template stays untouched: diagrams that use
// it carry their own script, and other diagrams keep their exact bytes.
import { esc } from '../shared/utils.mjs';
import { asArray } from '../shared/geometry.mjs';

function interactive(boundary) {
  const note = typeof boundary?.note === 'string' ? boundary.note.trim() : '';
  return { on: Boolean(boundary?.id || note), note };
}

// Attributes for the boundary frame and its label. The label is the keyboard
// target; the frame makes the empty area inside the boundary clickable too.
export function boundaryAttrs(boundary, { focusable = false } = {}) {
  const { on, note } = interactive(boundary);
  if (!on) return '';
  const id = boundary.id ? ` data-boundary-id="${esc(boundary.id)}"` : '';
  const text = note ? ` data-boundary-note="${esc(note)}"` : '';
  const members = ` data-boundary-members="${esc(asArray(boundary.wraps).join(' '))}"`;
  const focus = focusable ? ` tabindex="0" role="button" aria-label="${esc(boundary.label)}"` : '';
  return `${id}${text}${members}${focus} data-boundary-interactive="true" style="cursor:pointer"`;
}

const BOUNDARY_SCRIPT = `(function () {
  function start() {
    var svg = document.querySelector('svg[data-quality-profile]');
    var chip = document.getElementById('focus-chip');
    if (!svg || !chip || document.getElementById('fork-boundary-panel')) return;
    var panel = document.createElement('div');
    panel.id = 'fork-boundary-panel';
    panel.className = 'no-print';
    panel.setAttribute('role', 'region');
    panel.hidden = true;
    panel.style.cssText = 'position:absolute;left:1rem;top:1rem;z-index:12;width:min(20rem,calc(100% - 13rem));'
      + 'border:1px solid var(--cloud-stroke);border-radius:0.85rem;background:var(--toolbar-menu-bg);color:var(--toolbar-text);'
      + 'box-shadow:0 18px 48px rgba(0,0,0,0.3);backdrop-filter:blur(16px);font-size:0.75rem;padding:0.75rem 0.85rem;';
    chip.parentNode.insertBefore(panel, chip.nextSibling);
    function nodeFor(id) { return svg.querySelector('g[data-node-id="' + CSS.escape(id) + '"]'); }
    function close() { panel.hidden = true; panel.textContent = ''; }
    function open(owner) {
      // One panel at a time: a keyboard open does not pass through the
      // viewer's canvas click that would otherwise dismiss the passport.
      var clear = document.getElementById('btn-focus-clear');
      if (!chip.hidden && clear) clear.click();
      panel.textContent = '';
      var head = document.createElement('div');
      head.style.cssText = 'display:flex;justify-content:space-between;align-items:flex-start;gap:0.5rem;';
      var title = document.createElement('strong');
      title.textContent = owner.getAttribute('data-composition-frame-label') || '';
      title.style.fontSize = '0.875rem';
      var shut = document.createElement('button');
      shut.type = 'button';
      shut.textContent = '\\u00d7';
      shut.setAttribute('aria-label', 'Close');
      shut.style.cssText = 'border:0;background:none;color:inherit;cursor:pointer;font-size:1rem;line-height:1;';
      shut.addEventListener('click', close);
      head.appendChild(title);
      head.appendChild(shut);
      panel.appendChild(head);
      var note = owner.getAttribute('data-boundary-note');
      if (note) {
        var p = document.createElement('p');
        p.textContent = note;
        p.style.cssText = 'margin:0.4rem 0 0;white-space:pre-line;opacity:0.85;';
        panel.appendChild(p);
      }
      var ids = (owner.getAttribute('data-boundary-members') || '').split(' ').filter(Boolean);
      if (ids.length) {
        var list = document.createElement('div');
        list.style.cssText = 'display:flex;flex-wrap:wrap;gap:0.3rem;margin-top:0.55rem;';
        ids.forEach(function (id) {
          var node = nodeFor(id);
          if (!node) return;
          var item = document.createElement('button');
          item.type = 'button';
          item.textContent = node.getAttribute('data-node-label') || id;
          item.setAttribute('data-boundary-member', id);
          item.style.cssText = 'border:1px solid var(--cloud-stroke);border-radius:999px;background:none;color:inherit;cursor:pointer;padding:0.15rem 0.55rem;font:inherit;';
          item.addEventListener('click', function (event) {
            event.stopPropagation();
            close();
            node.dispatchEvent(new MouseEvent('click', { bubbles: true }));
          });
          list.appendChild(item);
        });
        panel.appendChild(list);
      }
      panel.setAttribute('aria-label', title.textContent);
      panel.hidden = false;
    }
    function ownerOf(target) {
      if (!target || typeof target.closest !== 'function' || target.closest('[data-node-id]')) return null;
      return target.closest('[data-boundary-interactive]');
    }
    svg.addEventListener('click', function (event) {
      var owner = ownerOf(event.target);
      if (owner) open(owner);
    });
    svg.addEventListener('keydown', function (event) {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      var owner = ownerOf(event.target);
      if (!owner) return;
      event.preventDefault();
      open(owner);
    });
    document.addEventListener('click', function (event) {
      if (panel.hidden || panel.contains(event.target) || ownerOf(event.target)) return;
      close();
    });
    document.addEventListener('keydown', function (event) { if (event.key === 'Escape') close(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();`;

export function boundaryScript(boundaries) {
  return asArray(boundaries).some((boundary) => interactive(boundary).on)
    ? `\n      <script data-archify-fork="boundary-note">\n${BOUNDARY_SCRIPT}\n      </script>` : '';
}
