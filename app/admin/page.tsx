import { Suspense } from "react";
import { redirect } from "next/navigation";
import { homeFor } from "@/lib/auth";
import { currentUser } from "@/lib/authz";
import { AdminConsole } from "@/components/staff/AdminConsole";
import { LoadingScreen } from "@/components/LoadingScreen";

async function AdminGate() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.role !== "SUPER_ADMIN") redirect(homeFor(user.role));
  return <AdminConsole user={{ id: user.id, name: user.name, role: user.role }} />;
}

export default function AdminPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <AdminGate />
    </Suspense>
  );
}
