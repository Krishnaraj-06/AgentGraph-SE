"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Github, CheckCircle2, ChevronDown, ChevronUp, Lock, Star, ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { githubApi, type GitHubRepo, type GitHubConnectResponse } from "@/lib/github-api";
import { formatRelativeTime } from "@/lib/utils";

interface GitHubConnectCardProps {
  workspaceSlug: string;
}

export function GitHubConnectCard({ workspaceSlug }: GitHubConnectCardProps) {
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [username, setUsername] = useState<string | null>(null);
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [showRepos, setShowRepos] = useState(false);

  useEffect(() => {
    githubApi.status(workspaceSlug).then((s) => {
      if (s.connected) {
        setConnected(true);
        setUsername(s.github_username ?? null);
      }
    });
  }, [workspaceSlug]);

  const handleConnect = async () => {
    if (!token.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res: GitHubConnectResponse = await githubApi.connect(workspaceSlug, token.trim());
      setConnected(true);
      setUsername(res.github_username);
      setRepos(res.repos);
      setShowRepos(true);
      setToken("");
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(typeof msg === "string" ? msg : "Failed to connect GitHub. Check your token.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#24292e] text-white">
            <Github className="h-5 w-5" />
          </div>
          <div>
            <CardTitle className="text-sm font-semibold">GitHub</CardTitle>
            <CardDescription className="text-xs">
              Connect via Personal Access Token
            </CardDescription>
          </div>
          {connected && (
            <Badge variant="success" className="ml-auto">
              <CheckCircle2 className="h-3 w-3 mr-1" />
              Connected
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {connected && username && (
          <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2">
            <Github className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">@{username}</span>
            <button
              onClick={() => setConnected(false)}
              className="ml-auto text-xs text-muted-foreground hover:text-destructive transition-colors"
            >
              Reconnect
            </button>
          </div>
        )}

        {!connected && (
          <>
            <Alert variant="info">
              Create a token at{" "}
              <a
                href="https://github.com/settings/tokens/new"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium underline underline-offset-2"
              >
                github.com/settings/tokens
              </a>{" "}
              with <strong>repo</strong> and <strong>read:user</strong> scopes.
            </Alert>

            {error && <Alert variant="error">{error}</Alert>}

            <div className="flex gap-2">
              <Input
                type="password"
                placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleConnect()}
                className="font-mono text-xs"
              />
              <Button onClick={handleConnect} loading={loading} disabled={!token.trim()}>
                Connect
              </Button>
            </div>
          </>
        )}

        {/* Repo list */}
        {repos.length > 0 && (
          <div>
            <button
              onClick={() => setShowRepos((v) => !v)}
              className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              {showRepos ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              {repos.length} repositories accessible
            </button>

            <AnimatePresence>
              {showRepos && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="mt-3 space-y-1.5 max-h-64 overflow-y-auto pr-1">
                    {repos.map((repo) => (
                      <div
                        key={repo.full_name}
                        className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-accent transition-colors"
                      >
                        {repo.private ? (
                          <Lock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        ) : (
                          <Github className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        )}
                        <span className="font-medium truncate flex-1">{repo.full_name}</span>
                        {repo.stars > 0 && (
                          <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
                            <Star className="h-3 w-3" />
                            {repo.stars}
                          </span>
                        )}
                        <a
                          href={`https://github.com/${repo.full_name}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
