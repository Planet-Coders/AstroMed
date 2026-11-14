import { expect, test, type Page } from "@playwright/test";

async function openCheck(page: Page) {
  await page.getByRole("button", { name: "Daily check", exact: true }).click();
  await page.getByRole("button", { name: "Start check" }).click();
}

test("follow-up checks update monitoring and resolve the fluid alert", async ({ page }) => {
  const email = `check-${Date.now()}@aahms.demo`;
  const login = await page.request.post("/api/auth/login", { data: { email, password: "local-demo" } });
  expect(login.ok()).toBeTruthy();
  const hydrated = page.waitForResponse((response) => response.url().includes("/api/dashboard"));
  await page.goto("/");
  await hydrated;
  await openCheck(page);

  await page.getByLabel("Diastolic (bottom)").fill("102");
  await expect(page.getByText("102 mmHg diastolic · WARNING")).toBeVisible();
  await page.getByLabel("Systolic (top)").fill("118");
  await expect(page.getByText("118/102 mmHg · WARNING")).toBeVisible();
  await page.getByRole("button", { name: "Next →" }).click();
  await page.getByLabel("Blood sugar (mg/dL)").fill("127");
  await page.getByRole("button", { name: "Next →" }).click();
  await page.getByLabel("Temperature (°C)").fill("39");
  await page.getByRole("button", { name: "Next →" }).click();
  await page.getByRole("radio", { name: "Low", exact: true }).click();
  await page.getByRole("button", { name: "Next →" }).click();
  await page.getByLabel("Hours slept last night").fill("6.5");
  await page.getByRole("button", { name: "Next →" }).click();
  await page.getByLabel("New fluid to log (mL)").fill("1200");
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

  await openCheck(page);
  await expect(page.getByLabel("Diastolic (bottom)")).toBeEmpty();
  for (let i = 0; i < 5; i++) await page.getByRole("button", { name: "Skip", exact: true }).click();
  await expect(page.getByText(/1.?200 mL logged on this device today/)).toBeVisible();
  await page.getByLabel("New fluid to log (mL)").fill("900");
  await expect(page.getByText("2100 mL · NOMINAL")).toBeVisible();
  await page.getByRole("button", { name: "See results" }).click();
  await expect(page.getByText("The assessed readings are in range.")).toBeVisible();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.getByRole("button", { name: "My monitoring", exact: true }).click();

  await expect(page.locator('section[data-metric="hydration"]')).toContainText("2100 mL");
  await expect(alert("diastolic_high").getByTestId("alert-status")).toHaveText("OPEN");
  await expect(alert("urine_color_dark").getByTestId("alert-status")).toHaveText("OPEN");
  await page.getByRole("button", { name: /^Resolved \(/ }).click();
  await expect(alert("hydration_low").getByTestId("alert-status")).toHaveText("RESOLVED");
});

test("replayed and out-of-order check reports use the original capture day", async ({ request }) => {
  const login = await request.post("/api/auth/login", {
    data: { email: `replay-${Date.now()}@aahms.demo`, password: "local-demo" },
  });
  expect(login.ok()).toBeTruthy();
  const day = 86_400_000;
  const start = Math.floor(Date.now() / day) * day;
  const earlier = start - day + 1;
  const report = (at: number, fluidAddedMl: number, diastolic?: number) => ({
    id: String(at), key: String(at), kind: "selfCheck", recordedAt: Date.now(),
    data: { at, values: { fluidAddedMl, diastolic } },
  });
  const yesterday = report(earlier, 500);
  const first = report(start, 1200, 105);
  const followUp = report(start + 1, 900, 72);
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
