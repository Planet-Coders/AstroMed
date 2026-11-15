import { expect, test } from "@playwright/test";

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
