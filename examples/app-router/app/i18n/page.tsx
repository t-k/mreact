// /i18n — locale detection demo.
//
// `detectLocale(request, { defaultLocale, locales })` picks a locale
// for the request in this order:
//   1. URL path prefix (e.g. /i18n/ja matches "ja" if "ja" is in
//      `locales`). The remaining path is returned in `pathname`.
//   2. The `Accept-Language` header, weighted by `q=` (highest q wins,
//      with a fall back from "fr-CA" to "fr").
//   3. `defaultLocale`.
//
// `defineMessages(...)` is a typed-bundle helper in
// `app/i18n/messages.ts` — purely a type alias plus runtime
// pass-through. Accessing `messages[locale].key` is strongly typed.
import { detectLocale } from "@reckona/mreact-router";
import {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  messages,
  type Locale,
} from "./messages.js";

export const metadata = {
  title: "i18n — mreact App Router",
  description: "Locale detection and typed message bundles.",
};

interface LoaderContext {
  request: Request;
}

interface I18nData {
  locale: Locale;
  pathname: string;
  source: "accept-language" | "default" | "path";
  acceptLanguage: string;
}

export async function loader(context: LoaderContext): Promise<I18nData> {
  const detected = detectLocale<Locale>(context.request, {
    defaultLocale: DEFAULT_LOCALE,
    locales: SUPPORTED_LOCALES,
  });
  return {
    locale: detected.locale,
    pathname: detected.pathname,
    source: detected.source,
    acceptLanguage: context.request.headers.get("accept-language") ?? "(none)",
  };
}

export default function Page(props: { data: I18nData }) {
  const t = messages[props.data.locale];
  return (
    <main>
      <h1>{t.heading}</h1>
      <p><strong>{t.welcome}</strong></p>
      <p>{t.info}</p>
      <dl class="kv">
        <dt>locale</dt><dd><code>{props.data.locale}</code></dd>
        <dt>{t.sourceLabel}</dt><dd><code>{props.data.source}</code></dd>
        <dt>rewritten pathname</dt><dd><code>{props.data.pathname}</code></dd>
        <dt>Accept-Language</dt><dd><code>{props.data.acceptLanguage}</code></dd>
      </dl>
      <p>
        {t.switch}:{" "}
        {SUPPORTED_LOCALES.map((locale) => (
          <span key={locale}>
            <a href={locale === DEFAULT_LOCALE ? "/i18n" : `/i18n/${locale}`}>
              <code>{locale}</code>
            </a>
            {" "}
          </span>
        ))}
      </p>
      <p class="muted">
        Try <code>curl -H 'accept-language: ja,en;q=0.5' http://localhost:3001/i18n</code>{" "}
        — the page picks <code>ja</code> with{" "}
        <code>source: "accept-language"</code>. With no header it falls
        back to <code>en</code>.
      </p>
    </main>
  );
}
