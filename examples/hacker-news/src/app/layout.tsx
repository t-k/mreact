import { Link } from "@reckona/mreact-router/link";
import { FeedNav } from "../hn/render.js";

export default function Layout() {
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex, nofollow" />
        <link rel="stylesheet" href="/styles.css" />
      </head>
      <body>
        <div data-testid="app-shell" class="mx-auto min-h-screen max-w-5xl bg-orange-100 shadow-sm">
          <header class="border-b border-orange-300 bg-orange-500 px-3 py-2 text-orange-950">
            <div class="flex flex-wrap items-center gap-x-4 gap-y-1">
              <Link href="/" class="text-[15px] font-bold hover:underline">
                Hacker News
              </Link>
              <FeedNav />
            </div>
          </header>
          <div class="px-3 py-4">
            <Slot />
          </div>
        </div>
      </body>
    </html>
  );
}
