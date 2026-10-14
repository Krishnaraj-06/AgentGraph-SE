import api from "@/lib/api";
import Cookies from "js-cookie";
import type { User, Workspace, TokenResponse } from "@/types";

export const authApi = {
  register: async (data: { email: string; password: string; full_name: string }): Promise<User> => {
    const res = await api.post<User>("/api/v1/auth/register", data);
    return res.data;
  },

  login: async (data: { email: string; password: string }): Promise<TokenResponse> => {
    const res = await api.post<TokenResponse>("/api/v1/auth/login", data);
    const { access_token, refresh_token } = res.data;
    const cookieOptions = {
      secure: window.location.protocol === "https:",
      sameSite: "strict" as const,
    };
    Cookies.set("access_token", access_token, cookieOptions);
    Cookies.set("refresh_token", refresh_token, cookieOptions);
    return res.data;
  },

  me: async (): Promise<User> => {
    const res = await api.get<User>("/api/v1/auth/me");
    return res.data;
  },

  logout: () => {
    Cookies.remove("access_token");
    Cookies.remove("refresh_token");
  },

  createWorkspace: async (data: { name: string; slug: string }): Promise<Workspace> => {
    const res = await api.post<Workspace>("/api/v1/auth/workspaces", data);
    return res.data;
  },

  listWorkspaces: async (): Promise<Workspace[]> => {
    const res = await api.get<Workspace[]>("/api/v1/auth/workspaces");
    return res.data;
  },
};
