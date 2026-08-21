import { Card, CardContent } from "@/components/ui/card";
import { GitPullRequest } from "lucide-react";

export default function GraphPage() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Engineering Knowledge Graph</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Visual representation of relationships between developers, tasks, commits, PRs, and modules.
        </p>
      </div>
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-24 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 mb-4">
            <GitPullRequest className="h-6 w-6 text-primary" />
          </div>
          <h3 className="font-semibold text-base mb-2">Knowledge Graph not yet built</h3>
          <p className="text-sm text-muted-foreground max-w-sm">
            Connect GitHub and Jira and run the first sync to construct and visualise the
            Engineering Knowledge Graph here.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
