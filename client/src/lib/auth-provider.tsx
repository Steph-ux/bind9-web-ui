import { createContext, ReactNode, useContext, useEffect, useState } from "react";
import { useLocation, Route } from "wouter";
import { User, InsertUser } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

type AuthContextType = {
    user: User | null;
    isLoading: boolean;
    error: Error | null;
    login: (data: Pick<InsertUser, "username" | "password">) => Promise<void>;
    logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);
    const { toast } = useToast();
    const [location, setLocation] = useLocation();

    useEffect(() => {
        const fetchUser = async () => {
            try {
                const res = await fetch("/api/auth/me");
                if (res.ok) {
                    const data = await res.json();
                    setUser(data);
                } else {
                    setUser(null);
                }
            } catch (e) {
                setUser(null);
            } finally {
                setIsLoading(false);
            }
        };
        fetchUser();
    }, []);

    const login = async (data: Pick<InsertUser, "username" | "password">) => {
        try {
            const res = await fetch("/api/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(data),
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.message || "Login failed");
            }

            const user = await res.json();
            setUser(user);
            toast({ title: "Welcome back!", description: `Logged in as ${user.username}` });
            setLocation("/");
        } catch (e: any) {
            toast({
                variant: "destructive",
                title: "Login failed",
                description: e.message,
            });
            throw e;
        }
    };

    const logout = async () => {
        try {
            await fetch("/api/auth/logout", { method: "POST" });
            setUser(null);
            setLocation("/auth");
            toast({ title: "Logged out", description: "See you soon!" });
        } catch (e: any) {
            toast({
                variant: "destructive",
                title: "Logout failed",
                description: e.message,
            });
        }
    };

    return (
        <AuthContext.Provider value={{ user, isLoading, error, login, logout }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error("useAuth must be used within an AuthProvider");
    }
    return context;
}

export function ProtectedRoute({
    path,
    component: Component,
    adminOnly = false,
}: {
    path: string;
    component: () => React.JSX.Element;
    adminOnly?: boolean;
}) {
    const { user, isLoading } = useAuth();
    const [location, setLocation] = useLocation();

    if (isLoading) {
        return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
    }

    if (!user) {
        // Redirect to login if not authenticated
        // We can handle this by returning null and effecting, but Route expects a component? 
        // Wait, wouter's Route renders conditionally. If we are here, we are matched.
        // If we render a Redirect, it works.
        // Ideally we invoke setLocation in useEffect, but returning generic Route from wouter is better.
        // However, this component is used AS the component prop in Route? No, it wraps Route?
        // Let's assume usage: <ProtectedRoute path="/" component={Dashboard} />

        // Actually, wouter doesn't have a "Redirect" component standardly, use `setLocation`.
        /* Using wouter logic inside a component specifically rendered by a Route is tricky if the Route itself does the matching.
           Here we are creating a wrpper around Route. */

        // But wait, the usage in App.tsx is <Route path="..." component={...} />
        // So ProtectedRoute should likely return a Route or be used inside one.
        // Let's make ProtectedRoute WRAP Route.

        // But then we can't invoke hooks easily if not rendered.
        // Better pattern:
        return (
            <Route path={path}>
                {(params) => {
                    if (!user) {
                        setTimeout(() => setLocation("/auth"), 0);
                        return null;
                    }
                    if (adminOnly && (user as any).role !== "admin") {
                        setTimeout(() => setLocation("/"), 0); // or 403 page
                        return null;
                    }
                    return <Component {...params} />;
                }}
            </Route>
        );
    }

    // If user is present (and admin check passes logic above is slightly flawed because hook execution order), 
    // actually hooks run before render.

    // Let's fix loop and hook rules.
    // The Route children function is good.

    return (
        <Route path={path}>
            {(params) => {
                if (isLoading) return <div>Loading...</div>;
                if (!user) {
                    // Redirect to login
                    if (location !== "/auth") setTimeout(() => setLocation("/auth"), 0);
                    return null;
                }
                if (adminOnly && user.role !== "admin") {
                    // Redirect to home if forbidden
                    if (location !== "/") setTimeout(() => setLocation("/"), 0);
                    return null;
                }
                return <Component {...params} />;
            }}
        </Route>
    );
}
