import { execSync } from "node:child_process";
import dotenv from "dotenv";

dotenv.config();

/** Fresh synthetic crew data (and no leftover alerts) before the UI tests. */
export default function globalSetup() {
  if (process.env.SKIP_GLOBAL_SETUP) return;
  try {
    execSync("npx tsx prisma/synthetic.ts --days 30 --seed 1", {
      stdio: "inherit",
      shell: "cmd.exe",
      env: { ...process.env },
    });
  } catch (err) {
    console.warn("globalSetup: synthetic crew already present or seed skipped.");
  }
}
