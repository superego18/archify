// Fork extension (superego18/archify dev_chanju): turn off single-key shortcuts.
// `"shortcuts": false` stops the viewer's letter and symbol shortcuts (T theme,
// S style, E export, /, ?, +, -, 0 ...) before the viewer sees them, and hides
// their hints. Escape, Enter and arrow keys keep working. Typing inside any
// field, including fields in shadow DOM widgets, is never touched. Diagrams
// that leave shortcuts on keep their exact bytes.
const SHORTCUT_SCRIPT = `(function () {
  function editable(event) {
    var origin = event.composedPath ? event.composedPath()[0] : event.target;
    return !!origin && (origin.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(origin.tagName || ''));
  }
  window.addEventListener('keydown', function (event) {
    if (event.metaKey || event.ctrlKey || event.altKey || editable(event)) return;
    if (event.key && event.key.length === 1 && event.key !== ' ') event.preventDefault();
  }, true);
  var style = document.createElement('style');
  style.textContent = '.diagram-guide-shortcuts,.preset-menu-shortcut{display:none !important}';
  document.head.appendChild(style);
  document.querySelectorAll('[aria-keyshortcuts]').forEach(function (element) { element.removeAttribute('aria-keyshortcuts'); });
})();`;

export function shortcutScript(arch) {
  return arch.shortcuts === false ? `\n      <script data-archify-fork="shortcuts">\n${SHORTCUT_SCRIPT}\n      </script>` : '';
}
