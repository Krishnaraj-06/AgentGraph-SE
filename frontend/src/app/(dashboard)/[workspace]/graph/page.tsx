"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import axios from "axios";
import {
  CircleDot,
  FileCode2,
  GitBranch,
  GitCommit,
  GitPullRequest,
  Network,
  RefreshCw,
  Search,
  UserRound,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { graphApi, type GraphNode, type ProjectGraph } from "@/lib/graph-api";
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
          key={graph.project_id}
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

const nodeStyles: Record<string, { color: string; background: string; icon: typeof CircleDot }> = {
  Project: { color: "#d97706", background: "#fffbeb", icon: Network },
  Developer: { color: "#2563eb", background: "#eff6ff", icon: UserRound },
  Commit: { color: "#7c3aed", background: "#f5f3ff", icon: GitCommit },
  PullRequest: { color: "#059669", background: "#ecfdf5", icon: GitPullRequest },
  Branch: { color: "#0891b2", background: "#ecfeff", icon: GitBranch },
  File: { color: "#475569", background: "#f1f5f9", icon: FileCode2 },
};

const relationshipColors: Record<string, string> = {
  AUTHORED: "#2563eb",
  MODIFIED: "#7c3aed",
  REVIEWED: "#db2777",
  CREATED_PR: "#059669",
  MERGED_PR: "#0d9488",
  BELONGS_TO: "#d97706",
  TARGETS_BRANCH: "#0891b2",
  FROM_BRANCH: "#4f46e5",
  INCLUDES_COMMIT: "#9333ea",
  CHANGED_IN: "#ea580c",
  WORKED_WITH: "#e11d48",
};

const initialNodesPerLane = 8;
const laneWidth = 236;
const laneGap = 64;
const nodeHeight = 54;
const nodeGap = 18;
const laneTop = 92;

function GraphVisualization({
  graph,
  projectName,
  selectedNode,
  onSelectNode,
}: GraphVisualizationProps) {
  const [search, setSearch] = useState("");
  const [enabledTypes, setEnabledTypes] = useState<Set<string>>(
    () => new Set(graph.nodes.map((node) => node.label))
  );
  const [expandedCounts, setExpandedCounts] = useState<Record<string, number>>({});
  const [zoom, setZoom] = useState(1);

  const relationshipTypes = useMemo(
    () => [...new Set(graph.relationships.map((relationship) => relationship.type))].sort(),
    [graph.relationships]
  );
  const groupedNodes = useMemo(() => {
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

    for (const nodes of groups.values()) {
      nodes.sort((a, b) => a.title.localeCompare(b.title));
    }
    return labels.map((label) => ({ label, nodes: groups.get(label)! }));
  }, [graph.nodes]);

  const matchingNodes = useMemo(
    () => groupedNodes.map(({ label, nodes }) => ({
      label,
      nodes: enabledTypes.has(label)
        ? nodes.filter((node) => node.title.toLowerCase().includes(search.trim().toLowerCase()))
        : [],
      total: nodes.length,
    })),
    [enabledTypes, groupedNodes, search]
  );

  const visibleNodes = useMemo(
    () => matchingNodes.flatMap(({ label, nodes }) => (
      nodes.slice(0, expandedCounts[label] ?? initialNodesPerLane)
    )),
    [expandedCounts, matchingNodes]
  );
  const visibleNodeIds = useMemo(
    () => new Set(visibleNodes.map((node) => node.id)),
    [visibleNodes]
  );
  const lanesWithNodes = useMemo(
    () => matchingNodes.filter(({ nodes }) => nodes.length > 0),
    [matchingNodes]
  );
  const positions = useMemo(() => {
    const result = new Map<string, { x: number; y: number }>();
    lanesWithNodes.forEach(({ label, nodes }, laneIndex) => {
      const x = 28 + laneIndex * (laneWidth + laneGap);
      const count = expandedCounts[label] ?? initialNodesPerLane;
      nodes.slice(0, count).forEach((node, rowIndex) => {
        result.set(node.id, {
          x,
          y: laneTop + rowIndex * (nodeHeight + nodeGap),
        });
      });
    });
    return result;
  }, [expandedCounts, lanesWithNodes]);
  const laneHeight = Math.max(
    260,
    ...lanesWithNodes.map(({ label, nodes }) => {
      const count = Math.min(nodes.length, expandedCounts[label] ?? initialNodesPerLane);
      const hasMore = count < nodes.length;
      return laneTop + count * (nodeHeight + nodeGap) + (hasMore ? 76 : 28);
    })
  );
  const width = Math.max(
    900,
    56 + lanesWithNodes.length * (laneWidth + laneGap) - laneGap
  );
  const height = laneHeight + 36;

  const visibleRelationships = graph.relationships.filter(
    (relationship) => visibleNodeIds.has(relationship.source)
      && visibleNodeIds.has(relationship.target)
  );
  const selectedConnections = selectedNode
    ? graph.relationships.filter(
      (relationship) => relationship.source === selectedNode.id
        || relationship.target === selectedNode.id
    )
    : [];
  const connectionCount = new Set(
    selectedConnections.map((relationship) => (
      relationship.source === selectedNode?.id ? relationship.target : relationship.source
    ))
  ).size;

  const toggleType = (label: string) => {
    setEnabledTypes((current) => {
      const next = new Set(current);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  const showMore = (label: string, total: number) => {
    setExpandedCounts((current) => ({
      ...current,
      [label]: Math.min(current[label] ?? initialNodesPerLane, total) + initialNodesPerLane,
    }));
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { label: "Entities", value: graph.nodes.length },
          { label: "Relationships", value: graph.relationships.length },
          { label: "Entity types", value: groupedNodes.length },
        ].map((metric) => (
          <Card key={metric.label}>
            <CardContent className="flex items-center justify-between p-4">
              <span className="text-sm text-muted-foreground">{metric.label}</span>
              <span className="text-xl font-semibold tabular-nums">{metric.value}</span>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold">{projectName} graph map</h3>
              <p className="text-xs text-muted-foreground">
                Select an entity to highlight its connections.
              </p>
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                aria-label="Search graph entities"
                placeholder="Search entities..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="h-9 w-full rounded-md border bg-background pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {groupedNodes.map(({ label, nodes }) => {
              const style = nodeStyles[label] ?? {
                color: "#475569",
                background: "#f1f5f9",
                icon: CircleDot,
              };
              const Icon = style.icon;
              const active = enabledTypes.has(label);
              return (
                <button
                  key={label}
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggleType(label)}
                  className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-opacity ${active ? "opacity-100" : "opacity-40"}`}
                  style={{
                    color: style.color,
                    backgroundColor: style.background,
                    borderColor: `${style.color}40`,
                  }}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                  <span className="rounded-full bg-white/70 px-1.5 py-0.5 tabular-nums">
                    {nodes.length}
                  </span>
                </button>
              );
            })}
          </div>

          {relationshipTypes.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 border-t pt-3">
              <span className="mr-1 text-xs font-medium text-muted-foreground">
                Relationship types
              </span>
              {relationshipTypes.map((type) => (
                <span
                  key={type}
                  className="inline-flex items-center gap-1.5 rounded-full border bg-background px-2.5 py-1 text-[11px] text-muted-foreground"
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: relationshipColors[type] ?? "#64748b" }}
                  />
                  {type.replaceAll("_", " ").toLowerCase()}
                </span>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
            <p className="text-xs text-muted-foreground">
              Showing {visibleNodes.length} of {graph.nodes.length} entities
              {" · "}{visibleRelationships.length} visible connections
            </p>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Zoom</span>
              <Button
                variant="outline"
                size="icon"
                aria-label="Zoom out"
                disabled={zoom <= 0.6}
                onClick={() => setZoom((current) => Math.max(0.6, current - 0.1))}
              >
                <ZoomOut className="h-4 w-4" />
              </Button>
              <span className="w-12 text-center text-xs tabular-nums">
                {Math.round(zoom * 100)}%
              </span>
              <Button
                variant="outline"
                size="icon"
                aria-label="Zoom in"
                disabled={zoom >= 1.5}
                onClick={() => setZoom((current) => Math.min(1.5, current + 0.1))}
              >
                <ZoomIn className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setZoom(1)}>
                Reset
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <div className="max-h-[72vh] overflow-auto bg-slate-50/70 dark:bg-slate-950/30">
            {lanesWithNodes.length === 0 ? (
              <div className="flex min-h-64 flex-col items-center justify-center gap-2 p-8 text-center">
                <Search className="h-6 w-6 text-muted-foreground" />
                <p className="font-medium">No matching entities</p>
                <p className="text-sm text-muted-foreground">
                  Try a different search or turn on an entity type above.
                </p>
              </div>
            ) : (
              <svg
                aria-label={`${projectName} knowledge graph`}
                role="img"
                viewBox={`0 0 ${width} ${height}`}
                width={Math.round(width * zoom)}
                height={Math.round(height * zoom)}
                className="max-w-none"
              >
              <defs>
                <marker
                  id="graph-arrow-muted"
                  viewBox="0 0 10 10"
                  refX="9"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8" />
                </marker>
                <marker
                  id="graph-arrow-selected"
                  viewBox="0 0 10 10"
                  refX="9"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="#0f766e" />
                </marker>
                <filter id="graph-node-shadow" x="-20%" y="-30%" width="140%" height="160%">
                  <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.18" />
                </filter>
              </defs>
              {lanesWithNodes.map(({ label, nodes, total }, laneIndex) => {
                const x = 16 + laneIndex * (laneWidth + laneGap);
                const style = nodeStyles[label] ?? {
                  color: "#475569",
                  background: "#f1f5f9",
                  icon: CircleDot,
                };
                const Icon = style.icon;
                const count = Math.min(
                  nodes.length,
                  expandedCounts[label] ?? initialNodesPerLane
                );
                const remaining = nodes.length - count;
                return (
                  <g key={`lane-${label}`}>
                    <rect
                      x={x}
                      y="18"
                      width={laneWidth + 8}
                      height={height - 36}
                      rx="16"
                      fill={style.background}
                      fillOpacity="0.65"
                      stroke={style.color}
                      strokeOpacity="0.18"
                    />
                    <rect
                      x={x + 1}
                      y="19"
                      width={laneWidth + 6}
                      height="60"
                      rx="15"
                      fill={style.color}
                      fillOpacity="0.1"
                    />
                    <foreignObject x={x + 13} y="31" width={laneWidth - 5} height="40">
                      <div className="flex items-center gap-2.5 text-slate-800 dark:text-slate-100">
                        <span
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white shadow-sm dark:bg-slate-900"
                          style={{ color: style.color }}
                        >
                          <Icon className="h-4 w-4" />
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold">{label}</span>
                          <span className="block text-[11px] text-slate-500 dark:text-slate-400">
                            {nodes.length === total ? total : `${nodes.length} of ${total}`} entities
                          </span>
                        </span>
                      </div>
                    </foreignObject>
                    {remaining > 0 && (
                      <g
                        role="button"
                        tabIndex={0}
                        aria-label={`Show more ${label} entities`}
                        onClick={() => showMore(label, nodes.length)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            showMore(label, nodes.length);
                          }
                        }}
                        className="cursor-pointer"
                      >
                        <rect
                          x={x + 12}
                          y={laneTop + count * (nodeHeight + nodeGap)}
                          width={laneWidth - 16}
                          height="38"
                          rx="10"
                          fill="white"
                          stroke={style.color}
                          strokeDasharray="5 4"
                          strokeOpacity="0.55"
                        />
                        <text
                          x={x + laneWidth / 2 + 4}
                          y={laneTop + count * (nodeHeight + nodeGap) + 24}
                          textAnchor="middle"
                          fill={style.color}
                          fontSize="12"
                          fontWeight="600"
                        >
                          Show {Math.min(initialNodesPerLane, remaining)} more ({remaining} left)
                        </text>
                      </g>
                    )}
                  </g>
                );
              })}
              {visibleRelationships.map((relationship, index) => {
                const source = positions.get(relationship.source)!;
                const target = positions.get(relationship.target)!;
                const selected = selectedNode?.id === relationship.source
                  || selectedNode?.id === relationship.target;
                const color = relationshipColors[relationship.type] ?? "#64748b";
                const sourceY = source.y + nodeHeight / 2;
                const targetY = target.y + nodeHeight / 2;
                const sameLane = source.x === target.x;
                const sourceOnRight = source.x > target.x;
                const startX = sameLane || !sourceOnRight
                  ? source.x + laneWidth - 16
                  : source.x;
                const endX = sameLane || sourceOnRight
                  ? target.x + laneWidth - 16
                  : target.x;
                const curveX = (startX + endX) / 2;
                const path = sameLane
                  ? `M ${startX} ${sourceY} C ${startX + 44} ${sourceY}, ${endX + 44} ${targetY}, ${endX} ${targetY}`
                  : `M ${startX} ${sourceY} C ${curveX} ${sourceY}, ${curveX} ${targetY}, ${endX} ${targetY}`;
                return (
                  <path
                    key={`${relationship.source}-${relationship.type}-${relationship.target}-${index}`}
                    d={path}
                    fill="none"
                    stroke={selected ? "#0f766e" : color}
                    strokeOpacity={selectedNode ? (selected ? "0.95" : "0.08") : "0.52"}
                    strokeWidth={selected ? "2.8" : "1.8"}
                    markerEnd={`url(#graph-arrow-${selected ? "selected" : "muted"})`}
                  >
                    <title>{relationship.type.replaceAll("_", " ")}</title>
                  </path>
                );
              })}
              {visibleNodes.map((node) => {
                const position = positions.get(node.id);
                if (!position) return null;
                const style = nodeStyles[node.label] ?? {
                  color: "#475569",
                  background: "#f1f5f9",
                  icon: CircleDot,
                };
                const active = selectedNode?.id === node.id;
                const connected = selectedNode !== null
                  && selectedConnections.some((relationship) => (
                    relationship.source === node.id || relationship.target === node.id
                  ));
                const dimmed = selectedNode !== null && !active && !connected;
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
                    className={`cursor-pointer transition-opacity ${dimmed ? "opacity-20" : "opacity-100"}`}
                  >
                    <title>{node.label}: {node.title}</title>
                    <rect
                      x={position.x}
                      y={position.y}
                      width={laneWidth - 16}
                      height={nodeHeight}
                      rx="11"
                      fill="white"
                      stroke={active ? style.color : `${style.color}55`}
                      strokeWidth={active ? "2.5" : "1.2"}
                      filter={active ? "url(#graph-node-shadow)" : undefined}
                    />
                    <rect
                      x={position.x}
                      y={position.y}
                      width="5"
                      height={nodeHeight}
                      rx="2.5"
                      fill={style.color}
                    />
                    <circle
                      cx={position.x + 23}
                      cy={position.y + nodeHeight / 2}
                      r="13"
                      fill={style.background}
                    />
                    <text
                      x={position.x + 23}
                      y={position.y + nodeHeight / 2 + 4}
                      textAnchor="middle"
                      fill={style.color}
                      fontSize="10"
                      fontWeight="700"
                    >
                      {node.label.slice(0, 2).toUpperCase()}
                    </text>
                    <text
                      x={position.x + 43}
                      y={position.y + 23}
                      fill="#0f172a"
                      fontSize="11"
                      fontWeight="600"
                      className="dark:fill-slate-100"
                    >
                      {node.title.length > 23 ? `${node.title.slice(0, 20)}...` : node.title}
                    </text>
                    <text
                      x={position.x + 43}
                      y={position.y + 40}
                      fill="#64748b"
                      fontSize="9"
                    >
                      {node.label}
                    </text>
                  </g>
                );
              })}
              </svg>
            )}
          </div>
        </CardContent>
      </Card>

      {selectedNode && (
        <Card className="overflow-hidden">
          <CardContent className="space-y-4 p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Selected {selectedNode.label}
                </p>
                <p className="mt-1 break-all text-base font-semibold" title={selectedNode.title}>
                  {selectedNode.title}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Connected to {connectionCount} {connectionCount === 1 ? "entity" : "entities"}
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => onSelectNode(null)}>
                Clear selection
              </Button>
            </div>
            {selectedConnections.length > 0 ? (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {selectedConnections.slice(0, 12).map((relationship, index) => {
                  const relatedId = relationship.source === selectedNode.id
                    ? relationship.target
                    : relationship.source;
                  const relatedNode = graph.nodes.find((node) => node.id === relatedId);
                  const outgoing = relationship.source === selectedNode.id;
                  const relation = relationship.type.replaceAll("_", " ").toLowerCase();
                  return (
                    <button
                      key={`${relationship.source}-${relationship.type}-${relationship.target}-${index}`}
                      type="button"
                      onClick={() => {
                        if (relatedNode && visibleNodeIds.has(relatedNode.id)) {
                          onSelectNode(relatedNode);
                        }
                      }}
                      disabled={!relatedNode || !visibleNodeIds.has(relatedNode.id)}
                      className="rounded-lg border bg-background p-3 text-left transition-colors hover:bg-accent disabled:cursor-default disabled:opacity-60"
                    >
                      <span className="block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        {outgoing ? `→ ${relation}` : `${relation} →`}
                      </span>
                      <span className="mt-1 block truncate text-sm font-medium">
                        {relatedNode?.title ?? "Unknown entity"}
                      </span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {relatedNode?.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No relationships are recorded for this entity.
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
