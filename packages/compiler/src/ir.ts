export interface ModuleIr {
  userImports: string[];
  moduleStatements: string[];
  components: ComponentIr[];
}

export interface ComponentIr {
  name: string;
  exportName: string;
  parameters: string[];
  bodyStatements: string[];
  bindingNames: string[];
  root: JsxNodeIr;
}

export type JsxNodeIr =
  | JsxElementIr
  | JsxFragmentIr
  | TextIr
  | ExprIr
  | AsyncBoundaryIr;

export interface JsxElementIr {
  kind: "element";
  tagName: string;
  attributes: AttributeIr[];
  children: JsxNodeIr[];
}

export interface JsxFragmentIr {
  kind: "fragment";
  children: JsxNodeIr[];
}

export interface TextIr {
  kind: "text";
  value: string;
}

export interface ExprIr {
  kind: "expr";
  code: string;
}

export interface AsyncBoundaryIr {
  kind: "async-boundary";
  valueCode: string;
  valueName: string;
  children: JsxNodeIr[];
  placeholderChildren?: JsxNodeIr[];
  catchName?: string;
  catchChildren?: JsxNodeIr[];
}

export type AttributeIr =
  | StaticAttributeIr
  | DynamicAttributeIr
  | EventAttributeIr;

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
