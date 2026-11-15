import { expect, test, type Page } from "@playwright/test";

const SURGEON_PASSWORD = process.env.SEED_OVERSIGHT_PASSWORD ?? "password";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "password";
const CREW_PASSWORD = "aahms2025";

async function loginAs(page: Page, email: string, password = CREW_PASSWORD) {
  const res = await page.request.post("/api/auth/login", { data: { email, password } });
  expect(res.ok(), `Login failed for ${email}`).toBeTruthy();
  const data = await res.json();
  return data;
}

test.describe("AstroMed Comprehensive Test Suite", () => {
  // ─── TC01: AUTHENTICATION & ROLE-BASED ACCESS CONTROL ─────────────────────────────
  test("TC01: Authentication & Role-Based Access Control", async ({ page }) => {
    // 1. Astronaut UI Form Login
    await page.goto("/login");
    // Click "Sign in" to reveal the sliding login drawer
    await page.getByRole("button", { name: "Sign in" }).first().click();
    await page.locator('aside input[type="email"]').fill("vance@aahms.demo");
    await page.locator('aside input[type="password"]').fill(CREW_PASSWORD);
    await page.getByRole("button", { name: "Launch console" }).click();
    await page.waitForURL("**/");
    await expect(page).toHaveURL(/.*\/$/);
    await expect(page.getByText("Vance").first()).toBeVisible();

    // 2. Role boundary check: Astronaut cannot access /admin or /oversight
    const adminRes = await page.goto("/admin");
    expect([401, 403, 302, 307]).toContain(adminRes?.status() ?? 200);

    // 3. Flight Surgeon Login via API session token
    await loginAs(page, "surgeon@aahms.demo", SURGEON_PASSWORD);
    await page.goto("/oversight");
    await page.waitForURL("**/oversight");
    await expect(page).toHaveURL(/.*\/oversight/);

    // 4. Session API validation
    const meRes = await page.request.get("/api/auth/me");
    expect(meRes.ok()).toBeTruthy();
    const me = await meRes.json();
    expect(me.user.role).toBe("OVERSIGHT");
    expect(me.user.email).toBe("surgeon@aahms.demo");
  });

  // ─── TC02: BIOLOGICAL SEX & 3D BODY MAP MODEL BINDING ───────────────────────────
  test("TC02: Biological Sex & 3D Body Map Scanner Enforces Account Sex", async ({ page }) => {
    // 1. Male account (Vance)
    await loginAs(page, "vance@aahms.demo");
    await page.goto("/");
    // Must show Male scan badge and NO sex toggle buttons
    await expect(page.getByText(/Male scan/i)).toBeVisible();
    await expect(page.getByRole("button", { name: "Female", exact: true })).toHaveCount(0);
    // Report injury button must remain accessible
    await expect(page.getByRole("button", { name: /Report injury/i })).toBeVisible();

    // 2. Female account (Cho)
    await loginAs(page, "cho@aahms.demo");
    await page.goto("/");
    // Must show Female scan badge and NO sex toggle buttons
    await expect(page.getByText(/Female scan/i)).toBeVisible();
    await expect(page.getByRole("button", { name: "Male", exact: true })).toHaveCount(0);
  });

  // ─── TC03: CONTINUOUS MONITORING HISTORY & SCREEN TIME CHARTS ──────────────────
  test("TC03: Continuous Monitoring History & Screen Time Style Interactive Charts", async ({ page }) => {
    await loginAs(page, "vance@aahms.demo");
    await page.goto("/");
    await page.getByRole("button", { name: "My monitoring" }).click();

    // Verify time range switcher
    const btn7d = page.getByRole("button", { name: "7 days", exact: true });
    const btn14d = page.getByRole("button", { name: "14 days", exact: true });
    const btn30d = page.getByRole("button", { name: "30 days", exact: true });
    await expect(btn7d).toBeVisible();
    await expect(btn14d).toBeVisible();
    await expect(btn30d).toBeVisible();

    // Switch to 14 days view
    await btn14d.click();

    // Check Sleep metric section
    const sleepCard = page.locator('section[data-metric="sleep"]');
    await expect(sleepCard).toBeVisible();

    // Check Screen Time horizontal "avg" guideline
    await expect(sleepCard.locator("svg text", { hasText: "avg" })).toBeVisible();

    // Check that historical bars exist and are populated (no empty dashed slots in active history)
    const sleepSvg = sleepCard.locator("svg");
    await expect(sleepSvg).toBeVisible();
    // Verify aria-label confirms full continuous points
    await expect(sleepSvg).toHaveAttribute("aria-label", /last 14 days/);

    // Switch to 7 days view to verify M T W T F S S day initials
    await btn7d.click();
    await expect(sleepCard.locator("svg text", { hasText: /M|T|W|F|S/ })).toBeVisible();

    // Check Apple Screen Time style trend pill or steady indicator
    await expect(page.getByTestId("trend-sleep")).toBeVisible();
    await expect(page.getByTestId("trend-sleep")).toContainText(/Sleep|Steady|average/i);

    // Check "Why we monitor this" NASA citation expansion
    await sleepCard.getByText("Why we monitor this").click();
    await expect(sleepCard.getByText(/NASA sources/i)).toBeVisible();
  });

  // ─── TC04: DAILY SELF-CHECK WIZARD & INSTANT VITALS CLASSIFICATION ─────────────
  test("TC04: Daily Self-Check Wizard & Biometrics Logging Flow", async ({ page }) => {
    await loginAs(page, "vance@aahms.demo");
    await page.goto("/");
    await page.getByRole("button", { name: "Daily check", exact: true }).click();
    await page.getByRole("button", { name: "Start check" }).click();

    // Step 1: Blood pressure
    await page.getByLabel("Systolic (top)").fill("116");
    await page.getByLabel("Diastolic (bottom)").fill("76");
    await expect(page.getByText("116/76 mmHg · NOMINAL")).toBeVisible();
    await page.getByRole("button", { name: "Next →" }).click();

    // Step 2: Blood sugar
    await page.getByLabel("Blood sugar (mg/dL)").fill("90");
    await page.getByRole("button", { name: "Next →" }).click();

    // Step 3: Temperature
    await page.getByLabel("Temperature (°C)").fill("36.8");
    await page.getByRole("button", { name: "Next →" }).click();

    // Step 4: Mood
    await page.getByRole("radio", { name: "Good", exact: true }).click();
    await page.getByRole("button", { name: "Next →" }).click();

    // Step 5: Sleep
    await page.getByLabel("Hours slept last night").fill("7.2");
    await page.getByRole("button", { name: "Next →" }).click();

    // Step 6: Hydration & urine color
    await page.getByLabel("Fluid in the last 24 h (mL)").fill("2400");
    await page.getByRole("radio", { name: /Shade 2 of 8|Shade 3 of 8/i }).first().click();
    await page.getByRole("button", { name: "See results" }).click();

    // Summary screen
    await expect(page.getByText(/All readings in target/i)).toBeVisible();
  });

  // ─── TC05: FLIGHT SURGEON OVERSIGHT DASHBOARD & ALERT ACKNOWLEDGEMENT ─────────
  test("TC05: Flight Surgeon Oversight Dashboard & Mission Group Monitoring", async ({ page }) => {
    await loginAs(page, "surgeon@aahms.demo", SURGEON_PASSWORD);
    await page.goto("/oversight");

    // Flight surgeon sees ground console navigation and mission groups
    await expect(page.getByRole("link", { name: "Crew oversight" })).toBeVisible();
    await expect(page.getByText(/MTV-1|SIM-1/i).first()).toBeVisible();

    // API check for oversight groups
    const groupsRes = await page.request.get("/api/oversight/groups");
    expect(groupsRes.ok()).toBeTruthy();
    const { groups } = await groupsRes.json();
    expect(groups.length).toBeGreaterThan(0);
  });

  // ─── TC06: SPACE MEDICINE DATA APIS CONTRACT VALIDATION ────────────────────────
  test("TC06: Space Medicine & NASA OSDR API Contracts", async ({ page }) => {
    await loginAs(page, "vance@aahms.demo");

    // 1. /api/monitoring/me
    const monRes = await page.request.get("/api/monitoring/me?days=14");
    expect(monRes.ok()).toBeTruthy();
    const monData = await monRes.json();
    expect(monData.days).toBe(14);
    expect(monData.metrics.length).toBe(12);
    expect(monData.rules.length).toBeGreaterThan(0);

    // Check sleep series has 14 points
    const sleepMetric = monData.metrics.find((m: { id: string }) => m.id === "sleep");
    expect(sleepMetric.series.length).toBe(14);
    expect(sleepMetric.series.every((p: { value: number | null }) => p.value !== null)).toBeTruthy();

    // 2. /api/nasa/studies
    const osdrRes = await page.request.get("/api/nasa/studies");
    expect(osdrRes.ok()).toBeTruthy();
    const studies = await osdrRes.json();
    expect(Array.isArray(studies)).toBeTruthy();
    expect(studies.length).toBeGreaterThan(0);
  });
});
