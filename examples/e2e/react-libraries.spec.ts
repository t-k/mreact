import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { rmSync } from "node:fs";
import { expect, test, type Locator } from "@playwright/test";
import { startDevServer } from "../../packages/router/dist/dev-server.js";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

interface RunningServer {
  close(): Promise<void>;
  url: string;
}

async function expectVisibleSvgWithDataShape(
  card: Locator,
  shapeSelector: string,
): Promise<void> {
  const svg = card.locator("svg").first();
  await expect(svg).toBeVisible();
  await expect(card.locator(shapeSelector).first()).toBeVisible();
}

test.describe.serial("react-libraries example", () => {
  let server: RunningServer;

  test.beforeAll(async () => {
    rmSync(join(repoRoot, ".data"), { recursive: true, force: true });
    rmSync(join(repoRoot, "examples/react-libraries/.data"), {
      recursive: true,
      force: true,
    });

    server = await startDevServer({
      port: 0,
      projectRoot: join(repoRoot, "examples/react-libraries"),
    });
  });

  test.afterAll(async () => {
    await server.close();
  });

  // --- Basic rendering ---

  test("ダッシュボード概要が描画される", async ({ page }) => {
    await page.goto(`${server.url}/charts`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Dashboard Overview" }),
    ).toBeVisible();

    // 4 KPI cards should be visible
    const kpiCards = page.locator(".kpi-card");
    await expect(kpiCards).toHaveCount(4);

    // Each KPI card should have a non-empty value
    for (let i = 0; i < 4; i++) {
      const value = await kpiCards.nth(i).locator(".kpi-value").textContent();
      expect(value).toBeTruthy();
      expect(value!.trim()).not.toBe("");
    }
  });

  // --- React compat charts ---

  test("rechartsの棒グラフがレンダリングされる", async ({ page }) => {
    await page.goto(`${server.url}/charts`);

    // Find the Monthly Revenue card and verify SVG (recharts renders SVG)
    const revenueCard = page.locator(".card").filter({ hasText: "Monthly Revenue" });
    await expect(revenueCard).toBeVisible();

    await revenueCard.waitFor({ state: "visible" });
    await page.waitForSelector(".card:has-text('Monthly Revenue') svg", {
      timeout: 10000,
    });

    await expectVisibleSvgWithDataShape(revenueCard, ".recharts-bar-rectangle");
  });

  test("rechartsの棒グラフはhover後も棒を維持する", async ({ page }) => {
    await page.goto(`${server.url}/charts`);

    const revenueCard = page.locator(".card").filter({ hasText: "Monthly Revenue" });
    await expect(revenueCard).toBeVisible();

    const barShapes = revenueCard.locator(".recharts-bar-rectangle path");
    await expect(barShapes.first()).toBeVisible();
    await expect(barShapes).toHaveCount(6);

    const svgBox = await revenueCard.locator("svg").first().boundingBox();
    expect(svgBox).not.toBeNull();

    await page.mouse.move(svgBox!.x + svgBox!.width * 0.3, svgBox!.y + svgBox!.height * 0.55);

    await expect(barShapes.first()).toBeVisible();
    await expect(barShapes).toHaveCount(6);
  });

  test("rechartsの円グラフがレンダリングされる", async ({ page }) => {
    await page.goto(`${server.url}/charts`);

    // Find the Revenue by Product card and verify SVG
    const pieCard = page.locator(".card").filter({ hasText: "Revenue by Product" });
    await expect(pieCard).toBeVisible();

    await page.waitForSelector(".card:has-text('Revenue by Product') svg", {
      timeout: 10000,
    });

    await expectVisibleSvgWithDataShape(pieCard, ".recharts-pie-sector");
  });

  test("rechartsの折れ線グラフがレンダリングされる", async ({ page }) => {
    await page.goto(`${server.url}/metrics`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Metrics" }),
    ).toBeVisible();

    // Page Views chart
    const pvCard = page.locator(".card").filter({ hasText: "Page Views" });
    await page.waitForSelector(".card:has-text('Page Views') svg", {
      timeout: 10000,
    });
    await expectVisibleSvgWithDataShape(pvCard, ".recharts-line-curve");

    // Conversions chart
    const convCard = page.locator(".card").filter({ hasText: "Conversions" });
    await page.waitForSelector(".card:has-text('Conversions') svg", {
      timeout: 10000,
    });
    await expectVisibleSvgWithDataShape(convCard, ".recharts-line-curve");
  });

  // --- Sales page ---

  test("売上データテーブルが表示される", async ({ page }) => {
    await page.goto(`${server.url}/sales`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Sales Data" }),
    ).toBeVisible();

    // Table should be present
    const table = page.locator("table");
    await expect(table).toBeVisible();

    // Auto-seeded data should populate rows in tbody
    const rows = table.locator("tbody tr");
    await expect(rows.first()).toBeVisible();
    const rowCount = await rows.count();
    expect(rowCount).toBeGreaterThan(0);
  });

  test("売上データの追加", async ({ page }) => {
    await page.goto(`${server.url}/sales`);

    const table = page.locator("table");
    const rows = table.locator("tbody tr");
    const initialCount = await rows.count();

    // Fill in the add-sale form
    await page.locator("select").first().selectOption("Mar");
    await page.locator("select").nth(1).selectOption("Widget B");
    await page.locator('input[type="number"]').first().fill("9999");
    await page.locator('input[type="number"]').nth(1).fill("42");
    await page.getByRole("button", { name: "Add" }).click();

    // Wait for the table to update
    await page.waitForFunction(
      (count: number) => document.querySelectorAll("table tbody tr").length > count,
      initialCount,
    );

    const newCount = await rows.count();
    expect(newCount).toBeGreaterThan(initialCount);
  });

  // --- API tests ---

  test("API: 売上データの取得", async ({ page }) => {
    await page.goto(server.url);

    const result = await page.evaluate(async () => {
      const res = await fetch("/api/sales");
      const data = await res.json();
      return { status: res.status, isArray: Array.isArray(data), length: data.length };
    });

    expect(result.status).toBe(200);
    expect(result.isArray).toBe(true);
    expect(result.length).toBeGreaterThan(0);
  });

  test("API: メトリクスデータの取得", async ({ page }) => {
    await page.goto(server.url);

    const result = await page.evaluate(async () => {
      const res = await fetch("/api/metrics?name=page_views");
      const data = await res.json();
      return { status: res.status, isArray: Array.isArray(data), length: data.length };
    });

    expect(result.status).toBe(200);
    expect(result.isArray).toBe(true);
    expect(result.length).toBeGreaterThan(0);
  });

  // --- Navigation ---

  test("ページ間のSPAナビゲーション", async ({ page }) => {
    await page.goto(server.url);
    await expect(
      page.getByRole("heading", { level: 1, name: "React libraries on mreact" }),
    ).toBeVisible();

    // Navigate to Charts via nav link
    await page.getByRole("link", { name: "Charts", exact: true }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Dashboard Overview" }),
    ).toBeVisible();

    // Navigate to Sales via nav link
    await page.getByRole("link", { name: "Sales", exact: true }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Sales Data" }),
    ).toBeVisible();

    // Navigate to Metrics via nav link
    await page.getByRole("link", { name: "Metrics", exact: true }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Metrics" }),
    ).toBeVisible();
  });

  // --- SSR without JS ---

  test("SSR: JSなしでもKPIが表示される", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    try {
      await page.goto(`${server.url}/charts`);
      await expect(
        page.getByRole("heading", { level: 1, name: "Dashboard Overview" }),
      ).toBeVisible();

      // KPI cards should be present in SSR HTML
      const kpiCards = page.locator(".kpi-card");
      await expect(kpiCards).toHaveCount(4);

      // KPI values should be non-empty (seeded data)
      for (let i = 0; i < 4; i++) {
        const value = await kpiCards.nth(i).locator(".kpi-value").textContent();
        expect(value).toBeTruthy();
        expect(value!.trim()).not.toBe("");
      }
    } finally {
      await context.close();
    }
  });

  // --- Lexical editor (React-compat island) ---

  test("Lexicalエディタのツールバー（入力/太字/見出し/リスト/リンク/undo）が動作する", async ({ page }) => {
    await page.goto(`${server.url}/editor`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Rich text editor" }),
    ).toBeVisible();

    // The contentEditable editor root mounts after hydration.
    const editor = page.locator(".editor-input[contenteditable='true']");
    await expect(editor).toBeVisible();

    // Type plain text; the OnChangePlugin reports the character count.
    await editor.click();
    await page.keyboard.type("Hello mreact");
    await expect(editor).toContainText("Hello mreact");
    await expect(page.getByTestId("charcount")).toHaveText("12 characters");

    // Toggle bold and keep typing — Lexical wraps bold text in <strong>, and the
    // toolbar reflects the active format.
    await page.getByTestId("bold").click();
    await page.keyboard.type(" bold");
    await expect(editor.locator("strong")).toContainText("bold");
    await expect(page.getByTestId("bold")).toHaveAttribute("aria-pressed", "true");

    // Heading: select all and apply H1.
    await editor.click();
    await page.keyboard.press("ControlOrMeta+A");
    await page.getByTestId("h1").click();
    await expect(editor.locator("h1")).toContainText("Hello mreact");
    await expect(page.getByTestId("h1")).toHaveAttribute("aria-pressed", "true");

    // Back to a normal paragraph.
    await editor.click();
    await page.keyboard.press("ControlOrMeta+A");
    await page.getByTestId("paragraph").click();
    await expect(editor.locator("h1")).toHaveCount(0);

    // Bullet list.
    await editor.click();
    await page.keyboard.press("ControlOrMeta+A");
    await page.getByTestId("bullet").click();
    await expect(editor.locator("ul li")).toContainText("Hello mreact");
    await expect(page.getByTestId("bullet")).toHaveAttribute("aria-pressed", "true");

    // Link the current selection.
    await editor.click();
    await page.keyboard.press("ControlOrMeta+A");
    await page.getByTestId("link").click();
    await expect(editor.locator("a[href*='mreact']")).toBeVisible();

    // Undo reverts the link.
    await page.getByTestId("undo").click();
    await expect(editor.locator("a[href*='mreact']")).toHaveCount(0);
  });

  // --- conform + Zod form (React-compat island) ---

  test("conformフォームが検証エラーと成功を反映する", async ({ page }) => {
    await page.goto(`${server.url}/forms`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Schema form" }),
    ).toBeVisible();

    // Invalid values — conform runs the Zod schema on the client and shows the
    // format errors.
    await page.getByLabel("Email").fill("not-an-email");
    await page.getByLabel("Password").fill("short");
    await page.getByRole("button", { name: "Sign up" }).click();
    await expect(page.getByTestId("email-error")).toContainText("Enter a valid email.");
    await expect(page.getByTestId("password-error")).toContainText("At least 8 characters.");

    // Fix the values — submission succeeds and the result renders.
    await page.getByLabel("Email").fill("ada@example.test");
    await page.getByLabel("Password").fill("supersecret");
    await page.getByRole("button", { name: "Sign up" }).click();
    await expect(page.getByTestId("form-result")).toContainText(
      "Signed up as ada@example.test",
    );
  });

  // --- Radix UI dialog (React-compat island) ---

  test("Radix dialogがportalで開きfocusをトラップしEscapeで閉じる", async ({ page }) => {
    await page.goto(`${server.url}/dialog`);
    await expect(page.getByRole("heading", { level: 1, name: "Dialog" })).toBeVisible();

    // Content is not mounted until the dialog opens.
    await expect(page.getByTestId("dialog-content")).toBeHidden();

    // Open — Radix mounts the content into a portal.
    await page.getByTestId("open-dialog").click();
    const content = page.getByTestId("dialog-content");
    await expect(content).toBeVisible();
    await expect(content.getByText("Radix dialog")).toBeVisible();

    // Focus is trapped: the active element lives inside the dialog content.
    const focusInside = await page.evaluate(() => {
      const node = document.querySelector('[data-testid="dialog-content"]');
      return node !== null && node.contains(document.activeElement);
    });
    expect(focusInside).toBe(true);

    // Escape dismisses the dialog (dismissable layer).
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("dialog-content")).toBeHidden();

    // Re-open and close via the Close button.
    await page.getByTestId("open-dialog").click();
    await expect(page.getByTestId("dialog-content")).toBeVisible();
    await page.getByTestId("close-dialog").click();
    await expect(page.getByTestId("dialog-content")).toBeHidden();
  });
});
