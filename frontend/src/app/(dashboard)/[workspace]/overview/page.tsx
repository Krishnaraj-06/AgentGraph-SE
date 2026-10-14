"use client";

import { use } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  GitCommit, GitPullRequest, AlertTriangle, CheckCircle2,
  FolderKanban, Users, Clock, Zap, ArrowRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SkeletonCard } from "@/components/ui/skeleton";
import { overviewApi } from "@/lib/overview-api";
import { formatRelativeTime } from "@/lib/utils";
import Link from "next/link";

interface Props {
  params: Promise<{ workspace: string }>;
}

export default function OverviewPage({ params }: Props) {
  const { workspace } = use(params);

  const { data, isLoading } = useQuery({
    queryKey: ["overview", workspace],
    queryFn: () => overviewApi.getStats(workspace),
    refetchInterval: 30_000,
  });

  const hasData = !!(data && data.total_commits > 0);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Project Intelligence</h2>
        <p className="text-sm text-muted-foreground mt-1">
          {hasData
            ? "Live engineering overview across all connected repositories."
            : "Connect GitHub and Jira to start generating engineering insights."}
        </p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
        ) : (
          <>
            <StatCard
              label="Commits (7d)"
              value={data?.commits_7d ?? 0}
              sub={`${data?.total_commits ?? 0} total`}
              icon={GitCommit}
              active={hasData}
            />
            <StatCard
              label="Open PRs"
              value={data?.open_prs ?? 0}
              sub={`${data?.merged_prs ?? 0} merged`}
              icon={GitPullRequest}
              active={hasData}
            />
            <StatCard
              label="Projects"
              value={data?.total_projects ?? 0}
              sub={`${data?.synced_projects ?? 0} synced`}
              icon={FolderKanban}
              active={hasData}
            />
            <StatCard
              label="Contributors"
              value={data?.top_contributors.length ?? 0}
              sub="active developers"
              icon={Users}
              active={hasData}
            />
          </>
        )}
      </div>

      {!hasData && !isLoading ? (
        /* Empty state */
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 mb-4">
              <Zap className="h-6 w-6 text-primary" />
            </div>
            <h3 className="font-semibold text-base mb-2">No project connected yet</h3>
            <p className="text-sm text-muted-foreground max-w-sm">
              Connect a GitHub repository and Jira project to start building your Engineering
              Knowledge Graph and unlock AI-powered insights.
            </p>
            <div className="flex gap-3 mt-6">
              <Link
                href={`/${workspace}/settings`}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Connect GitHub
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href={`/${workspace}/projects`}
                className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium hover:bg-accent transition-colors"
              >
                View Projects
              </Link>
            </div>
          </CardContent>
        </Card>
      ) : hasData ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Recent commits */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <GitCommit className="h-4 w-4 text-muted-foreground" />
                Recent Commits
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.recent_commits.length === 0 ? (
                <p className="text-sm text-muted-foreground">No commits yet.</p>
              ) : (
                data.recent_commits.map((c, i) => (
                  <motion.div
                    key={c.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.04 }}
                    className="flex items-start gap-3 py-2 border-b last:border-0"
                  >
                    <code className="text-[11px] font-mono bg-muted px-1.5 py-0.5 rounded text-muted-foreground shrink-0 mt-0.5">
                      {c.sha}
                    </code>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{c.message}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {c.author} · {formatRelativeTime(c.committed_at)}
                        {c.project_name && (
                          <span className="ml-1.5 text-primary/70">· {c.project_name}</span>
                        )}
                      </p>
                    </div>
                  </motion.div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Top contributors + PR breakdown */}
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  Top Contributors
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {data.top_contributors.map((c, i) => (
                  <div key={c.name} className="flex items-center gap-3">
                    <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                      {c.name[0]?.toUpperCase()}
                    </div>
                    <span className="text-sm flex-1 truncate">{c.name}</span>
                    <Badge variant="secondary" className="text-xs">
                      {c.commits} commits
                    </Badge>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <GitPullRequest className="h-4 w-4 text-muted-foreground" />
                  Pull Request Status
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {data.pr_breakdown.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No pull requests yet.</p>
                ) : (
                  data.pr_breakdown.map((pr) => (
                    <div key={pr.state} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className={`h-2 w-2 rounded-full ${
                            pr.state === "open"
                              ? "bg-green-500"
                              : pr.state === "merged"
                              ? "bg-purple-500"
                              : "bg-gray-400"
                          }`}
                        />
                        <span className="text-sm capitalize">{pr.state}</span>
                      </div>
                      <Badge variant="outline">{pr.count}</Badge>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function StatCard({
  label, value, sub, icon: Icon, active,
}: {
  label: string;
  value: number;
  sub: string;
  icon: React.ElementType;
  active: boolean;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">
          {active ? value : "—"}
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          {active ? sub : "No data"}
        </p>
      </CardContent>
    </Card>
  );
}
