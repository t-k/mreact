import type { SourceLocation } from "./types.js";

export interface ModuleIr {
  userImports: string[];
  moduleStatements: string[];
  moduleBindingNames: string[];
  components: ComponentIr[];
}

export interface ComponentIr {
  name: string;
  exportName: string;
  exported?: boolean;
  exportDefault?: boolean;
  async?: boolean;
  parameters: string[];
  bodyStatements: string[];
  bindingNames: string[];
  root: JsxNodeIr;
}

export type JsxNodeIr =
  | JsxElementIr
  | ComponentRefIr
  | JsxFragmentIr
  | ConditionalIr
  | ListIr
  | TextIr
  | ExprIr
  | AsyncBoundaryIr;

export interface JsxElementIr {
  kind: "element";
  tagName: string;
  keyCode?: string;
  attributes: AttributeIr[];
  children: JsxNodeIr[];
}

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

export interface ClientReferenceIr {
  moduleId: string;
  exportName: string;
  ssrFallback?: boolean;
}

export type ComponentPropIr = ComponentNamedPropIr | ComponentRenderPropIr | ComponentSpreadPropIr;

export interface ComponentNamedPropIr {
  kind: "prop";
  name: string;
  code: string;
}

export interface ComponentRenderPropIr {
  kind: "render-prop";
  name: string;
  valueName?: string;
  children: JsxNodeIr[];
}

export interface ComponentSpreadPropIr {
  kind: "spread-prop";
  code: string;
}

export interface JsxFragmentIr {
  kind: "fragment";
  bodyStatements?: string[];
  children: JsxNodeIr[];
}

export interface ConditionalIr {
  kind: "conditional";
  conditionCode: string;
  conditionValueName?: string;
  whenTrue: JsxNodeIr[];
  whenFalse: JsxNodeIr[];
}

export interface ListIr {
  kind: "list";
  itemsCode: string;
  itemName: string;
  indexName?: string;
  arrayName?: string;
  keyCode?: string;
  bodyStatements?: string[];
  children: JsxNodeIr[];
}

export interface TextIr {
  kind: "text";
  value: string;
}

export interface ExprIr {
  kind: "expr";
  code: string;
  renderMode?: "dynamic" | "html" | "react-node" | "stream-node";
}

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

export type AttributeIr =
  | StaticAttributeIr
  | DynamicAttributeIr
  | EventAttributeIr
  | SpreadAttributeIr;

export interface StaticAttributeIr {
  kind: "static-attr";
  name: string;
  value: string;
}

export interface DynamicAttributeIr {
  kind: "dynamic-attr";
  name: string;
  code: string;
}

export interface EventAttributeIr {
  kind: "event";
  name: string;
  eventName: string;
  code: string;
}

export interface SpreadAttributeIr {
  kind: "spread-attr";
  code: string;
}
