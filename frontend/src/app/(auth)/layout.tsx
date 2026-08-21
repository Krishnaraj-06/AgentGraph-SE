export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-brand-50/30 dark:to-brand-950/20 flex items-center justify-center p-4">
      {children}
    </div>
  );
}
