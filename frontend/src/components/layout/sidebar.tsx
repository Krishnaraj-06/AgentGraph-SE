"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import {
  LayoutDashboard,
  GitBranch,
  MessageSquareCode,
  FolderKanban,
  Settings,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface SidebarProps {
  workspaceSlug: string;
}

const navItems = [
  { label: "Overview", icon: LayoutDashboard, href: "overview" },
  { label: "Knowledge Graph", icon: GitBranch, href: "graph" },
  { label: "AI Copilot", icon: MessageSquareCode, href: "copilot" },
  { label: "Projects", icon: FolderKanban, href: "projects" },
  { label: "Settings", icon: Settings, href: "settings" },
];

export function Sidebar({ workspaceSlug }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="flex h-screen w-60 flex-col border-r bg-card">
      {/* Logo */}
      <div className="flex h-14 items-center gap-2.5 border-b px-4">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary">
          <Zap className="h-4 w-4 text-primary-foreground" />
        </div>
        <span className="font-semibold tracking-tight text-sm">AgentGraph</span>
        <span className="ml-auto rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
          SE
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
        {navItems.map((item) => {
          const href = `/${workspaceSlug}/${item.href}`;
          const active = pathname.startsWith(href);
          return (
            <Link key={item.href} href={href}>
              <span
                className={cn(
                  "relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent"
                )}
              >
                {active && (
                  <motion.span
                    layoutId="sidebar-active"
                    className="absolute inset-0 rounded-lg bg-primary/8"
                    transition={{ type: "spring", stiffness: 400, damping: 35 }}
                  />
                )}
                <item.icon className="h-4 w-4 shrink-0 relative z-10" />
                <span className="relative z-10">{item.label}</span>
              </span>
            </Link>
          );
        })}
      </nav>

      {/* Workspace badge */}
      <div className="border-t p-3">
        <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2">
          <div className="h-6 w-6 rounded-md bg-primary/20 flex items-center justify-center text-[10px] font-bold text-primary uppercase">
            {workspaceSlug[0]}
          </div>
          <span className="text-xs font-medium text-muted-foreground truncate">{workspaceSlug}</span>
        </div>
      </div>
    </aside>
  );
}
