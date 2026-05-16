# @reckona/mreact-shared

`@reckona/mreact-shared` provides small security-sensitive helpers shared by
mreact runtime, compiler, server, and compatibility packages.

## HTML Escaping

```ts
import {
  escapeHtmlAttribute,
  escapeHtmlQuotedAttribute,
  escapeHtmlText,
} from "@reckona/mreact-shared/html-escape";

escapeHtmlText("<span>");
escapeHtmlAttribute('"title"');
escapeHtmlQuotedAttribute('"quoted"');
```

## URL Safety

```ts
import {
  isDangerousHtmlAttribute,
  isUnsafeUrlAttribute,
  safeUrlAttributeValue,
} from "@reckona/mreact-shared/url-safety";

safeUrlAttributeValue("href", "/docs");
isUnsafeUrlAttribute("href", "javascript:alert(1)");
isDangerousHtmlAttribute("srcdoc");
```

These APIs are intended for framework internals and generated runtime code.
