// Fork extension (superego18/archify dev_chanju): node notes in the Semantic Passport.
// The viewer template stays untouched; diagrams that use `note` carry their own
// small script, so diagrams without notes keep their exact bytes.
import { esc } from '../shared/utils.mjs';

export function nodeNoteAttr(component) {
  const note = typeof component?.note === 'string' ? component.note.trim() : '';
  return note ? ` data-node-note="${esc(note)}"` : '';
}

// Shows the focused node's note under the passport detail line. The passport
// writes the focused id into #focus-id, so observing it needs no viewer hook.
const NOTE_SCRIPT = `(function () {
  function start() {
    var id = document.getElementById('focus-id');
    var detail = document.getElementById('focus-detail');
    if (!id || !detail || document.getElementById('focus-note')) return;
    var note = document.createElement('span');
    note.id = 'focus-note';
    note.className = 'semantic-passport-detail';
    note.setAttribute('data-passport', 'note');
    note.style.whiteSpace = 'pre-line';
    note.hidden = true;
    detail.insertAdjacentElement('afterend', note);
    function sync() {
      var key = id.hidden ? '' : id.textContent;
      var node = key ? document.querySelector('g[data-node-id="' + CSS.escape(key) + '"]') : null;
      var text = node ? node.getAttribute('data-node-note') || '' : '';
      note.textContent = text;
      note.hidden = !text;
    }
    new MutationObserver(sync).observe(id, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
    sync();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();`;

export function nodeNoteScript(components) {
  const used = [...components].some((component) => nodeNoteAttr(component));
  return used ? `\n      <script data-archify-fork="node-note">\n${NOTE_SCRIPT}\n      </script>` : '';
}
