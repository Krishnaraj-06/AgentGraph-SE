"use client";

import { useState, useEffect, use } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FolderKanban, Plus, Github, RefreshCw, GitCommit,
  GitPullRequest, CheckCircle2, Clock, ChevronDown, X,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { projectsApi } from "@/lib/projects-api";
import { githubApi, type GitHubRepo, type SyncStatus } from "@/lib/github-api";
import { formatRelativeTime } from "@/lib/utils";
import type { Project } from "@/types";

interface Props {
  params: Promise<{ workspace: string }>;
}

export default function ProjectsPage({ params }: Props) {
  const { workspace } = use(params);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ghConnected, setGhConnected] = useState(false);
  const [ghRepos, setGhRepos] = useState<GitHubRepo[]>([]);
  const [syncStatuses, setSyncStatuses] = useState<Record<string, SyncStatus>>({});
  const [syncing, setSyncing] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<{ id: string; msg: string } | null>(null);

  useEffect(() => {
    Promise.all([
      projectsApi.list(workspace),
      githubApi.status(workspace),
    ]).then(([projs, ghStatus]) => {
      setProjects(projs);
      setGhConnected(ghStatus.connected);
      setLoading(false);
    });
  }, [workspace]);

  // Load sync statuses for all projects
  useEffect(() => {
    projects.forEach((p) => {
      githubApi.syncStatus(workspace, p.id).then((s) => {
        setSyncStatuses((prev) => ({ ...prev, [p.id]: s }));
      });
    });
  }, [projects, workspace]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const project = await projectsApi.create(workspace, { name: newName.trim() });
      setProjects((prev) => [...prev, project]);
      setNewName("");
      setShowCreate(false);
    } catch {
      setError("Failed to create project.");
    } finally {
      setCreating(false);
    }
  };

  const handleLinkRepo = async (projectId: string, repoFullName: string) => {
    await githubApi.linkRepo(workspace, projectId, repoFullName);
    const updated = await projectsApi.list(workspace);
    setProjects(updated);
  };

  const handleSync = async (projectId: string) => {
    setSyncing(projectId);
    setSyncResult(null);
    try {
      const result = await githubApi.triggerSync(workspace, projectId);
      setSyncResult({
        id: projectId,
        msg: `✓ Synced — ${result.commits_ingested} commits, ${result.prs_ingested} PRs ingested.`,
      });
      // Refresh project list and sync status
      const [updatedProjects, status] = await Promise.all([
        projectsApi.list(workspace),
        githubApi.syncStatus(workspace, projectId),
      ]);
      setProjects(updatedProjects);
      setSyncStatuses((prev) => ({ ...prev, [projectId]: status }));
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setSyncResult({ id: projectId, msg: typeof msg === "string" ? msg : "Sync failed." });
    } finally {
      setSyncing(null);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Projects</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Connect GitHub repositories to start ingesting engineering data.
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)} size="sm" className="gap-2">
          <Plus className="h-4 w-4" />
          New Project
        </Button>
      </div>

      {/* Create project form */}
      <AnimatePresence>
        {showCreate && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            <Card className="border-primary/30">
              <CardContent className="pt-4 space-y-3">
                {error && <Alert variant="error">{error}</Alert>}
                <div className="flex gap-2">
                  <Input
                    placeholder="Project name (e.g. Payment Service)"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                    autoFocus
                  />
                  <Button onClick={handleCreate} loading={creating} disabled={!newName.trim()}>
                    Create
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => setShowCreate(false)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* GitHub not connected warning */}
      {!ghConnected && !loading && (
        <Alert variant="warning" title="GitHub not connected">
          Go to Settings → Integrations to connect your GitHub account before linking repos.
        </Alert>
      )}

      {/* Projects list */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <Card key={i}>
              <CardContent className="pt-4 space-y-3">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-3 w-1/2" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : projects.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-20 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 mb-4">
              <FolderKanban className="h-6 w-6 text-primary" />
            </div>
            <h3 className="font-semibold text-base mb-2">No projects yet</h3>
            <p className="text-sm text-muted-foreground max-w-sm">
              Create a project and link it to a GitHub repository to begin ingesting data.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {projects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              workspaceSlug={workspace}
              ghConnected={ghConnected}
              syncStatus={syncStatuses[project.id]}
              syncing={syncing === project.id}
              syncResult={syncResult?.id === project.id ? syncResult.msg : null}
              onSync={() => handleSync(project.id)}
              onLinkRepo={(repo) => handleLinkRepo(project.id, repo)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Project Card ─────────────────────────────────────────────────────────────

interface ProjectCardProps {
  project: Project;
  workspaceSlug: string;
  ghConnected: boolean;
  syncStatus: SyncStatus | undefined;
  syncing: boolean;
  syncResult: string | null;
  onSync: () => void;
  onLinkRepo: (repo: string) => void;
}

function ProjectCard({
  project, workspaceSlug, ghConnected, syncStatus,
  syncing, syncResult, onSync, onLinkRepo,
}: ProjectCardProps) {
  const [showRepoSelect, setShowRepoSelect] = useState(false);
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [repoSearch, setRepoSearch] = useState("");

  const loadRepos = async () => {
    if (repos.length > 0) { setShowRepoSelect(true); return; }
    try {
      const res = await githubApi.connect(workspaceSlug, ""); // won't work — need cached repos
    } catch {}
    setShowRepoSelect(true);
  };

  const fetchRepos = async () => {
    // Re-use status endpoint to get username, then we need repos
    // For now show input for manual entry
    setShowRepoSelect(true);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FolderKanban className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-sm font-semibold">{project.name}</CardTitle>
          </div>
          {project.github_repo_full_name ? (
            <Badge variant="success" className="text-[11px]">
              <Github className="h-3 w-3 mr-1" />
              {project.github_repo_full_name}
            </Badge>
          ) : (
            <Badge variant="outline" className="text-[11px]">No repo linked</Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Sync stats */}
        {syncStatus && project.github_repo_full_name && (
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <GitCommit className="h-3.5 w-3.5" />
              {syncStatus.commit_count} commits
            </span>
            <span className="flex items-center gap-1.5">
              <GitPullRequest className="h-3.5 w-3.5" />
              {syncStatus.pr_count} PRs
            </span>
            {syncStatus.synced_at && (
              <span className="flex items-center gap-1.5 ml-auto">
                <Clock className="h-3.5 w-3.5" />
                Last synced {formatRelativeTime(syncStatus.synced_at)}
              </span>
            )}
          </div>
        )}

        {/* Sync result message */}
        {syncResult && (
          <Alert variant={syncResult.includes("failed") ? "error" : "success"}>
            {syncResult}
          </Alert>
        )}

        {/* Link repo input */}
        <AnimatePresence>
          {showRepoSelect && !project.github_repo_full_name && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="flex gap-2"
            >
              <Input
                placeholder="owner/repository (e.g. octocat/hello-world)"
                value={repoSearch}
                onChange={(e) => setRepoSearch(e.target.value)}
                className="font-mono text-xs"
              />
              <Button
                size="sm"
                onClick={() => { onLinkRepo(repoSearch.trim()); setShowRepoSelect(false); }}
                disabled={!repoSearch.trim().includes("/")}
              >
                Link
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowRepoSelect(false)}>
                <X className="h-4 w-4" />
              </Button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Actions */}
        <div className="flex gap-2">
          {!project.github_repo_full_name && ghConnected && (
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => setShowRepoSelect(true)}
            >
              <Github className="h-3.5 w-3.5" />
              Link GitHub Repo
            </Button>
          )}
          {project.github_repo_full_name && (
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={onSync}
              disabled={syncing}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
              {syncing ? "Syncing..." : syncStatus?.synced_at ? "Re-sync" : "Sync Now"}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
