import { expect, test, type Page } from "@playwright/test";
import { testEmail } from "./testAccounts";

async function openCheck(page: Page) {
  await page.getByRole("button", { name: "Daily check", exact: true }).click();
  await page.getByRole("button", { name: "Start check" }).click();
}

test("the low fluid intake alert accepts presets and a custom amount", async ({ page }) => {
  const email = testEmail("check");
  const login = await page.request.post("/api/auth/login", { data: { email, password: "local-demo" } });
  expect(login.ok()).toBeTruthy();
  const hydrated = page.waitForResponse((response) => response.url().includes("/api/dashboard"));
  await page.goto("/");
  await hydrated;
  await openCheck(page);

  const next = page.getByRole("button", { name: "Next →" });
  await page.getByLabel("Diastolic (bottom)").fill("102");
  await expect(page.getByText("Enter both the top and bottom numbers to continue.")).toBeVisible();
  await expect(next).toBeDisabled();
  await page.getByLabel("Systolic (top)").fill("118");
  await expect(page.getByText("118/102 mmHg · WARNING")).toBeVisible();
  await next.click();
  await page.getByLabel("Blood sugar (mg/dL)").fill("127");
  await page.getByRole("button", { name: "Next →" }).click();
  await page.getByLabel("Temperature (°C)").fill("39");
  await page.getByRole("button", { name: "Next →" }).click();
  await page.getByRole("radio", { name: "Low", exact: true }).click();
  await page.getByRole("button", { name: "Next →" }).click();
  await page.getByLabel("Hours slept last night").fill("6.5");
  await page.getByRole("button", { name: "Next →" }).click();
  await page.getByLabel("Fluid in the last 24 h (mL)").fill("1200");
  await expect(page.getByRole("button", { name: /250 mL|500 mL/ })).toHaveCount(0);
  await page.getByRole("radio", { name: "Shade 6 of 8" }).click();
  await page.getByRole("button", { name: "See results" }).click();
  await page.getByRole("button", { name: "Review in My monitoring" }).click();

  const alert = (id: string) => page.locator(`article[data-alert="${id}"]`);
  for (const id of [
    "diastolic_high", "glucose_fasting_high", "temperature_high", "mood_low", "self_check_sleep_low", "hydration_low", "urine_color_dark",
  ]) {
    await expect(alert(id).getByTestId("alert-status")).toHaveText("OPEN");
  }
  await expect(page.locator('section[data-metric="systolic"]')).toContainText("118 mmHg");
  await expect(page.locator('section[data-metric="diastolic"]')).toContainText("102 mmHg");

  const hydration = alert("hydration_low");
  const hydrationChart = page.locator('section[data-metric="hydration"]');
  await hydration.getByRole("button", { name: "Log water" }).click();
  await hydration.getByRole("button", { name: "Add 250 mL" }).click();
  await expect(hydrationChart).toContainText("1450 mL");
  await hydration.getByRole("button", { name: "Acknowledge" }).click();
  await expect(hydration.getByTestId("alert-status")).toHaveText("ACKNOWLEDGED");
  await hydration.getByRole("button", { name: "Log water" }).click();
  await hydration.getByRole("button", { name: "Add 500 mL" }).click();
  await expect(hydrationChart).toContainText("1950 mL");
  await hydration.getByRole("button", { name: "Log water" }).click();
  await hydration.getByLabel("Custom amount (mL)").fill("150");
  await hydration.getByRole("button", { name: "Add amount" }).click();

  await expect(hydrationChart).toContainText("2100 mL");
  await expect(hydration.getByTestId("alert-status")).toHaveText("RESOLVED");
  await expect(hydration).toContainText("Added 150 mL of water.");
  await expect(hydration.getByRole("button", { name: "Log water" })).toHaveCount(0);
  await page.getByRole("button", { name: /^Active \(/ }).click();
  await expect(alert("diastolic_high").getByTestId("alert-status")).toHaveText("OPEN");
  await expect(alert("urine_color_dark").getByTestId("alert-status")).toHaveText("OPEN");
});

test("replayed and out-of-order snapshots use the latest capture time for each day", async ({ request }) => {
  const login = await request.post("/api/auth/login", {
    data: { email: testEmail("replay"), password: "local-demo" },
  });
  expect(login.ok()).toBeTruthy();
  const day = 86_400_000;
  const start = Math.floor(Date.now() / day) * day;
  const earlier = start - day + 1;
  const report = (at: number, fluidMl: number, diastolic?: number) => ({
    id: String(at), key: String(at), kind: "selfCheck", recordedAt: Date.now(),
    data: { at, values: { fluidMl, diastolic } },
  });
  const yesterday = report(earlier, 500);
  const first = report(start, 1200, 105);
  const followUp = report(start + 1, 2100, 72);
  for (const batch of [[followUp, yesterday], [first, followUp]]) {
    const saved = await request.post("/api/health/reports", { data: { reports: batch } });
    expect(saved.ok()).toBeTruthy();
    expect((await saved.json()).saved).toEqual(batch.map((entry) => entry.id));
  }
  const monitoring = await request.get("/api/monitoring/me");
  expect(monitoring.ok()).toBeTruthy();
  const { alerts, metrics } = await monitoring.json();
  expect(alerts.map((alert: { ruleId: string }) => alert.ruleId)).not.toContain("diastolic_high");
  const hydration = metrics.find((metric: { id: string }) => metric.id === "hydration");
  expect(hydration.series.slice(-2).map((point: { value: number }) => point.value)).toEqual([500, 2100]);
});

test("a retried water entry does not duplicate intake or history", async ({ request }) => {
  const login = await request.post("/api/auth/login", {
    data: { email: testEmail("water-retry"), password: "local-demo" },
  });
  expect(login.ok()).toBeTruthy();
  const at = Date.now();
  const check = await request.post("/api/health/reports", { data: { reports: [{
    id: String(at), key: String(at), kind: "selfCheck", recordedAt: at,
    data: { at, values: { fluidMl: 1750 } },
  }] } });
  expect(check.ok()).toBeTruthy();
  const before = await (await request.get("/api/monitoring/me")).json();
  const { id } = before.alerts.find((a: { ruleId: string }) => a.ruleId === "hydration_low");
  const data = { action: "log-water", amountMl: 250, entryId: crypto.randomUUID() };
  for (let i = 0; i < 2; i++) {
    const response = await request.post(`/api/alerts/${id}`, { data });
    expect(response.ok()).toBeTruthy();
    const { alert } = await response.json();
    expect(alert.status).toBe("RESOLVED");
    expect(alert.notes.filter((note: { action: string }) => note.action === "logged water")).toHaveLength(1);
  }
  const after = await (await request.get("/api/monitoring/me")).json();
  expect(after.metrics.find((m: { id: string }) => m.id === "hydration").series.at(-1).value).toBe(2000);
});
