import { expect, test, type Page } from "@playwright/test";

const SURGEON = { email: "surgeon@aahms.demo", password: process.env.SEED_OVERSIGHT_PASSWORD ?? "surgeon-aahms-2026" };

async function signIn(page: Page, email: string, password: string) {
  const res = await page.request.post("/api/auth/login", { data: { email, password } });
  expect(res.ok(), `sign in as ${email}`).toBeTruthy();
  return (await res.json()) as { home: string };
}

async function openMember(page: Page, name: string) {
  await signIn(page, SURGEON.email, SURGEON.password);
  await page.goto("/oversight");
  await page.getByRole("button", { name: /^SIM-1/ }).click();
  await page.getByRole("button", { name: new RegExp(name) }).click();
  await expect(page.getByRole("heading", { level: 2, name: new RegExp(name) })).toBeVisible();
}

test.describe("oversight dashboard on synthetic cases", () => {
  test("group cards flag missing data and anomalies, and mark synthetic crew", async ({ page }) => {
    await signIn(page, SURGEON.email, SURGEON.password);
    await page.goto("/oversight");
    await page.getByRole("button", { name: /^SIM-1/ }).click();

    const card = (name: string) => page.locator("main button").filter({ hasText: name });
    await expect(card("Sim Nominal").getByTestId("monitoring-summary")).toContainText("No monitoring alerts");
    await expect(card("Sim Dropout").getByTestId("monitoring-summary")).toContainText("Pulse trend: missing");
    await expect(card("Sim Dropout").getByTestId("monitoring-summary")).toContainText("Hydration: missing");
    for (const name of ["Sim Sleep Debt", "Sim Rising HR", "Sim Dehydrated", "Sim Solar Event"]) {
      await expect(card(name).getByTestId("monitoring-summary")).toContainText("1 open");
    }
    await expect(card("Sim Nominal")).toContainText("SYNTHETIC");
  });

  test("member monitoring shows time series, missing badges, trends and sources", async ({ page }) => {
    await openMember(page, "Sim Dropout");
    const hydration = page.locator('section[data-metric="hydration"]');
    await expect(hydration).toContainText("Missing");
    await expect(page.locator('section[data-metric="pulse"]')).toContainText("Missing");
    await expect(page.locator('section[data-metric="sleep"]')).toContainText("On time");

    // Range switch redraws the charts: 7 → 30 days.
    await page.getByRole("button", { name: "30 days", exact: true }).click();
    await expect(page.locator('section[data-metric="sleep"] svg')).toHaveAttribute("aria-label", /last 30 days, 2 days without data/);

    await hydration.getByText("Why we monitor this").click();
    await expect(hydration.getByRole("link", { name: "NTRS 20240012429" })).toHaveAttribute("href", "https://ntrs.nasa.gov/citations/20240012429");
  });

  test("rising heart rate shows a trend summary and a trend alert", async ({ page }) => {
    await openMember(page, "Sim Rising HR");
    await expect(page.getByTestId("trend-pulse")).toContainText(/Pulse trend up \d+% vs the previous 14 days/);
    await page.getByRole("button", { name: "Alerts", exact: true }).click();
    await expect(page.locator('article[data-alert="pulse_trend"]').getByTestId("alert-status")).toHaveText("OPEN");
  });
});

test.describe("alert acknowledgement flow", () => {
  test("oversight acknowledges with a note, explains, then resolves", async ({ page }) => {
    await openMember(page, "Sim Dehydrated");
    await page.getByRole("button", { name: "Alerts", exact: true }).click();
    const alert = page.locator('article[data-alert="hydration_low"]');
    await expect(alert.getByTestId("alert-status")).toHaveText("OPEN");

    await alert.getByText("Why this alerted").click();
    await expect(alert).toContainText("Threshold crossed");
    await expect(alert).toContainText("1500 mL (red)");

    await alert.getByRole("textbox").fill("Called crew; drinking 500 mL now, recheck tonight.");
    await alert.getByRole("button", { name: "Acknowledge" }).click();
    await expect(alert.getByTestId("alert-status")).toHaveText("ACKNOWLEDGED");
    await expect(alert).toContainText("Called crew; drinking 500 mL now");
    await expect(alert).toContainText("acknowledged by Dr. Amara Lewis (oversight)");

    await alert.getByRole("textbox").fill("Intake back on plan per crew report.");
    await alert.getByRole("button", { name: "Resolve" }).click();
    await page.getByRole("button", { name: /^Resolved \(/ }).click();
    await expect(page.locator('article[data-alert="hydration_low"]').getByTestId("alert-status")).toHaveText("RESOLVED");
    // The 24 h cool-down keeps it from reopening straight away.
    await page.getByRole("button", { name: /^Active \(/ }).click();
    await expect(page.locator('article[data-alert="hydration_low"]')).toHaveCount(0);
  });

  test("crew can acknowledge their own alert but not resolve it", async ({ page }) => {
    await signIn(page, "sim-sleep-debt@aahms.demo", "any-password");
    await page.goto("/");
    await page.getByRole("button", { name: "My monitoring" }).click();
    const alert = page.locator('article[data-alert="sleep_low"]');
    await expect(alert.getByTestId("alert-status")).toHaveText("OPEN");
    await expect(alert.getByRole("button", { name: "Resolve" })).toHaveCount(0);
    await alert.getByRole("textbox").fill("Noisy fan in my crew quarters, swapping sleep slot tonight.");
    await alert.getByRole("button", { name: "Acknowledge" }).click();
    await expect(alert.getByTestId("alert-status")).toHaveText("ACKNOWLEDGED");
  });

  test("the server refuses alert actions outside the user's groups", async ({ page }) => {
    // A crew member of another group must not reach SIM-1's alerts.
    await signIn(page, SURGEON.email, SURGEON.password);
    const res = await page.request.get("/api/oversight/groups");
    const sim = ((await res.json()) as { groups: { id: string; code: string }[] }).groups.find((g) => g.code === "SIM-1")!;
    const members = (await (await page.request.get(`/api/oversight/groups/${sim.id}`)).json()) as { members: { user: { id: string; name: string } }[] };
    const solar = members.members.find((m) => m.user.name === "Sim Solar Event")!;
    const mon = (await (await page.request.get(`/api/oversight/members/${solar.user.id}/monitoring?days=7`)).json()) as { alerts: { id: string }[] };
    const alertId = mon.alerts[0].id;

    await signIn(page, "john@aahms.demo", "x");
    expect((await page.request.post(`/api/alerts/${alertId}`, { data: { action: "acknowledge" } })).status()).toBe(404);
    expect((await page.request.get(`/api/oversight/members/${solar.user.id}/monitoring`)).status()).toBe(403);
    expect((await page.request.get("/api/admin/alert-rules")).status()).toBe(403);
  });
});

test("missing-data demo scenario shows a lost wearable signal", async ({ page }) => {
  await signIn(page, "john@aahms.demo", "x");
  // The console's first dashboard fetch runs after hydration; picking the scenario
  // before that changes the <select> without React seeing it.
  const hydrated = page.waitForResponse((r) => r.url().includes("/api/dashboard"));
  await page.goto("/");
  await hydrated;
  await page.getByLabel("Demo").selectOption("missing_data");
  await expect(page.getByText("No signal · wearable offline")).toBeVisible();
  await expect(page.getByText(/No reading for \d+ s/)).toBeVisible();
});
