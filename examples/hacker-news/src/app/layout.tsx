export default function Layout() {
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="stylesheet" href="/styles.css" />
      </head>
      <body>
        <div class="mx-auto min-h-screen max-w-5xl bg-orange-100 shadow-sm">
          <header class="border-b border-orange-300 bg-orange-500 px-3 py-2 text-orange-950">
            <div class="flex flex-wrap items-center gap-x-4 gap-y-1">
              <a href="/" class="text-[15px] font-bold hover:underline">
                Hacker News
              </a>
              <nav
                aria-label="Story feeds"
                class="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]"
              >
                <a class="text-orange-950 hover:underline" href="/">
                  Top
                </a>
                <a class="text-orange-950 hover:underline" href="/newest">
                  New
                </a>
                <a class="text-orange-950 hover:underline" href="/best">
                  Best
                </a>
                <a class="text-orange-950 hover:underline" href="/ask">
                  Ask
                </a>
                <a class="text-orange-950 hover:underline" href="/show">
                  Show
                </a>
                <a class="text-orange-950 hover:underline" href="/jobs">
                  Jobs
                </a>
              </nav>
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
