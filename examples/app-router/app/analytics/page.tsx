// /analytics — third-party analytics / tag-manager integration.
//
// Demonstrates, with mreact's public API only (no core changes):
//   1. GTM container injection via metadata.head (nonce'd inline bootstrap).
//   2. GA4 gtag via metadata.head (nonce'd external loader + inline config).
//   3. A per-request CSP nonce produced in generateMetadata({ request }):
//      script-src 'self' + 'nonce-<v>' authorizes both the framework's
//      same-origin module scripts and these head scripts.
//   4. dangerouslySetInnerHTML for a CSP-safe JSON-LD block (data, not JS).
//   5. SPA page_view tracking via the AnalyticsTracker client island.
//
// The demo never contacts Google: script `src` values point at the local
// /analytics/gtm-stub.js. Swap them for googletagmanager.com URLs in
// production (and add that host to script-src or use 'strict-dynamic').
//
// CSP note: we intentionally set ONLY script-src. The root layout ships an
// inline <style> block; adding style-src here would make the CSP serializer
// nonce it and drop implicit 'unsafe-inline', breaking layout styles on every
// page. Inline styles need their own nonce/hash strategy — out of scope here.
//
// Nonce generation uses node:crypto. `generateMetadata` is server-only (it runs
// in the request handler / Cloudflare Worker, never in the browser), so a Node
// builtin import here is fine and the route still bundles for every target,
// including Cloudflare.
import { randomBytes } from "node:crypto";
import type { GenerateMetadataContext, RouteMetadata } from "@reckona/mreact-router";
import { AnalyticsTracker } from "./AnalyticsTracker.client.js";

const GTM_CONTAINER_ID = "GTM-DEMO";
const GA4_MEASUREMENT_ID = "G-DEMO";

// Standard GTM bootstrap, pointed at the local offline stub instead of
// www.googletagmanager.com. The standard snippet contains no "<", so it is
// safe as metadata.head text content (which would escape "<" → &lt;).
const GTM_BOOTSTRAP =
  "(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});" +
  "var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';" +
  "j.async=true;j.src='/analytics/gtm-stub.js?id='+i+dl;f.parentNode.insertBefore(j,f);" +
  "})(window,document,'script','dataLayer','" + GTM_CONTAINER_ID + "');";

const GA4_INIT =
  "window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}" +
  "gtag('js',new Date());gtag('config','" + GA4_MEASUREMENT_ID + "');";

// CSP-safe structured data: type="application/ld+json" is parsed as data, not
// executed as JS, so it is not subject to script-src and needs no nonce. This
// is the correct use of dangerouslySetInnerHTML for an application-owned raw
// inline block (static constant only — dynamic interpolation is rejected by
// the compiler).
const JSON_LD = JSON.stringify({
  "@context": "https://schema.org",
  "@type": "WebPage",
  name: "mreact App Router — Analytics",
  description:
    "Third-party analytics (GTM / GA4) integration demo for @reckona/mreact-router.",
});

function generateNonce(): string {
  // base64url matches the router's CSP nonce validator (^[A-Za-z0-9+/=_-]+$).
  return randomBytes(16).toString("base64url");
}

export function generateMetadata(_context: GenerateMetadataContext): RouteMetadata {
  const nonce = generateNonce();
  return {
    title: "Analytics — mreact App Router",
    description:
      "GTM and GA4 third-party scripts via metadata.head, with a per-request CSP nonce.",
    csp: {
      // ONLY script-src — see the CSP note above re: inline layout styles.
      directives: { "script-src": ["'self'"] },
      nonce,
    },
    head: [
      // 1. GTM container bootstrap (inline, nonce'd).
      { tag: "script", nonce: true, content: GTM_BOOTSTRAP },
      // 2. GA4 external loader (nonce'd; src is the local offline stub).
      {
        tag: "script",
        nonce: true,
        attrs: { async: true, src: "/analytics/gtm-stub.js?id=" + GA4_MEASUREMENT_ID },
      },
      // 3. GA4 inline init (nonce'd).
      { tag: "script", nonce: true, content: GA4_INIT },
    ],
  };
}

export default function Page() {
  return (
    <main>
      {/* GTM noscript fallback. metadata.head cannot emit <noscript>, so it
          lives in body JSX. Same-origin stub keeps it inside default-src. */}
      <noscript>
        <iframe
          src="/analytics/ns.html"
          height="0"
          width="0"
          style="display:none;visibility:hidden"
          title="gtm-noscript"
        ></iframe>
      </noscript>

      <h1>Analytics</h1>
      <p>
        This page integrates third-party analytics the way a real app would,
        using only <code>@reckona/mreact-router</code> public API — no framework
        changes. It runs fully offline: every analytics <code>src</code> points
        at a local stub under <code>public/analytics/</code>, never{" "}
        <code>googletagmanager.com</code>.
      </p>

      <h2>1. Google Tag Manager container</h2>
      <p>
        The GTM bootstrap IIFE is injected through{" "}
        <code>metadata.head</code> as an inline <code>&lt;script&gt;</code> with{" "}
        <code>nonce: true</code>, so it carries this request's CSP nonce. The
        no-JS fallback is a <code>&lt;noscript&gt;</code> iframe in the body
        (head descriptors only allow base/link/meta/script/style).
      </p>

      <h2>2. GA4 gtag</h2>
      <p>
        The GA4 loader (<code>async</code> external script) and its inline{" "}
        <code>gtag('config', …)</code> initializer are both declared in{" "}
        <code>metadata.head</code> with <code>nonce: true</code>.
      </p>

      <h2>3. Per-request CSP nonce</h2>
      <p>
        <code>generateMetadata(&#123; request &#125;)</code> mints a fresh
        base64url nonce per request and sets{" "}
        <code>csp.directives.script-src = ['self']</code> plus{" "}
        <code>csp.nonce</code>. The serializer appends{" "}
        <code>'nonce-&lt;v&gt;'</code> to <code>script-src</code>, and every head
        script with <code>nonce: true</code> picks up the same value — so every
        executable script on the page is nonce-authorized. View source twice: the
        nonce changes each load.
      </p>

      <h2>4. Structured data via dangerouslySetInnerHTML</h2>
      <p>
        A JSON-LD block is emitted raw with{" "}
        <code>dangerouslySetInnerHTML</code>. Because{" "}
        <code>type="application/ld+json"</code> is data (not executed JS), it is
        not subject to <code>script-src</code> and needs no nonce.
      </p>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON_LD }}
      />

      <h2>5. SPA page_view tracking</h2>
      <p>
        The island below subscribes to{" "}
        <code>subscribeNavigationState</code> and pushes a{" "}
        <code>page_view</code> to <code>window.dataLayer</code> on every
        completed client navigation. Use the nav bar to move between routes and
        come back.
      </p>
      <AnalyticsTracker measurementId={GA4_MEASUREMENT_ID} />

      <p class="muted">
        Production swap: delete <code>public/analytics/gtm-stub.js</code>, point
        the <code>src</code> values at <code>https://www.googletagmanager.com/…</code>,
        and add that host to <code>script-src</code> (or use{" "}
        <code>'strict-dynamic'</code>). See{" "}
        <code>app/analytics/page.tsx</code>.
      </p>
      <p>
        <a href="/">← Back to Home</a>
      </p>
    </main>
  );
}
