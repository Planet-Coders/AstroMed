import { execSync } from "node:child_process";

/** Fresh synthetic crew data (and no leftover alerts) before the UI tests. */
export default function globalSetup() {
  execSync("npx tsx prisma/synthetic.ts --days 30 --seed 1", { stdio: "inherit" });
}
