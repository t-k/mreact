// Offline stand-in for https://www.googletagmanager.com/gtm.js and
// /gtag/js used by the /analytics demo. It does NOT contact Google and
// does NOT implement real tag firing. It only guarantees window.dataLayer
// exists as an array and logs pushes so the demo is observable offline.
//
// In production you would delete this file and point the script `src` at
// the real googletagmanager.com URLs (and add that host to script-src,
// or use 'strict-dynamic').
(function () {
  "use strict";
  var w = window;
  w.dataLayer = w.dataLayer || [];

  // GTM's bootstrap pushes a gtm.js start event; mirror that shape.
  w.dataLayer.push({ "gtm.start": 0, event: "gtm.js (stub)" });

  // GA4 gtag() is defined inline by the page snippet; if it is not present
  // (e.g. GTM-only setups) provide a no-op that records into dataLayer.
  if (typeof w.gtag !== "function") {
    w.gtag = function () {
      w.dataLayer.push(arguments);
    };
  }

  // Expose a tiny marker so tests and curious viewers can confirm the stub
  // (not the real Google script) handled this request.
  w.__mreactAnalyticsStub = { loaded: true };

  if (w.console && typeof w.console.info === "function") {
    w.console.info("[analytics stub] dataLayer ready", w.dataLayer.length);
  }
})();
