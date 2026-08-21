"use client";

import { use } from "react";
import { GitHubConnectCard } from "@/components/dashboard/github-connect-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, KeyRound } from "lucide-react";

interface Props {
  params: Promise<{ workspace: string }>;
}

export default function SettingsPage({ params }: Props) {
  const { workspace } = use(params);

  return (
    <div className="space-y-6 animate-fade-in max-w-2xl">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Settings</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Manage integrations, team members, and workspace configuration.
        </p>
      </div>

      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Integrations
        </h3>
        <GitHubConnectCard workspaceSlug={workspace} />

        {/* Jira — coming soon */}
        <Card className="opacity-60">
          <CardHeader className="pb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#0052CC] text-white text-xs font-bold">
                J
              </div>
              <div>
                <CardTitle className="text-sm font-semibold">Jira</CardTitle>
                <p className="text-xs text-muted-foreground">Coming soon</p>
              </div>
            </div>
          </CardHeader>
        </Card>
      </div>

      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Workspace
        </h3>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              Team Members
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Team member management coming soon.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-muted-foreground" />
              API Keys
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              API key management coming soon.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
