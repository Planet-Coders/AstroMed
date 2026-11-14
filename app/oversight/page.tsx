import { Suspense } from "react";
import { redirect } from "next/navigation";
import { homeFor } from "@/lib/auth";
import { currentUser } from "@/lib/authz";
import { OversightConsole } from "@/components/staff/OversightConsole";
import { LoadingScreen } from "@/components/LoadingScreen";

async function OversightGate() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.role !== "OVERSIGHT" && user.role !== "SUPER_ADMIN") redirect(homeFor(user.role));
  return <OversightConsole user={{ id: user.id, name: user.name, role: user.role }} />;
}

export default function OversightPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <OversightGate />
    </Suspense>
  );
}
