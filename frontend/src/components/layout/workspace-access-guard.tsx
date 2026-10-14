"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { authApi } from "@/lib/auth-api";

interface WorkspaceAccessGuardProps {
  children: React.ReactNode;
  workspaceSlug: string;
}

export function WorkspaceAccessGuard({
  children,
  workspaceSlug,
}: WorkspaceAccessGuardProps) {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    authApi.listWorkspaces()
      .then((workspaces) => {
        if (!active) return;

        if (workspaces.some((workspace) => workspace.slug === workspaceSlug)) {
          setAuthorized(true);
          return;
        }

        const nextPath = workspaces.length > 0
          ? `/${workspaces[0].slug}/overview`
          : "/workspace";
        router.replace(nextPath);
      })
      .catch((err: unknown) => {
        if (!active) return;

        const status = (err as { response?: { status?: number } })
          ?.response?.status;
        if (status === 401 || status === 403) {
          router.replace("/login");
          return;
        }

        setError("Could not verify workspace access. Please try again.");
      });

    return () => {
      active = false;
    };
  }, [router, workspaceSlug]);

  if (authorized) return children;

  if (error) {
    return (
      <div className="mx-auto mt-8 max-w-lg">
        <Alert variant="error">{error}</Alert>
      </div>
    );
  }

  return (
    <div className="flex min-h-64 items-center justify-center">
      <span className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      <span className="sr-only">Checking workspace access</span>
    </div>
  );
}
