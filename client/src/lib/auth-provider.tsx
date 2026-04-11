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
    isAdmin: boolean;
    canManageDNS: boolean;
    isReadOnly: boolean;
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
                    try {
                        const data = await res.json();
                        setUser(data);
                    } catch {
                        setUser(null);
                    }
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
                let message = "Login failed";
                try {
                    const err = await res.json();
                    message = err.message || message;
                } catch {}
                throw new Error(message);
            }

            let user;
            try {
                user = await res.json();
            } catch {
                throw new Error("Server returned an invalid response. Please ensure the backend is running.");
            }
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
        <AuthContext.Provider value={{
            user,
            isLoading,
            error,
            login,
            logout,
            isAdmin: user?.role === "admin",
            canManageDNS: user?.role === "admin" || user?.role === "operator",
            isReadOnly: user?.role === "viewer"
        }}>
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

function Redirect({ to }: { to: string }) {
    const [_, setLocation] = useLocation();
    useEffect(() => { setLocation(to); }, [to, setLocation]);
    return null;
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

    if (isLoading) {
        return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
    }

    if (!user) {
        return <Redirect to="/auth" />;
    }

    if (adminOnly && user.role !== "admin") {
        return <Redirect to="/" />;
    }

    return <Route path={path} component={Component} />;
}
