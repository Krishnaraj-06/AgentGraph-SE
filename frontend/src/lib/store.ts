"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { User, Workspace } from "@/types";

interface AuthState {
  user: User | null;
  workspace: Workspace | null;
  setUser: (user: User | null) => void;
  setWorkspace: (workspace: Workspace | null) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      workspace: null,
      setUser: (user) => set({ user }),
      setWorkspace: (workspace) => set({ workspace }),
      clear: () => set({ user: null, workspace: null }),
    }),
    { name: "agentgraph-auth" }
  )
);
