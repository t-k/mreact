const { default: worker } = await import("../dist/worker.mjs");

const seenAssetPaths = [];
const env = {
  ASSETS: {
    fetch(request) {
      seenAssetPaths.push(new URL(request.url).pathname);
      return new Response("body{color:#111}", {
        headers: { "content-type": "text/css; charset=utf-8" },
      });
    },
  },
};
const context = {
  passThroughOnException() {},
  waitUntil() {},
};

const health = await worker.fetch(new Request("https://example.com/api/health"), env, context);

if (health.status !== 200) {
  throw new Error(`Expected /api/health to return 200, got ${health.status}.`);
}

const payload = await health.json();

if (payload.app !== "mreact-hacker-news" || payload.ok !== true) {
  throw new Error(`Unexpected /api/health payload: ${JSON.stringify(payload)}`);
}

const css = await worker.fetch(new Request("https://example.com/styles.css"), env, context);

if (css.status !== 200) {
  throw new Error(`Expected /styles.css to return 200, got ${css.status}.`);
}

if (seenAssetPaths[0] !== "/public/styles.css") {
  throw new Error(`Expected /styles.css to read /public/styles.css, got ${seenAssetPaths[0]}.`);
}

const robots = await worker.fetch(new Request("https://example.com/robots.txt"), env, context);

if (robots.status !== 200) {
  throw new Error(`Expected /robots.txt to return 200, got ${robots.status}.`);
}

if (seenAssetPaths[1] !== "/public/robots.txt") {
  throw new Error(`Expected /robots.txt to read /public/robots.txt, got ${seenAssetPaths[1]}.`);
}

const home = await worker.fetch(new Request("https://example.com/"), env, context);

if (home.status !== 200) {
  throw new Error(`Expected / to return 200, got ${home.status}.`);
}

if (home.headers.get("x-mreact-stream") !== "1") {
  throw new Error("Expected / to render as an mreact stream response.");
}

if (home.headers.get("content-encoding") !== "identity") {
  throw new Error("Expected / to opt out of Cloudflare gzip buffering for streamed HTML.");
}

const html = await home.text();

if (!html.includes("Top Stories")) {
  throw new Error("Expected / to render the Top Stories page.");
}

if (!html.includes('rel="stylesheet" href="/styles.css"')) {
  throw new Error("Expected / to include the Hacker News stylesheet.");
}

if (!html.includes('name="robots" content="noindex, nofollow"')) {
  throw new Error("Expected / to include a noindex robots meta tag.");
}

if (!html.includes('data-testid="app-shell"')) {
  throw new Error("Expected / to render the Hacker News app shell.");
}

if (html.includes('data-mreact-reload="true"')) {
  throw new Error("Expected / to use mreact navigation instead of the old document navigation workaround.");
}

if (!html.includes('data-testid="story-link"')) {
  throw new Error("Expected / to stream story rows.");
}

if (!html.includes("Loading stories...")) {
  throw new Error("Expected / to render visible story loading placeholder text.");
}

if (!/<span\b[^>]*data-mreact-oob-placeholder=/.test(html)) {
  throw new Error("Expected / to render story loading placeholders in visible span hosts.");
}

if (/<template\b[^>]*data-mreact-oob-placeholder=/.test(html)) {
  throw new Error("Expected / not to render story loading placeholders inside inert templates.");
}

if (html.includes("[object Object]")) {
  throw new Error("Expected / to render real links instead of [object Object].");
}

const storyHref = html.match(/href="(\/item\/\d+)"/)?.[1];

if (storyHref === undefined) {
  throw new Error("Expected / to render at least one story detail link.");
}

if (new RegExp(`data-testid="story-link"[^>]*data-mreact-reload="true"[^>]*href="${storyHref}"`).test(html)) {
  throw new Error("Expected story detail links to use mreact navigation after Cloudflare navigation fallback support.");
}

const navigation = await worker.fetch(
  new Request(`https://example.com${storyHref}`, {
    headers: { "x-mreact-navigation": "1" },
  }),
  env,
  context,
);

if (navigation.status !== 204) {
  throw new Error(`Expected Cloudflare navigation requests to request a document reload, got ${navigation.status}.`);
}

if (navigation.headers.get("x-mreact-navigation") !== "reload") {
  throw new Error("Expected Cloudflare navigation requests to include x-mreact-navigation: reload.");
}

const item = await worker.fetch(new Request(`https://example.com${storyHref}`), env, context);

if (item.status !== 200) {
  throw new Error(`Expected ${storyHref} to return 200, got ${item.status}.`);
}

if (item.headers.get("x-mreact-stream") !== "1") {
  throw new Error(`Expected ${storyHref} to render as an mreact stream response.`);
}

const itemHtml = await item.text();

if (!itemHtml.includes('data-testid="story-detail"')) {
  throw new Error(`Expected ${storyHref} to render the story detail page.`);
}

if (!itemHtml.includes("Loading comments...")) {
  throw new Error(`Expected ${storyHref} to render visible comment loading placeholder text.`);
}

if (!/<span\b[^>]*data-mreact-oob-placeholder=/.test(itemHtml)) {
  throw new Error(`Expected ${storyHref} to render comment loading placeholders in visible span hosts.`);
}

if (/<template\b[^>]*data-mreact-oob-placeholder=/.test(itemHtml)) {
  throw new Error(`Expected ${storyHref} not to render comment loading placeholders inside inert templates.`);
}

console.log("worker smoke ok");
