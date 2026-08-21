import { cn } from "@/lib/utils";
import { AlertCircle, Info, CheckCircle2, AlertTriangle } from "lucide-react";

type Variant = "info" | "success" | "warning" | "error";

const config: Record<Variant, { icon: React.ElementType; classes: string }> = {
  info: { icon: Info, classes: "bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-950/30 dark:border-blue-800 dark:text-blue-300" },
  success: { icon: CheckCircle2, classes: "bg-green-50 border-green-200 text-green-800 dark:bg-green-950/30 dark:border-green-800 dark:text-green-300" },
  warning: { icon: AlertTriangle, classes: "bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-300" },
  error: { icon: AlertCircle, classes: "bg-red-50 border-red-200 text-red-800 dark:bg-red-950/30 dark:border-red-800 dark:text-red-300" },
};

interface AlertProps {
  variant?: Variant;
  title?: string;
  children: React.ReactNode;
  className?: string;
}

export function Alert({ variant = "info", title, children, className }: AlertProps) {
  const { icon: Icon, classes } = config[variant];
  return (
    <div className={cn("flex gap-3 rounded-lg border p-4 text-sm", classes, className)}>
      <Icon className="h-4 w-4 mt-0.5 shrink-0" />
      <div>
        {title && <p className="font-medium mb-1">{title}</p>}
        <div>{children}</div>
      </div>
    </div>
  );
}
