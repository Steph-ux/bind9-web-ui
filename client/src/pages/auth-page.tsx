import { useAuth } from "@/lib/auth-provider";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLocation } from "wouter";
import { useEffect, useState } from "react";
import { Loader2, Server, Globe, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardDescription } from "@/components/ui/card";

const loginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

export default function AuthPage() {
  const { user, login } = useAuth();
  const [_, setLocation] = useLocation();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      setLocation(user.mustChangePassword ? "/change-password" : "/");
    }
  }, [user, setLocation]);

  const form = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: "", password: "" },
  });

  const onSubmit = async (data: z.infer<typeof loginSchema>) => {
    try {
      setError(null);
      setLoading(true);
      await login(data);
    } catch (err: any) {
      setError(err?.message || "Invalid credentials");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-background">
      {/* Left panel */}
      <div className="flex items-center justify-center p-6 lg:p-10 w-full lg:w-[480px] lg:max-w-[480px] shrink-0">
        <Card className="w-full max-w-[400px] shadow-lg border-border/50">
          <CardHeader className="pb-4">
            {/* Logo */}
            <div className="flex items-center gap-2.5 mb-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-lg">B</div>
              <span className="font-bold text-xl tracking-tight">BIND9Admin</span>
            </div>
            <h2 className="font-bold text-2xl tracking-tight">Welcome back</h2>
            <CardDescription>Sign in to access the DNS management panel.</CardDescription>
          </CardHeader>
          <CardContent>
            {error && (
              <div className="mb-4 rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
            )}

            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  type="text"
                  placeholder="admin"
                  autoComplete="username"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  {...form.register("username")}
                />
                {form.formState.errors.username && (
                  <p className="text-sm text-destructive">{form.formState.errors.username.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="********"
                  autoComplete="current-password"
                  {...form.register("password")}
                />
                {form.formState.errors.password && (
                  <p className="text-sm text-destructive">{form.formState.errors.password.message}</p>
                )}
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                {loading ? "Signing in..." : "Sign In"}
              </Button>
            </form>

            <p className="text-muted-foreground text-center mt-6 text-xs">
              Use the credentials provided by your administrator. First-login accounts will be prompted to set a new password.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Right panel */}
      <div className="hidden lg:flex flex-col p-10 flex-1 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 text-white">
        <div className="flex-1 flex flex-col items-center justify-center">
          <div className="max-w-[480px]">
            <h1 className="font-bold mb-3 text-4xl tracking-tight leading-tight">DNS Management<br />Made Simple</h1>
            <p className="mb-8 opacity-75 text-lg">
              Manage your BIND9 zones, records, ACLs, and TSIG keys through a modern, secure interface.
            </p>

            <div className="flex flex-col gap-5">
              {[
                { icon: Globe, title: "Zone Management", desc: "Create and edit DNS zones and records with ease" },
                { icon: Shield, title: "Security Controls", desc: "ACLs, TSIG keys and firewall RPZ rules" },
                { icon: Server, title: "Server Monitoring", desc: "Real-time CPU, memory and BIND9 process stats" },
              ].map(({ icon: Icon, title, desc }) => (
                <div key={title} className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-lg shrink-0 bg-white/10">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="font-semibold">{title}</div>
                    <div className="opacity-60 text-sm">{desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <p className="text-center text-white/40 text-xs">Copyright &copy; 2025 Stephane ASSOGBA</p>
      </div>
    </div>
  );
}

