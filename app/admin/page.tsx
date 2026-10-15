import { AdminDashboard } from "@/features/admin/AdminDashboard";
import { requireAccessUser } from "@/server/auth/access";
import { HttpError } from "@/server/http";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

export const metadata = { title: "Comercial · New Wed", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function Page() {
  try {
    const user = await requireAccessUser(new Request("https://newwed.internal/admin", { headers: await headers() }));
    return <AdminDashboard userName={user.name}/>;
  } catch (error) {
    if (error instanceof HttpError && [401, 403].includes(error.status)) redirect("/admin/login");
    throw error;
  }
}
