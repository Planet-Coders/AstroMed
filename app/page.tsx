import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSession, homeFor } from "@/lib/auth";
import { SuperAdminDashboard } from "@/components/SuperAdminDashboard";
import { LoadingScreen } from "@/components/LoadingScreen";

async function ConsoleGate() {
  const session = await getSession();
  if (!session) redirect("/login");
  // Admin and oversight accounts have their own consoles.
  if (homeFor(session.role) !== "/") redirect(homeFor(session.role));
  return <SuperAdminDashboard user={session} />;
}

export default function Home() {
  return (
    <Suspense
      fallback={<LoadingScreen />}
    >
      <ConsoleGate />
    </Suspense>
  );
}
