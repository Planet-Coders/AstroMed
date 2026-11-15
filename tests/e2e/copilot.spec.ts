import { expect, test } from "@playwright/test";
import { testEmail } from "./testAccounts";

test("the onboard chat changes topics and starts a clean transcript", async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, "gpu", { value: undefined }));
  const login = await page.request.post("/api/auth/login", {
    data: { email: "john@aahms.demo", password: "aahms2025" },
  });
  expect(login.ok()).toBeTruthy();
  await page.goto("/");
  await page.getByRole("button", { name: "Ask co-pilot", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Flight Surgeon Co-Pilot chat" });
  const input = dialog.getByRole("textbox", { name: "Question for the co-pilot" });
  const replies = dialog.locator('[data-chat-role="assistant"]');
  await input.fill("Why does hydration affect kidney stone risk?");
  await input.press("Enter");
  await expect(replies.last()).toContainText("NTRS 20240012429");
  await input.fill("Why does sleep loss affect performance?");
  await input.press("Enter");
  await expect(replies).toHaveCount(2);
  await expect(replies.last()).toContainText("NTRS 20160003864");
  await expect(replies.last()).not.toContainText("kidney");
  await expect(replies.last()).toContainText("For John");
  await dialog.getByRole("button", { name: "New chat" }).click();
  await expect(dialog.locator("[data-chat-role]")).toHaveCount(0);
  await expect(input).toBeEmpty();
  await input.fill("What did my last Daily Check record?");
  await input.press("Enter");
  await expect(replies).toHaveCount(1);
  await expect(replies.last()).not.toContainText("sleep loss");
});

test("the co-pilot reads the signed-in user's synced Daily Check and restores the chat after a reload", async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, "gpu", {
    value: { requestAdapter: () => new Promise(() => {}) },
  }));
  const endpoint = "/api/health/reports/latest-self-check";
  expect((await page.request.get(endpoint)).status()).toBe(401);

  const login = await page.request.post("/api/auth/login", {
    data: { email: testEmail("check"), password: "aahms2025" },
  });
  expect(login.ok()).toBeTruthy();
  const at = Date.now() - 60_000;
  const report = await page.request.post("/api/health/reports", {
    data: {
      reports: [
        {
          id: String(at), kind: "selfCheck", key: String(at), recordedAt: Date.now(),
          data: {
            at, values: { systolic: 116, diastolic: 76, glucose: 92, fasting: true, sleepHours: 7.2, fluidMl: 1700 },
            skipped: ["temperature", "mood"],
          },
        },
        {
          id: String(at - 1000), kind: "selfCheck", key: String(at - 1000), recordedAt: Date.now(),
          data: { at: at - 1000, values: { systolic: 156, diastolic: 97 } },
        },
      ],
    },
  });
  expect(report.ok()).toBeTruthy();
  expect((await report.json()).saved).toHaveLength(2);

  await page.goto("/");
  const openChat = page.getByRole("button", { name: "Ask co-pilot", exact: true });
  await openChat.click();
  const dialog = page.getByRole("dialog", { name: "Flight Surgeon Co-Pilot chat" });
  const input = dialog.getByRole("textbox", { name: "Question for the co-pilot" });
  await expect(dialog.getByRole("button", { name: "Start on-device AI" })).toBeVisible();
  await input.fill("What did my last Daily Check record?");
  await input.press("Enter");
  const reply = dialog.locator('[data-chat-role="assistant"][data-chat-mode="record"]');
  for (const value of ["116/76 mmHg", "92 mg/dL fasting", "7.2 h", "1700 mL", "No reading recorded for Body temperature, Mood."]) {
    await expect(reply).toContainText(value);
  }
  await expect(reply).not.toContainText("156/97");
  await dialog.getByRole("button", { name: "Start on-device AI" }).click();
  await dialog.getByRole("button", { name: "Use Basic mode" }).click();
  await expect(page.getByText("Basic mode selected")).toBeVisible();

  await page.reload();
  await openChat.click();
  await expect(reply).toContainText("116/76 mmHg");
  await expect(dialog.getByRole("button", { name: "Use on-device AI" })).toBeVisible();
  await input.fill("Why does hydration affect kidney stone risk?");
  await input.press("Enter");
  await expect(dialog.locator('[data-chat-role="assistant"][data-chat-mode="basic"]')).toContainText("NTRS 20240012429");
  await dialog.getByRole("button", { name: "Use on-device AI" }).click();
  await expect(dialog.getByRole("button", { name: "Use Basic mode" })).toBeVisible();
  await dialog.getByRole("button", { name: "New chat" }).click();
  await page.reload();
  await openChat.click();
  await expect(dialog.locator("[data-chat-role]")).toHaveCount(0);
});
