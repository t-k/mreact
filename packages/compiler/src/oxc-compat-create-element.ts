import { isEventLikePropName } from "@reckona/mreact-shared";
import type { AttributeIr, JsxNodeIr } from "./ir.js";
import { formatStatement } from "./oxc-bindings.js";
import { findOxcKeyCodeInChildren } from "./oxc-expression-utils.js";
import { readArray, readObject, readSource, unwrapOxcParentheses } from "./oxc-node-utils.js";

// Lowers statically analyzable react-compat createElement() call trees into
// the element IR so they compile through the server string pipeline instead
// of being interpreted per request. Any unsupported shape anywhere in a tree
// bails the WHOLE tree out (callers keep the source verbatim) so the
// interpreter semantics never get half-applied.

const COMPAT_CREATE_ELEMENT_SOURCES = new Set(["react", "@reckona/mreact-compat"]);
const COMPAT_RENDER_TO_STRING_SOURCES = new Set(["@reckona/mreact-compat"]);

export function collectCompatCreateElementNames(program: unknown): Set<string> {
  const names = new Set<string>();

  for (const statement of readArray(readObject(program).body)) {
    const declaration = readObject(statement);

    if (declaration.type !== "ImportDeclaration") {
      continue;
    }

    const source = readObject(declaration.source);

    if (typeof source.value !== "string" || !COMPAT_CREATE_ELEMENT_SOURCES.has(source.value)) {
      continue;
    }

    for (const specifier of readArray(declaration.specifiers)) {
      const specifierObject = readObject(specifier);

      if (specifierObject.type !== "ImportSpecifier") {
        continue;
      }

      const imported = readObject(specifierObject.imported);
      const local = readObject(specifierObject.local);

      if (imported.name === "createElement" && typeof local.name === "string") {
        names.add(local.name);
      }
    }
  }

  return names;
}

export function collectCompatRenderToStringNames(program: unknown): Set<string> {
  const names = new Set<string>();

  for (const statement of readArray(readObject(program).body)) {
    const declaration = readObject(statement);

    if (declaration.type !== "ImportDeclaration") {
      continue;
    }

    const source = readObject(declaration.source);

    if (typeof source.value !== "string" || !COMPAT_RENDER_TO_STRING_SOURCES.has(source.value)) {
      continue;
    }

    for (const specifier of readArray(declaration.specifiers)) {
      const specifierObject = readObject(specifier);

      if (specifierObject.type !== "ImportSpecifier") {
        continue;
      }

      const imported = readObject(specifierObject.imported);
      const local = readObject(specifierObject.local);

      if (imported.name === "renderToString" && typeof local.name === "string") {
        names.add(local.name);
      }
    }
  }

  return names;
}

// Mirrors packages/react-compat/src/server-render.ts attribute serialization
// for compile-time-known prop values. Keep these tables in sync with the
// interpreter; parity tests compare emitted bytes against renderToString.
const COMPAT_HTML_ATTRIBUTE_ALIASES: Record<string, string> = {
  acceptCharset: "accept-charset",
  autoFocus: "autofocus",
  autoPlay: "autoplay",
  charSet: "charset",
  className: "class",
  colSpan: "colspan",
  contentEditable: "contenteditable",
  crossOrigin: "crossorigin",
  encType: "enctype",
  formAction: "formaction",
  frameBorder: "frameborder",
  htmlFor: "for",
  httpEquiv: "http-equiv",
  maxLength: "maxlength",
  minLength: "minlength",
  noValidate: "novalidate",
  playsInline: "playsinline",
  rowSpan: "rowspan",
  spellCheck: "spellcheck",
  imageSrcSet: "imagesrcset",
  srcDoc: "srcdoc",
  srcSet: "srcset",
  tabIndex: "tabindex",
  useMap: "usemap",
};

const COMPAT_BOOLEANISH_STRING_ATTRIBUTES = new Set(["contenteditable", "draggable", "spellcheck"]);

// URL-bearing attributes always emit through the dynamic path so the runtime
// scheme guard applies; static literal lowering must not bypass it.
const URL_ATTRIBUTE_NAMES = new Set([
  "action",
  "formaction",
  "href",
  "src",
  "srcset",
  "xlink:href",
]);

const VALID_ATTRIBUTE_NAME = /^[A-Za-z_][\w.\-:]*$/;

interface CompatCreateElementScope {
  names: ReadonlySet<string>;
  shadowed: ReadonlySet<string>;
  localFunctionLikes?: ReadonlyMap<string, Record<string, unknown>> | undefined;
  inlinedLocalFunctions?: ReadonlySet<string> | undefined;
}

function isActiveCreateElementName(scope: CompatCreateElementScope, name: string): boolean {
  return scope.names.has(name) && !scope.shadowed.has(name);
}

function isBooleanishStringAttributeName(attributeName: string): boolean {
  const lowerCased = attributeName.toLowerCase();
  return lowerCased.startsWith("aria-") || COMPAT_BOOLEANISH_STRING_ATTRIBUTES.has(lowerCased);
}

function isDataAttributeName(attributeName: string): boolean {
  return attributeName.toLowerCase().startsWith("data-");
}

function readStaticPropertyKey(property: Record<string, unknown>): string | undefined {
  if (property.computed === true) {
    return undefined;
  }

  const key = readObject(property.key);

  if (key.type === "Identifier" && typeof key.name === "string") {
    return key.name;
  }

  if (key.type === "Literal" && typeof key.value === "string") {
    return key.value;
  }

  return undefined;
}

type StaticLiteral =
  | { kind: "value"; value: string | number | boolean | null }
  | { kind: "undefined" };

function readStaticLiteral(expression: Record<string, unknown>): StaticLiteral | undefined {
  if (expression.type === "Literal") {
    const value = expression.value;

    if (
      value === null ||
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      return { kind: "value", value };
    }

    return undefined;
  }

  if (expression.type === "Identifier" && expression.name === "undefined") {
    return { kind: "undefined" };
  }

  if (expression.type === "TemplateLiteral") {
    const expressions = readArray(expression.expressions);
    const quasis = readArray(expression.quasis);

    if (expressions.length === 0 && quasis.length === 1) {
      const cooked = readObject(readObject(quasis[0]).value).cooked;

      if (typeof cooked === "string") {
        return { kind: "value", value: cooked };
      }
    }
  }

  return undefined;
}

interface LoweredProps {
  attributes: AttributeIr[];
  keyCode?: string;
  childrenProp?: Record<string, unknown>;
}

function lowerCreateElementProps(
  code: string,
  propsArgument: Record<string, unknown> | undefined,
): LoweredProps | undefined {
  if (
    propsArgument === undefined ||
    (propsArgument.type === "Literal" && propsArgument.value === null) ||
    (propsArgument.type === "Identifier" && propsArgument.name === "undefined")
  ) {
    return { attributes: [] };
  }

  if (propsArgument.type !== "ObjectExpression") {
    return undefined;
  }

  const attributes: AttributeIr[] = [];
  let keyCode: string | undefined;
  let childrenProp: Record<string, unknown> | undefined;

  for (const property of readArray(propsArgument.properties)) {
    const propertyObject = readObject(property);

    if (
      propertyObject.type !== "Property" ||
      propertyObject.kind !== "init" ||
      propertyObject.method === true ||
      propertyObject.shorthand === true
    ) {
      return undefined;
    }

    const name = readStaticPropertyKey(propertyObject);

    if (name === undefined) {
      return undefined;
    }

    const value = unwrapOxcParentheses(readObject(propertyObject.value));

    if (name === "key") {
      keyCode = readSource(code, value);
      continue;
    }

    if (name === "ref" || isEventLikePropName(name)) {
      continue;
    }

    if (name === "children") {
      childrenProp = value;
      continue;
    }

    if (name === "dangerouslySetInnerHTML" || name === "suppressHydrationWarning") {
      return undefined;
    }

    if (name === "style") {
      const styleProp = lowerStyleProp(code, value);

      if (styleProp === undefined) {
        return undefined;
      }

      if (styleProp.attribute !== undefined) {
        attributes.push(styleProp.attribute);
      }
      continue;
    }

    const attributeName = COMPAT_HTML_ATTRIBUTE_ALIASES[name] ?? name;

    if (!VALID_ATTRIBUTE_NAME.test(attributeName) || isEventLikePropName(attributeName)) {
      // The interpreter drops these at runtime; keeping them out of the
      // compiled output matches its bytes.
      continue;
    }

    const literal = readStaticLiteral(value);

    if (literal === undefined || URL_ATTRIBUTE_NAMES.has(attributeName.toLowerCase())) {
      attributes.push({
        kind: "dynamic-attr",
        name: attributeName,
        code: readSource(code, value),
        serialization: "compat",
      });
      continue;
    }

    const staticAttribute = serializeStaticCompatAttribute(attributeName, literal);

    if (staticAttribute !== undefined) {
      attributes.push(staticAttribute);
    }
  }

  return {
    attributes,
    ...(keyCode === undefined ? {} : { keyCode }),
    ...(childrenProp === undefined ? {} : { childrenProp }),
  };
}

function serializeStaticCompatAttribute(
  attributeName: string,
  literal: StaticLiteral,
): AttributeIr | undefined {
  if (literal.kind === "undefined" || literal.value === null) {
    return undefined;
  }

  const value = literal.value;

  if (typeof value === "boolean") {
    if (isBooleanishStringAttributeName(attributeName) || isDataAttributeName(attributeName)) {
      return { kind: "static-attr", name: attributeName, value: value ? "true" : "false" };
    }

    return value ? { kind: "static-attr", name: attributeName, value: "" } : undefined;
  }

  return { kind: "static-attr", name: attributeName, value: String(value) };
}

// undefined bails the whole tree; { attribute: undefined } drops the prop.
function lowerStyleProp(
  code: string,
  value: Record<string, unknown>,
): { attribute?: AttributeIr } | undefined {
  if (value.type === "ObjectExpression") {
    for (const property of readArray(value.properties)) {
      const propertyObject = readObject(property);

      if (
        propertyObject.type !== "Property" ||
        propertyObject.kind !== "init" ||
        propertyObject.computed === true ||
        propertyObject.method === true ||
        readStaticPropertyKey(propertyObject) === undefined
      ) {
        return undefined;
      }
    }

    return {
      attribute: {
        kind: "dynamic-attr",
        name: "style",
        code: readSource(code, value),
        serialization: "compat",
      },
    };
  }

  // The interpreter's renderStyleAttribute only serializes objects; string
  // and other primitive style values are dropped, so match those bytes by
  // dropping them at compile time too.
  if (readStaticLiteral(value) !== undefined) {
    return {};
  }

  return {
    attribute: {
      kind: "dynamic-attr",
      name: "style",
      code: readSource(code, value),
      serialization: "compat",
    },
  };
}

export function analyzeCompatCreateElementRoot(
  code: string,
  expression: Record<string, unknown>,
  scope: CompatCreateElementScope,
): JsxNodeIr | undefined {
  return lowerCreateElementCall(code, unwrapOxcParentheses(expression), scope);
}

export function analyzeCompatCreateElementFunctionRoot(
  code: string,
  functionLike: Record<string, unknown>,
  names: ReadonlySet<string>,
  localFunctionLikes?: ReadonlyMap<string, Record<string, unknown>>,
  inlinedLocalFunctions: ReadonlySet<string> = new Set(),
): JsxNodeIr | undefined {
  if (names.size === 0) {
    return undefined;
  }

  const shadowed = collectFunctionShadowedNames(functionLike, names);
  const scope: CompatCreateElementScope = {
    names,
    shadowed,
    localFunctionLikes,
    inlinedLocalFunctions,
  };
  const body = unwrapOxcParentheses(readObject(functionLike.body));

  if (body.type !== "BlockStatement") {
    return lowerCreateElementCall(code, body, scope);
  }

  for (const statement of readArray(body.body)) {
    const statementObject = readObject(statement);

    if (statementObject.type !== "ReturnStatement") {
      continue;
    }

    return lowerCreateElementCall(
      code,
      unwrapOxcParentheses(readObject(statementObject.argument)),
      scope,
    );
  }

  return undefined;
}

function lowerCreateElementCall(
  code: string,
  expression: Record<string, unknown>,
  scope: CompatCreateElementScope,
): JsxNodeIr | undefined {
  if (expression.type !== "CallExpression" || expression.optional === true) {
    return undefined;
  }

  const callee = readObject(expression.callee);

  if (
    callee.type !== "Identifier" ||
    typeof callee.name !== "string" ||
    !isActiveCreateElementName(scope, callee.name)
  ) {
    return undefined;
  }

  const args = readArray(expression.arguments);

  if (args.length === 0) {
    return undefined;
  }

  for (const argument of args) {
    if (readObject(argument).type === "SpreadElement") {
      return undefined;
    }
  }

  const tagArgument = unwrapOxcParentheses(readObject(args[0]));

  if (tagArgument.type !== "Literal" || typeof tagArgument.value !== "string") {
    if (tagArgument.type === "Identifier" && typeof tagArgument.name === "string") {
      return lowerCreateElementLocalComponentCall(tagArgument.name, scope);
    }

    return undefined;
  }

  const props = lowerCreateElementProps(
    code,
    args.length > 1 ? unwrapOxcParentheses(readObject(args[1])) : undefined,
  );

  if (props === undefined) {
    return undefined;
  }

  const childArguments = args
    .slice(2)
    .map((argument) => unwrapOxcParentheses(readObject(argument)));
  const childSources =
    childArguments.length > 0
      ? childArguments
      : props.childrenProp === undefined
        ? []
        : [props.childrenProp];
  const children: JsxNodeIr[] = [];

  for (const child of childSources) {
    const lowered = lowerCreateElementChild(code, child, scope);

    if (lowered === undefined) {
      return undefined;
    }

    children.push(...lowered);
  }

  return {
    kind: "element",
    tagName: tagArgument.value,
    ...(props.keyCode === undefined ? {} : { keyCode: props.keyCode }),
    attributes: props.attributes,
    children,
  };
}

function lowerCreateElementLocalComponentCall(
  componentName: string,
  scope: CompatCreateElementScope,
): JsxNodeIr | undefined {
  if (scope.inlinedLocalFunctions?.has(componentName) === true) {
    return undefined;
  }

  return undefined;
}

function lowerCreateElementChild(
  code: string,
  child: Record<string, unknown>,
  scope: CompatCreateElementScope,
): JsxNodeIr[] | undefined {
  const literal = readStaticLiteral(child);

  if (literal !== undefined) {
    if (
      literal.kind === "undefined" ||
      literal.value === null ||
      typeof literal.value === "boolean"
    ) {
      return [];
    }

    return [{ kind: "text", value: String(literal.value) }];
  }

  if (child.type === "ArrayExpression") {
    const children: JsxNodeIr[] = [];

    for (const element of readArray(child.elements)) {
      const elementObject = readObject(element);

      if (elementObject.type === "SpreadElement") {
        return undefined;
      }

      const lowered = lowerCreateElementChild(code, unwrapOxcParentheses(elementObject), scope);

      if (lowered === undefined) {
        return undefined;
      }

      children.push(...lowered);
    }

    return children;
  }

  if (child.type === "CallExpression") {
    const callee = readObject(child.callee);

    if (
      callee.type === "Identifier" &&
      typeof callee.name === "string" &&
      isActiveCreateElementName(scope, callee.name)
    ) {
      const lowered = lowerCreateElementCall(code, child, scope);
      return lowered === undefined ? undefined : [lowered];
    }

    const list = lowerCreateElementListCall(code, child, scope);

    if (list !== undefined) {
      return [list];
    }
  }

  if (child.type === "ConditionalExpression") {
    const whenTrue = lowerCreateElementDynamicBranch(code, readObject(child.consequent), scope);
    const whenFalse = lowerCreateElementDynamicBranch(code, readObject(child.alternate), scope);

    if (whenTrue !== undefined && whenFalse !== undefined) {
      return [
        {
          kind: "conditional",
          conditionCode: readSource(code, readObject(child.test)),
          whenTrue,
          whenFalse,
        },
      ];
    }
  }

  if (child.type === "LogicalExpression" && child.operator === "&&") {
    const whenTrue = lowerCreateElementDynamicBranch(code, readObject(child.right), scope);

    if (whenTrue !== undefined) {
      const conditionValueName = logicalConditionValueName(readObject(child.left));

      return [
        {
          kind: "conditional",
          conditionCode: readSource(code, readObject(child.left)),
          conditionValueName,
          whenTrue,
          whenFalse: [
            {
              kind: "expr",
              code: renderableFalsyConditionValueCode(conditionValueName),
            },
          ],
        },
      ];
    }
  }

  // Provably-string expressions escape directly (and stay batchable); the
  // interpreter would emit the same escaped bytes for them.
  if (isProvablyStringExpression(child, scope)) {
    return [{ kind: "expr", code: readSource(code, child) }];
  }

  // Unknown expressions stay dynamic: the runtime helper escapes primitives
  // and falls back to the interpreter for element values, so children that
  // evaluate to react nodes keep rendering instead of stringifying.
  return [{ kind: "expr", code: readSource(code, child), renderMode: "compat-child" }];
}

function lowerCreateElementDynamicBranch(
  code: string,
  expression: Record<string, unknown>,
  scope: CompatCreateElementScope,
): JsxNodeIr[] | undefined {
  const unwrapped = unwrapOxcParentheses(expression);

  if (unwrapped.type === "Literal" && (unwrapped.value === null || unwrapped.value === false)) {
    return [];
  }

  return lowerCreateElementChild(code, unwrapped, scope);
}

function logicalConditionValueName(expression: Record<string, unknown>): string {
  return `__mreactLogical_${typeof expression.start === "number" ? expression.start : "value"}`;
}

function renderableFalsyConditionValueCode(name: string): string {
  return `((typeof ${name} === "number" || typeof ${name} === "bigint") ? ${name} : null)`;
}

function isProvablyStringExpression(
  expression: Record<string, unknown>,
  scope: CompatCreateElementScope,
): boolean {
  if (expression.type === "TemplateLiteral") {
    return true;
  }

  if (expression.type === "CallExpression" && expression.optional !== true) {
    const callee = readObject(expression.callee);

    return (
      callee.type === "Identifier" &&
      callee.name === "String" &&
      !scope.shadowed.has("String") &&
      readArray(expression.arguments).length === 1 &&
      readObject(readArray(expression.arguments)[0]).type !== "SpreadElement"
    );
  }

  if (expression.type === "BinaryExpression" && expression.operator === "+") {
    return (
      isProvablyStringExpression(unwrapOxcParentheses(readObject(expression.left)), scope) ||
      isProvablyStringExpression(unwrapOxcParentheses(readObject(expression.right)), scope)
    );
  }

  if (expression.type === "Literal") {
    return typeof expression.value === "string";
  }

  return false;
}

interface LoweredCreateElementListRenderer {
  children: JsxNodeIr[];
  bodyStatements: string[];
}

function lowerCreateElementListRenderer(
  code: string,
  body: Record<string, unknown>,
  scope: CompatCreateElementScope,
): LoweredCreateElementListRenderer | undefined {
  if (body.type !== "BlockStatement") {
    const rendered = lowerCreateElementCall(code, body, scope);
    return rendered === undefined || rendered.kind !== "element"
      ? undefined
      : { children: [rendered], bodyStatements: [] };
  }

  const statements = readArray(body.body);
  const ifStatementIndex = statements.findIndex(
    (statement) => readObject(statement).type === "IfStatement",
  );

  if (ifStatementIndex >= 0) {
    return lowerCreateElementListIfRenderer(code, statements, ifStatementIndex, scope);
  }

  const returnStatementIndex = statements.findIndex(
    (statement) => readObject(statement).type === "ReturnStatement",
  );

  if (returnStatementIndex < 0 || returnStatementIndex !== statements.length - 1) {
    return undefined;
  }

  const bodyPrefixStatements = statements.slice(0, returnStatementIndex);
  if (bodyPrefixStatements.some((statement) => !isSafeCreateElementListBodyStatement(statement))) {
    return undefined;
  }

  const rendered = lowerCreateElementCall(
    code,
    unwrapOxcParentheses(readObject(readObject(statements[returnStatementIndex]).argument)),
    scope,
  );
  return rendered === undefined || rendered.kind !== "element"
    ? undefined
    : {
        children: [rendered],
        bodyStatements: bodyPrefixStatements.map((statement) => formatStatement(code, statement)),
      };
}

function lowerCreateElementListIfRenderer(
  code: string,
  statements: readonly unknown[],
  ifStatementIndex: number,
  scope: CompatCreateElementScope,
): LoweredCreateElementListRenderer | undefined {
  const ifStatement = readObject(statements[ifStatementIndex]);
  const whenTrueExpression = readCreateElementBranchReturnExpression(ifStatement.consequent);
  const alternateExpression = readCreateElementBranchReturnExpression(ifStatement.alternate);
  const fallthroughExpression = readCreateElementBranchReturnExpression(
    statements[ifStatementIndex + 1],
  );
  const whenFalseExpression = alternateExpression ?? fallthroughExpression;
  const lastConsumedStatementIndex =
    alternateExpression === undefined ? ifStatementIndex + 1 : ifStatementIndex;

  if (
    whenTrueExpression === undefined ||
    whenFalseExpression === undefined ||
    lastConsumedStatementIndex !== statements.length - 1
  ) {
    return undefined;
  }

  const bodyPrefixStatements = statements.slice(0, ifStatementIndex);
  if (bodyPrefixStatements.some((statement) => !isSafeCreateElementListBodyStatement(statement))) {
    return undefined;
  }

  const whenTrue = lowerCreateElementDynamicBranch(code, whenTrueExpression, scope);
  const whenFalse = lowerCreateElementDynamicBranch(code, whenFalseExpression, scope);
  if (whenTrue === undefined || whenFalse === undefined) {
    return undefined;
  }

  return {
    bodyStatements: bodyPrefixStatements.map((statement) => formatStatement(code, statement)),
    children: [
      {
        kind: "conditional",
        conditionCode: readSource(code, readObject(ifStatement.test)),
        whenTrue,
        whenFalse,
      },
    ],
  };
}

function readCreateElementBranchReturnExpression(
  statement: unknown,
): Record<string, unknown> | undefined {
  const object = readObject(statement);

  if (object.type === "ReturnStatement") {
    return unwrapOxcParentheses(readObject(object.argument));
  }

  if (object.type !== "BlockStatement") {
    return undefined;
  }

  const statements = readArray(object.body);
  if (statements.length !== 1) {
    return undefined;
  }

  const returnStatement = readObject(statements[0]);
  return returnStatement.type === "ReturnStatement"
    ? unwrapOxcParentheses(readObject(returnStatement.argument))
    : undefined;
}

function lowerCreateElementListCall(
  code: string,
  expression: Record<string, unknown>,
  scope: CompatCreateElementScope,
): JsxNodeIr | undefined {
  if (expression.optional === true) {
    return undefined;
  }

  const callee = readObject(expression.callee);

  if (
    callee.type !== "MemberExpression" ||
    callee.computed === true ||
    callee.optional === true ||
    readObject(callee.property).name !== "map"
  ) {
    return undefined;
  }

  const args = readArray(expression.arguments);

  if (args.length !== 1) {
    return undefined;
  }

  const renderer = readObject(args[0]);

  if (renderer.type !== "ArrowFunctionExpression" || renderer.async === true) {
    return undefined;
  }

  const parameters = readArray(renderer.params).map((parameter) => readObject(parameter));

  if (parameters.some((parameter) => parameter.type !== "Identifier")) {
    return undefined;
  }

  const [itemName, indexName, arrayName] = parameters.map((parameter) =>
    typeof parameter.name === "string" ? parameter.name : undefined,
  );

  if (itemName === undefined) {
    return undefined;
  }

  const rendererScope: CompatCreateElementScope = {
    names: scope.names,
    shadowed: new Set([
      ...scope.shadowed,
      ...[itemName, indexName, arrayName].filter((name): name is string => name !== undefined),
    ]),
    localFunctionLikes: scope.localFunctionLikes,
    inlinedLocalFunctions: scope.inlinedLocalFunctions,
  };
  const rendererBody = lowerCreateElementListRenderer(
    code,
    unwrapOxcParentheses(readObject(renderer.body)),
    rendererScope,
  );

  if (rendererBody === undefined) {
    return undefined;
  }

  const keyCode = findOxcKeyCodeInChildren(rendererBody.children);

  return {
    kind: "list",
    itemsCode: readSource(code, readObject(callee.object)),
    itemName,
    ...(indexName === undefined ? {} : { indexName }),
    ...(arrayName === undefined ? {} : { arrayName }),
    ...(keyCode === undefined ? {} : { keyCode }),
    ...(rendererBody.bodyStatements.length === 0
      ? {}
      : { bodyStatements: rendererBody.bodyStatements }),
    children: rendererBody.children,
  };
}

function isSafeCreateElementListBodyStatement(statement: unknown): boolean {
  const object = readObject(statement);
  if (object.type !== "VariableDeclaration" || object.kind !== "const") {
    return false;
  }

  const declarations = readArray(object.declarations);
  if (declarations.length !== 1) {
    return false;
  }

  const declaration = readObject(declarations[0]);
  const id = readObject(declaration.id);
  if (id.type !== "Identifier" || declaration.init === null || declaration.init === undefined) {
    return false;
  }

  return isSideEffectFreeCreateElementListExpression(
    unwrapOxcParentheses(readObject(declaration.init)),
  );
}

function isSideEffectFreeCreateElementListExpression(expression: Record<string, unknown>): boolean {
  switch (expression.type) {
    case "Identifier":
    case "Literal":
    case "MetaProperty":
    case "ThisExpression":
      return true;
    case "TemplateLiteral":
      return readArray(expression.expressions).every((part) =>
        isSideEffectFreeCreateElementListExpression(unwrapOxcParentheses(readObject(part))),
      );
    case "MemberExpression":
      return (
        expression.computed !== true &&
        isSideEffectFreeCreateElementListExpression(
          unwrapOxcParentheses(readObject(expression.object)),
        )
      );
    case "UnaryExpression":
      return isSideEffectFreeCreateElementListExpression(
        unwrapOxcParentheses(readObject(expression.argument)),
      );
    case "BinaryExpression":
    case "LogicalExpression":
      return (
        isSideEffectFreeCreateElementListExpression(
          unwrapOxcParentheses(readObject(expression.left)),
        ) &&
        isSideEffectFreeCreateElementListExpression(
          unwrapOxcParentheses(readObject(expression.right)),
        )
      );
    case "ConditionalExpression":
      return (
        isSideEffectFreeCreateElementListExpression(
          unwrapOxcParentheses(readObject(expression.test)),
        ) &&
        isSideEffectFreeCreateElementListExpression(
          unwrapOxcParentheses(readObject(expression.consequent)),
        ) &&
        isSideEffectFreeCreateElementListExpression(
          unwrapOxcParentheses(readObject(expression.alternate)),
        )
      );
    case "CallExpression": {
      if (expression.optional === true) {
        return false;
      }

      const callee = unwrapOxcParentheses(readObject(expression.callee));
      return (
        callee.type === "Identifier" &&
        callee.name === "String" &&
        readArray(expression.arguments).length === 1 &&
        isSideEffectFreeCreateElementListExpression(
          unwrapOxcParentheses(readObject(readArray(expression.arguments)[0])),
        )
      );
    }
    default:
      return false;
  }
}

// Detection-side predicate: a direct `return createElement(...)` (or arrow
// implicit body) that the converter can fully lower. Detection and lowering
// share lowerCreateElementCall so they can never disagree.
export function hasLowerableCompatCreateElementReturn(
  code: string,
  functionLike: Record<string, unknown>,
  names: ReadonlySet<string>,
  localFunctionLikes?: ReadonlyMap<string, Record<string, unknown>>,
): boolean {
  return (
    analyzeCompatCreateElementFunctionRoot(code, functionLike, names, localFunctionLikes) !==
    undefined
  );
}

export function collectFunctionShadowedNames(
  functionLike: Record<string, unknown>,
  names: ReadonlySet<string>,
): Set<string> {
  const shadowed = new Set<string>();

  for (const parameter of readArray(functionLike.params)) {
    const parameterObject = readObject(parameter);

    if (parameterObject.type === "Identifier" && typeof parameterObject.name === "string") {
      if (names.has(parameterObject.name)) {
        shadowed.add(parameterObject.name);
      }
      continue;
    }

    // Destructured parameters could shadow anything; treat every tracked
    // name as shadowed rather than analyzing the pattern.
    for (const name of names) {
      shadowed.add(name);
    }
  }

  const body = readObject(functionLike.body);

  if (body.type !== "BlockStatement") {
    return shadowed;
  }

  for (const statement of readArray(body.body)) {
    const statementObject = readObject(statement);

    if (statementObject.type === "VariableDeclaration") {
      for (const declarator of readArray(statementObject.declarations)) {
        const id = readObject(readObject(declarator).id);

        if (id.type === "Identifier" && typeof id.name === "string" && names.has(id.name)) {
          shadowed.add(id.name);
        }
      }
    }

    if (
      statementObject.type === "FunctionDeclaration" &&
      typeof readObject(statementObject.id).name === "string" &&
      names.has(readObject(statementObject.id).name as string)
    ) {
      shadowed.add(readObject(statementObject.id).name as string);
    }
  }

  return shadowed;
}
