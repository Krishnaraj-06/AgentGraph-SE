import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { WorkspaceAccessGuard } from "@/components/layout/workspace-access-guard";

interface DashboardLayoutProps {
  children: React.ReactNode;
  params: Promise<{ workspace: string }>;
}

export default async function DashboardLayout({ children, params }: DashboardLayoutProps) {
  const { workspace } = await params;

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar workspaceSlug={workspace} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header title="AgentGraph-SE" />
        <main className="flex-1 overflow-y-auto p-6">
          <WorkspaceAccessGuard workspaceSlug={workspace}>
            {children}
          </WorkspaceAccessGuard>
        </main>
      </div>
    </div>
  );
}
