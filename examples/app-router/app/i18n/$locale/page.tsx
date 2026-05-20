// /i18n/$locale — the same demo as /i18n, but the locale is forced
// via the URL segment. `params.locale` is the matched value.
//
// We don't call `detectLocale` here because that helper inspects the
// **first** URL segment for a locale (the canonical `/ja/...` shape),
// not a nested `/<namespace>/<locale>` structure. With an
// `/<locale>/<rest>` URL root scheme, `detectLocale(request, ...)`
// would work directly — see the route's body for the link.
//
// `notFound()` triggers when the prefix is not in the supported set.
import { notFound } from "@reckona/mreact-router";
import type { LoaderContext } from "@reckona/mreact-router";
import {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  messages,
  type Locale,
} from "../messages.js";

interface I18nData {
  locale: Locale;
  acceptLanguage: string;
}

export async function loader(context: LoaderContext<{ locale: string }>): Promise<I18nData> {
  if (!SUPPORTED_LOCALES.includes(context.params.locale as Locale)) {
    notFound();
  }
  return {
    locale: context.params.locale as Locale,
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
        <dt>{t.sourceLabel}</dt><dd><code>params.locale</code></dd>
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
        For a canonical <code>/&lt;locale&gt;/&lt;rest&gt;</code> URL
        scheme (where the locale is the very first path segment), call{" "}
        <code>detectLocale(request, …)</code> from a root-level layout
        or middleware instead — it will pick the locale from the path
        prefix automatically.
      </p>
    </main>
  );
}
