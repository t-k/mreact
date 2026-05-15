// Typed message bundles. `defineMessages` returns the input verbatim
// but locks the type so accessing `messages.en.heading` is typed and
// missing keys surface as a TypeScript error rather than `undefined`
// at runtime.
import { defineMessages } from "@reckona/mreact-router";

export type Locale = "en" | "ja" | "fr";

export const DEFAULT_LOCALE: Locale = "en";
export const SUPPORTED_LOCALES: readonly Locale[] = ["en", "ja", "fr"];

export const messages = defineMessages({
  en: {
    heading: "Locale detection",
    welcome: "Hello!",
    info: "The page chose this locale based on either the URL prefix (e.g. /i18n/ja) or the browser's Accept-Language header.",
    sourceLabel: "Detection source",
    switch: "Switch locale",
  },
  ja: {
    heading: "ロケール検出",
    welcome: "こんにちは！",
    info: "このページは URL の prefix (例: /i18n/ja) かブラウザの Accept-Language ヘッダから locale を選びました。",
    sourceLabel: "検出ソース",
    switch: "言語を切り替え",
  },
  fr: {
    heading: "Détection de locale",
    welcome: "Bonjour !",
    info: "La page a choisi cette locale soit depuis le préfixe d'URL (par ex. /i18n/fr), soit depuis l'en-tête Accept-Language du navigateur.",
    sourceLabel: "Source de détection",
    switch: "Changer de langue",
  },
});
