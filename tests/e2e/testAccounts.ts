/**
 * Throwaway guest accounts made by the e2e tests (demo login creates them on first sign-in).
 * They live in whatever database the dev server uses, often the shared one, so the global
 * teardown deletes every account matching this pattern after the run.
 */
export const TEST_ACCOUNT = /^(check|replay|water-retry)-\d{13}@aahms\.demo$/;

export function testEmail(prefix: "check" | "replay" | "water-retry") {
  return `${prefix}-${Date.now()}@aahms.demo`;
}
