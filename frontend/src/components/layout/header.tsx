"use client";

import { useRouter } from "next/navigation";
import { Bell, LogOut, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/lib/store";
import { authApi } from "@/lib/auth-api";
import { getInitials } from "@/lib/utils";

interface HeaderProps {
  title: string;
}

export function Header({ title }: HeaderProps) {
  const router = useRouter();
  const { user, clear } = useAuthStore();

  const handleLogout = () => {
    authApi.logout();
    clear();
    router.push("/login");
  };

  return (
    <header className="flex h-14 items-center justify-between border-b bg-card px-6">
      <h1 className="text-sm font-semibold text-foreground">{title}</h1>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" className="text-muted-foreground">
          <Bell className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-2 ml-1">
          <div className="h-7 w-7 rounded-full bg-primary/20 flex items-center justify-center text-xs font-semibold text-primary">
            {user ? getInitials(user.full_name) : <User className="h-3.5 w-3.5" />}
          </div>
          <span className="text-sm font-medium hidden sm:block">{user?.full_name}</span>
        </div>
        <Button variant="ghost" size="icon" className="text-muted-foreground" onClick={handleLogout}>
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}
