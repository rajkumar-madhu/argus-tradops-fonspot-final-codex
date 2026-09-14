import Shell from "@/components/Shell";
import TenantAdmin from "@/components/TenantAdmin";

export const dynamic = "force-dynamic";

// super_admin only: middleware.ts guards the route (lib/auth-routing.ts lists it),
// and every /api/admin/tenants call is refused server-side for anyone else.
export default function Page() {
  return (
    <Shell>
      <TenantAdmin />
    </Shell>
  );
}
