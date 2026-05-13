// Shared text for the `_escapeHtml` helper emitted into compiled
// server-mode JS (both `emit-server.ts` and `emit-server-stream.ts`).
//
// Issue 088: the previous chain of four `String.prototype.replaceAll`
// calls scanned the entire input four times even when no escape
// character was present. On the hot path (numeric / short strings
// passed through `_escapeHtml`) it cost ~115 ns per call and
// dominated the per-request budget at N=5000 (≈58 % of total).
//
// The replacement is the well-known `escape-html` library shape that
// Marko's compiled output uses: one regex test, return the input
// unchanged when nothing needs escaping, otherwise a forward char-scan
// from the first match. On the same inputs it costs 4-11 ns per call.
//
// We only escape `& < > "` -- matching the previous implementation
// exactly. `'` is intentionally not escaped because every attribute
// the compiler emits uses double quotes, so a single quote inside an
// attribute value is safe.

export function emitEscapeHtmlHelper(name: string): string {
  return [
    `function ${name}(value) {`,
    `  const _str = "" + (value ?? "");`,
    `  const _match = /["&<>]/.exec(_str);`,
    `  if (_match === null) return _str;`,
    `  let _html = "";`,
    `  let _last = 0;`,
    `  let _i = _match.index;`,
    `  for (; _i < _str.length; _i++) {`,
    `    let _esc;`,
    `    switch (_str.charCodeAt(_i)) {`,
    `      case 34: _esc = "&quot;"; break;`,
    `      case 38: _esc = "&amp;"; break;`,
    `      case 60: _esc = "&lt;"; break;`,
    `      case 62: _esc = "&gt;"; break;`,
    `      default: continue;`,
    `    }`,
    `    if (_last !== _i) _html += _str.substring(_last, _i);`,
    `    _last = _i + 1;`,
    `    _html += _esc;`,
    `  }`,
    `  return _last !== _i ? _html + _str.substring(_last, _i) : _html;`,
    `}`,
  ].join("\n");
}
