import type { SourceLocation } from "./types.js";

/** Represents the compiler intermediate representation for one module. */
export interface ModuleIr {
  userImports: string[];
  moduleStatements: string[];
  moduleBindingNames: string[];
  components: ComponentIr[];
}

/** Represents one component discovered and lowered by compiler analysis. */
export interface ComponentIr {
  name: string;
  exportName: string;
  exported?: boolean;
  exportDefault?: boolean;
  async?: boolean;
  parameters: string[];
  parameterPropAliases?: PropAliasIr[];
  bodyStatements: string[];
  bindingNames: string[];
  root: JsxNodeIr;
}

/** Represents a plain object destructuring alias from a component parameter. */
export interface PropAliasIr {
  propName: string;
  localName: string;
}

/** Represents any JSX node shape supported by the compiler intermediate representation. */
export type JsxNodeIr =
  | JsxElementIr
  | ComponentRefIr
  | JsxFragmentIr
  | ConditionalIr
  | ListIr
  | TextIr
  | ExprIr
  | AsyncBoundaryIr;

/** Represents a lowered intrinsic JSX element. */
export interface JsxElementIr {
  kind: "element";
  tagName: string;
  keyCode?: string;
  attributes: AttributeIr[];
  children: JsxNodeIr[];
}

/** Represents a lowered component reference and its props, children, and boundary metadata. */
export interface ComponentRefIr {
  kind: "component";
  name: string;
  loc?: SourceLocation;
  runtime?: "compat";
  async?: boolean;
  clientReference?: ClientReferenceIr;
  keyCode?: string;
  props: ComponentPropIr[];
  children: JsxNodeIr[];
}

/** Represents a client module reference attached to a component in server output. */
export interface ClientReferenceIr {
  moduleId: string;
  exportName: string;
  ssrFallback?: boolean;
}

/** Represents any prop shape supported by a component reference. */
export type ComponentPropIr = ComponentNamedPropIr | ComponentRenderPropIr | ComponentSpreadPropIr;

/** Represents a named component prop with expression code. */
export interface ComponentNamedPropIr {
  kind: "prop";
  name: string;
  code: string;
}

/** Represents a render-prop child lowered into the component prop list. */
export interface ComponentRenderPropIr {
  kind: "render-prop";
  name: string;
  valueName?: string;
  children: JsxNodeIr[];
}

/** Represents a spread prop expression passed to a component reference. */
export interface ComponentSpreadPropIr {
  kind: "spread-prop";
  code: string;
}

/** Represents a JSX fragment and its lowered children. */
export interface JsxFragmentIr {
  kind: "fragment";
  bodyStatements?: string[];
  children: JsxNodeIr[];
}

/** Represents a conditional JSX expression with true and false branches. */
export interface ConditionalIr {
  kind: "conditional";
  conditionCode: string;
  conditionValueName?: string;
  whenTrue: JsxNodeIr[];
  whenFalse: JsxNodeIr[];
}

/** Represents a JSX list rendering expression and its lowered item body. */
export interface ListIr {
  kind: "list";
  itemsCode: string;
  itemName: string;
  indexName?: string;
  arrayName?: string;
  parameterPatterns?: string[];
  keyCode?: string;
  bodyStatements?: string[];
  children: JsxNodeIr[];
  compiledSingleNode?: CompiledSingleNodeListIr;
}

/** Describes a conservatively eligible compiler keyed single-node list. */
export interface CompiledSingleNodeListIr {
  root: JsxElementIr;
  eventPrograms?: CompilerKeyedEventProgramIr[];
  ownsTextCleanup?: true;
  selectedClass?: CompilerSelectedClassIr;
}

/** Describes one list-owned delegated event program and its row slots. */
export interface CompilerKeyedEventProgramIr {
  eventName: string;
  handlers: string[];
}

/** Describes an exact whole-class selection expression owned by a keyed list. */
export interface CompilerSelectedClassIr {
  className: string;
  sourceCode: string;
}

/** Represents static text emitted from JSX. */
export interface TextIr {
  kind: "text";
  value: string;
}

/** Represents a dynamic expression emitted from JSX. */
export interface ExprIr {
  kind: "expr";
  code: string;
  compilerKeyedProperty?: string;
  renderMode?:
    | "dynamic"
    | "html"
    | "react-node"
    | "stream-node"
    | "compat-child"
    | "compiler-keyed-initial-text"
    | "compiler-keyed-cell-text"
    | "compiler-keyed-text";
}

/** Represents an async boundary lowered from an Await-style JSX construct. */
export interface AsyncBoundaryIr {
  kind: "async-boundary";
  loc?: SourceLocation;
  valueCode: string;
  valueName: string;
  children: JsxNodeIr[];
  placeholderChildren?: JsxNodeIr[];
  placeholderTagCode?: string;
  catchName?: string;
  catchChildren?: JsxNodeIr[];
  awaitId?: string;
}

/** Represents any intrinsic attribute shape supported by the compiler IR. */
export type AttributeIr =
  | StaticAttributeIr
  | DynamicAttributeIr
  | DomRefAttributeIr
  | EventAttributeIr
  | SpreadAttributeIr;

/** Represents a static intrinsic attribute. */
export interface StaticAttributeIr {
  kind: "static-attr";
  name: string;
  value: string;
}

/** Represents a dynamic intrinsic attribute expression. */
export interface DynamicAttributeIr {
  kind: "dynamic-attr";
  name: string;
  code: string;
  // "compat" applies react-compat serialization semantics (px suffix for
  // numeric style values, interpreter-equivalent filtering).
  serialization?: "compat";
}

/** Represents a post-commit callback for an intrinsic DOM element. */
export interface DomRefAttributeIr {
  kind: "dom-ref";
  name: "domRef";
  code: string;
  serialization?: never;
}

/** Represents an event handler attribute emitted for client hydration. */
export interface EventAttributeIr {
  kind: "event";
  name: string;
  eventName: string;
  code: string;
  compilerKeyedSlot?: number;
}

/** Represents a spread attribute expression on an intrinsic element. */
export interface SpreadAttributeIr {
  kind: "spread-attr";
  code: string;
}
