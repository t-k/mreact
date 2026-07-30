// GENERATED from main.tsx by the mreact compiler in production compat mode.
// Source of truth is main.tsx; run pnpm bench:js-framework:generate-compat after compiler changes.
import { jsx as _jsx, REACTIVE_STATE_BINDING_META as _REACTIVE_STATE_BINDING_META, createReactiveDomBlock as _createReactiveDomBlock } from "@reckona/mreact-compat/jsx-runtime";
import { bindCompilerKeyedSingleNodeList as _bindCompilerKeyedSingleNodeList } from "@reckona/mreact-reactive-dom/internal";
import { bindEvent as _bindEvent, effect as _effect } from "@reckona/mreact-reactive-dom";
import { createRoot, flushSync, memo, useReducer } from "@reckona/mreact-compat";
const adjectives = [
	"pretty",
	"large",
	"big",
	"small",
	"tall",
	"short",
	"long",
	"handsome",
	"plain",
	"quaint",
	"clean",
	"elegant",
	"easy",
	"angry",
	"crazy",
	"helpful",
	"mushy",
	"odd",
	"unsightly",
	"adorable",
	"important",
	"inexpensive",
	"cheap",
	"expensive",
	"fancy"
];
const colors = [
	"red",
	"yellow",
	"blue",
	"green",
	"pink",
	"brown",
	"purple",
	"brown",
	"white",
	"black",
	"orange"
];
const nouns = [
	"table",
	"chair",
	"house",
	"bbq",
	"desk",
	"car",
	"pony",
	"cookie",
	"sandwich",
	"burger",
	"pizza",
	"mouse",
	"keyboard"
];
let nextId = 1;
let dispatchApp;
function random(max) {
	return Math.round(Math.random() * 1e3) % max;
}
function buildData(count) {
	const rows = [];
	rows.length = count;
	for (let index = 0; index < count; index += 1) {
		rows[index] = {
			id: nextId,
			label: `${adjectives[random(adjectives.length)]} ${colors[random(colors.length)]} ${nouns[random(nouns.length)]}`
		};
		nextId += 1;
	}
	return rows;
}
function updateEveryTenth(rows) {
	const next = rows.slice(0);
	for (let index = 0; index < next.length; index += 10) {
		const row = next[index];
		if (row !== undefined) {
			next[index] = {
				id: row.id,
				label: `${row.label} !!!`
			};
		}
	}
	return next;
}
function swapRows(rows) {
	if (rows.length <= 998) {
		return rows;
	}
	const next = [...rows];
	const second = next[1];
	const nineHundredNinetyNinth = next[998];
	if (second === undefined || nineHundredNinetyNinth === undefined) {
		return rows;
	}
	next[1] = nineHundredNinetyNinth;
	next[998] = second;
	return next;
}
function reduceAppState(state, action) {
	switch (action.type) {
		case "run": return {
			rows: buildData(action.count),
			selected: null
		};
		case "add": return {
			rows: [...state.rows, ...buildData(1e3)],
			selected: state.selected
		};
		case "update": return {
			rows: updateEveryTenth(state.rows),
			selected: state.selected
		};
		case "clear": return {
			rows: [],
			selected: null
		};
		case "swap": return {
			rows: swapRows(state.rows),
			selected: state.selected
		};
		case "remove": return {
			rows: state.rows.filter((row) => row.id !== action.id),
			selected: state.selected
		};
		case "select": return {
			rows: state.rows,
			selected: action.id
		};
	}
}
function dispatchBenchAction(action) {
	flushSync(() => {
		dispatchApp?.(action);
	});
}
function setData(count) {
	dispatchBenchAction({
		type: "run",
		count
	});
}
function addRows() {
	dispatchBenchAction({ type: "add" });
}
function updateRows() {
	dispatchBenchAction({ type: "update" });
}
function clearRows() {
	dispatchBenchAction({ type: "clear" });
}
function swapRowsAtBenchPositions() {
	dispatchBenchAction({ type: "swap" });
}
function removeRow(id) {
	dispatchBenchAction({
		type: "remove",
		id
	});
}
function selectRow(id) {
	dispatchBenchAction({
		type: "select",
		id
	});
}
function requireElement(id) {
	const element = document.getElementById(id);
	if (element === null) {
		throw new Error(`Missing #${id}`);
	}
	return element;
}
const RowMemo = memo(Row, (previous, next) => previous.selected === next.selected && previous.row === next.row);
RowMemo.__mreactMemoCompareProps = ["selected", "row"];
const root = createRoot(requireElement("tbody"));
flushSync(() => {
	root.render(/* @__PURE__ */ _jsx(App, {}));
});
requireElement("run").addEventListener("click", () => setData(1e3));
requireElement("runlots").addEventListener("click", () => setData(1e4));
requireElement("add").addEventListener("click", addRows);
requireElement("update").addEventListener("click", updateRows);
requireElement("clear").addEventListener("click", clearRows);
requireElement("swaprows").addEventListener("click", swapRowsAtBenchPositions);

function Row(props) {
  return _createReactiveDomBlock((props) => {
    const _tr = document.createElement("tr");
    const _td = document.createElement("td");
    _td.className = "col-md-1";
    const _text = document.createTextNode("");
    _td.appendChild(_text);
    _tr.appendChild(_td);
    const _td$1 = document.createElement("td");
    _td$1.className = "col-md-4";
    const _a = document.createElement("a");
    const _text$1 = document.createTextNode("");
    _a.appendChild(_text$1);
    _td$1.appendChild(_a);
    _tr.appendChild(_td$1);
    const _td$2 = document.createElement("td");
    _td$2.className = "col-md-1";
    const _a$1 = document.createElement("a");
    const _span = document.createElement("span");
    _span.setAttribute("aria-hidden", "true");
    _span.className = "glyphicon glyphicon-remove";
    _a$1.appendChild(_span);
    _td$2.appendChild(_a$1);
    _tr.appendChild(_td$2);
    const _td$3 = document.createElement("td");
    _td$3.className = "col-md-6";
    _tr.appendChild(_td$3);
    const _disposeEvent = _bindEvent(_a, "click", (event) => {
      return (selectRow(props.row.id));
    });
    const _disposeEvent$1 = _bindEvent(_a$1, "click", (event$1) => {
      return (removeRow(props.row.id));
    });
    const _disposeEffect = _effect(() => {
          const _r = (props.selected ? "danger" : "");
      const _v = _r == null ? "" : String(_r);
      if (_tr.className !== _v) _tr.className = _v;
    });
    const _disposeEffect$1 = _effect(() => {
          const _r$1 = (props.row.id);
      const _v$1 = _r$1 == null ? "" : String(_r$1);
      if (_text.data !== _v$1) _text.data = _v$1;
          const _r$2 = (props.row.label);
      const _v$2 = _r$2 == null ? "" : String(_r$2);
      if (_text$1.data !== _v$2) _text$1.data = _v$2;
    });
    const _dispose = () => {
      _disposeEvent();
      _disposeEvent$1();
      _disposeEffect();
      _disposeEffect$1();
    };
    return { node: _tr, dispose: _dispose };
  }, props);
}
Row.__mreactStaticBlock = true;

export function App() {
  const _stateStateTuple = useReducer(reduceAppState, {
	rows: [],
	selected: null
});
  const [state, dispatch] = _stateStateTuple;
  const _stateStateBinding = _stateStateTuple[_REACTIVE_STATE_BINDING_META];
  dispatchApp = dispatch;
  return _createReactiveDomBlock(() => {
    const _marker = document.createTextNode("");
    let _disposeList;
    const _setupList = () => {
      if (_disposeList !== undefined || _marker.parentNode === null) return;
      _disposeList = _bindCompilerKeyedSingleNodeList(_marker.parentNode, _marker, () => (_stateStateBinding.get().rows), (_rowContext) => (() => {
  const props = { get row() { return (_rowContext.item); } };
  const _tr = document.createElement("tr");
  const _td = document.createElement("td");
  _td.className = "col-md-1";
  const _text = document.createTextNode("");
  _td.appendChild(_text);
  _tr.appendChild(_td);
  const _td$1 = document.createElement("td");
  _td$1.className = "col-md-4";
  const _a = document.createElement("a");
  const _text$1 = document.createTextNode("");
  _a.appendChild(_text$1);
  _td$1.appendChild(_a);
  _tr.appendChild(_td$1);
  const _td$2 = document.createElement("td");
  _td$2.className = "col-md-1";
  const _a$1 = document.createElement("a");
  const _span = document.createElement("span");
  _span.setAttribute("aria-hidden", "true");
  _span.className = "glyphicon glyphicon-remove";
  _a$1.appendChild(_span);
  _td$2.appendChild(_a$1);
  _tr.appendChild(_td$2);
  const _td$3 = document.createElement("td");
  _td$3.className = "col-md-6";
  _tr.appendChild(_td$3);
  const _disposeEvent = _bindEvent(_a, "click", (event) => {
    return (selectRow(props.row.id));
  });
  const _disposeEvent$1 = _bindEvent(_a$1, "click", (event$1) => {
    return (removeRow(props.row.id));
  });
  const _disposeEffect = _effect(() => {
        const _r = (props.row.id);
      const _v = _r == null ? "" : String(_r);
      if (_text.data !== _v) _text.data = _v;
        const _r$1 = (props.row.label);
      const _v$1 = _r$1 == null ? "" : String(_r$1);
      if (_text$1.data !== _v$1) _text$1.data = _v$1;
  });
  return _tr;
})(), { key: (row) => (row.id), selectedClass: { className: "danger", source: { get: () => _stateStateBinding.get().selected } } });
    };
    const _dispose = () => {
      if (_disposeList !== undefined) _disposeList();
    };
    return { node: _marker, dispose: _dispose, afterCommit: _setupList };
  });
}
