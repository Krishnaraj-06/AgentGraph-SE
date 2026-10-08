"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import axios from "axios";
import { GitPullRequest, Network, RefreshCw } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { graphApi, type GraphNode, type GraphRelationship, type ProjectGraph } from "@/lib/graph-api";
import { projectsApi } from "@/lib/projects-api";
import type { Project } from "@/types";

interface Props {
  params: Promise<{ workspace: string }>;
  searchParams: Promise<{ project?: string }>;
}

export default function GraphPage({ params, searchParams }: Props) {
  const { workspace } = use(params);
  const { project: requestedProjectId } = use(searchParams);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [graph, setGraph] = useState<ProjectGraph | null>(null);
  const [graphLoading, setGraphLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;
    projectsApi.list(workspace)
      .then((items) => {
        if (!active) return;
        setProjects(items);
        const requestedProject = items.find((project) => project.id === requestedProjectId);
        setSelectedProjectId(requestedProject?.id ?? items[0]?.id ?? "");
      })
      .catch(() => {
        if (active) setError("Could not load projects for this workspace.");
      })
      .finally(() => {
        if (active) setProjectsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [workspace, requestedProjectId]);

  useEffect(() => {
    if (!selectedProjectId) {
      setGraph(null);
      setSelectedNode(null);
      return;
    }

    let active = true;
    setGraphLoading(true);
    setError(null);
    setSelectedNode(null);
    graphApi.getGraph(workspace, selectedProjectId)
      .then((result) => {
        if (active) setGraph(result);
      })
      .catch((err: unknown) => {
        if (!active) return;
        const detail = axios.isAxiosError<{ detail?: string }>(err)
          ? err.response?.data?.detail
          : undefined;
        setError(detail ?? "Could not load this project's graph.");
        setGraph(null);
      })
      .finally(() => {
        if (active) setGraphLoading(false);
      });

    return () => {
      active = false;
    };
  }, [workspace, selectedProjectId, refreshKey]);

  const selectedProject = projects.find((project) => project.id === selectedProjectId);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Engineering Knowledge Graph</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Explore the developers, commits, files, branches, and pull requests in a project.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="graph-project" className="text-sm font-medium">
            Project
          </label>
          <select
            id="graph-project"
            value={selectedProjectId}
            onChange={(event) => setSelectedProjectId(event.target.value)}
            disabled={projectsLoading || projects.length === 0}
            className="h-9 min-w-48 rounded-md border bg-background px-3 text-sm"
          >
            {projects.length === 0 && <option value="">No projects</option>}
            {projects.map((project) => (
              <option key={project.id} value={project.id}>{project.name}</option>
            ))}
          </select>
          <Button
            variant="outline"
            size="icon"
            aria-label="Refresh graph"
            title="Refresh graph"
            disabled={!selectedProjectId || graphLoading}
            onClick={() => setRefreshKey((current) => current + 1)}
          >
            <RefreshCw className={`h-4 w-4 ${graphLoading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {error && <Alert variant="error">{error}</Alert>}

      {projectsLoading ? (
        <Card>
          <CardContent className="space-y-4 p-6">
            <Skeleton className="h-8 w-1/3" />
            <Skeleton className="h-96 w-full" />
          </CardContent>
        </Card>
      ) : projects.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center py-20 text-center">
            <Network className="mb-4 h-8 w-8 text-primary" />
            <h3 className="font-semibold">No projects in this workspace</h3>
            <p className="mt-2 max-w-sm text-sm text-muted-foreground">
              Create a project, link a GitHub repository, sync its data, and build its graph.
            </p>
            <Button asChild className="mt-5">
              <Link href={`/${workspace}/projects`}>Go to Projects</Link>
            </Button>
          </CardContent>
        </Card>
      ) : graphLoading ? (
        <Card>
          <CardContent className="space-y-4 p-6">
            <Skeleton className="h-8 w-1/3" />
            <Skeleton className="h-96 w-full" />
          </CardContent>
        </Card>
      ) : graph && graph.nodes.length > 0 ? (
        <GraphVisualization
          graph={graph}
          projectName={selectedProject?.name ?? "Project"}
          selectedNode={selectedNode}
          onSelectNode={setSelectedNode}
        />
      ) : (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center py-20 text-center">
            <GitPullRequest className="mb-4 h-8 w-8 text-primary" />
            <h3 className="font-semibold">No graph found for this project</h3>
            <p className="mt-2 max-w-md text-sm text-muted-foreground">
              Sync the project&apos;s GitHub data, then select <strong>Build Graph</strong> on
              the Projects page. The finished graph will appear here.
            </p>
            <Button asChild className="mt-5">
              <Link href={`/${workspace}/projects`}>Go to Projects</Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

interface GraphVisualizationProps {
  graph: ProjectGraph;
  projectName: string;
  selectedNode: GraphNode | null;
  onSelectNode: (node: GraphNode | null) => void;
}

const nodeColors: Record<string, string> = {
  Project: "#f59e0b",
  Developer: "#3b82f6",
  Commit: "#8b5cf6",
  PullRequest: "#10b981",
  Branch: "#06b6d4",
  File: "#64748b",
};

function GraphVisualization({
  graph,
  projectName,
  selectedNode,
  onSelectNode,
}: GraphVisualizationProps) {
  const { positions, width, height } = useMemo(() => {
    const groups = new Map<string, GraphNode[]>();
    const preferredOrder = ["Project", "Developer", "Commit", "PullRequest", "Branch", "File"];

    for (const node of graph.nodes) {
      const group = groups.get(node.label) ?? [];
      group.push(node);
      groups.set(node.label, group);
    }

    const labels = [
      ...preferredOrder.filter((label) => groups.has(label)),
      ...[...groups.keys()].filter((label) => !preferredOrder.includes(label)).sort(),
    ];
    const width = Math.max(1000, labels.length * 220 + 480);
    const tallestColumn = Math.max(1, ...labels.map((label) => groups.get(label)!.length));
    const height = Math.max(560, tallestColumn * 72 + 80);
    const positions = new Map<string, { x: number; y: number }>();

    labels.forEach((label, column) => {
      const nodes = groups.get(label)!;
      nodes.forEach((node, row) => {
        positions.set(node.id, {
          x: 100 + column * 220,
          y: ((row + 1) * height) / (nodes.length + 1),
        });
      });
    });

    return { positions, width, height };
  }, [graph.nodes]);

  const visibleRelationships = graph.relationships.filter(
    (relationship) => positions.has(relationship.source) && positions.has(relationship.target)
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-2 p-4 text-sm">
          <span className="font-medium">{projectName}</span>
          <span className="text-muted-foreground">{graph.nodes.length} nodes</span>
          <span className="text-muted-foreground">{visibleRelationships.length} relationships</span>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {Object.entries(nodeColors).map(([label, color]) => (
              <span key={label} className="flex items-center gap-1.5 text-muted-foreground">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
                {label}
              </span>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="max-h-[70vh] overflow-auto rounded-xl">
            <svg
              aria-label={`${projectName} knowledge graph`}
              role="img"
              viewBox={`0 0 ${width} ${height}`}
              width={width}
              height={height}
              className="max-w-none"
            >
              <defs>
                <marker
                  id="graph-arrow"
                  viewBox="0 0 10 10"
                  refX="9"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8" />
                </marker>
              </defs>
              {visibleRelationships.map((relationship, index) => {
                const source = positions.get(relationship.source)!;
                const target = positions.get(relationship.target)!;
                return (
                  <line
                    key={`${relationship.source}-${relationship.type}-${relationship.target}-${index}`}
                    x1={source.x}
                    y1={source.y}
                    x2={target.x}
                    y2={target.y}
                    stroke="#94a3b8"
                    strokeOpacity="0.45"
                    strokeWidth="1.5"
                    markerEnd="url(#graph-arrow)"
                  >
                    <title>{relationship.type}</title>
                  </line>
                );
              })}
              {graph.nodes.map((node) => {
                const position = positions.get(node.id);
                if (!position) return null;
                const active = selectedNode?.id === node.id;
                return (
                  <g
                    key={node.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`${node.label}: ${node.title}`}
                    onClick={() => onSelectNode(active ? null : node)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onSelectNode(active ? null : node);
                      }
                    }}
                    className="cursor-pointer"
                  >
                    <title>{node.label}: {node.title}</title>
                    <circle
                      cx={position.x}
                      cy={position.y}
                      r={active ? 11 : 8}
                      fill={nodeColors[node.label] ?? "#64748b"}
                      stroke={active ? "#0f172a" : "#ffffff"}
                      strokeWidth={active ? 3 : 2}
                    />
                    <text
                      x={position.x + 15}
                      y={position.y + 4}
                      fill="currentColor"
                      fontSize="12"
                    >
                      {node.title.length > 30 ? `${node.title.slice(0, 27)}...` : node.title}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        </CardContent>
      </Card>

      {selectedNode && (
        <Card>
          <CardContent className="flex items-center justify-between gap-4 p-4">
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {selectedNode.label}
              </p>
              <p className="truncate text-sm font-medium" title={selectedNode.title}>
                {selectedNode.title}
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => onSelectNode(null)}>
              Clear selection
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
