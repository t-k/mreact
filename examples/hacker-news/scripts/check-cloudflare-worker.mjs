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

const home = await worker.fetch(new Request("https://example.com/"), env, context);

if (home.status !== 200) {
  throw new Error(`Expected / to return 200, got ${home.status}.`);
}

if (home.headers.get("x-mreact-stream") !== "1") {
  throw new Error("Expected / to render as an mreact stream response.");
}

const html = await home.text();

if (!html.includes("Top Stories")) {
  throw new Error("Expected / to render the Top Stories page.");
}

if (!html.includes('rel="stylesheet" href="/styles.css"')) {
  throw new Error("Expected / to include the Hacker News stylesheet.");
}

if (!html.includes('data-testid="app-shell"')) {
  throw new Error("Expected / to render the Hacker News app shell.");
}

if (!html.includes('data-testid="story-link"')) {
  throw new Error("Expected / to stream story rows.");
}

if (html.includes("[object Object]")) {
  throw new Error("Expected / to render real links instead of [object Object].");
}

const storyHref = html.match(/href="(\/item\/\d+)"/)?.[1];

if (storyHref === undefined) {
  throw new Error("Expected / to render at least one story detail link.");
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

console.log("worker smoke ok");
