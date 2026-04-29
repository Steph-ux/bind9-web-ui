import { createContext, type ComponentType, type ReactNode, useContext, useEffect, useState } from "react";
import { Route, useLocation } from "wouter";

import { useToast } from "@/hooks/use-toast";
import { type CreateManagedUserInput, type ManagedUser } from "@/lib/api";

type AuthContextType = {
    user: ManagedUser | null;
    isLoading: boolean;
    error: Error | null;
    login: (data: Pick<CreateManagedUserInput, "username" | "password">) => Promise<void>;
    logout: () => Promise<void>;
    isAdmin: boolean;
    canManageDNS: boolean;
    isReadOnly: boolean;
    mustChangePassword: boolean;
    changeOwnPassword: (newPassword: string, currentPassword?: string) => Promise<void>;
};

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<ManagedUser | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);
    const { toast } = useToast();
    const [location, setLocation] = useLocation();

    useEffect(() => {
        const fetchUser = async () => {
            try {
                const res = await fetch("/api/auth/me", { credentials: "same-origin" });
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
            } catch {
                setUser(null);
            } finally {
                setIsLoading(false);
            }
        };

        fetchUser();
    }, []);

    const login = async (data: Pick<CreateManagedUserInput, "username" | "password">) => {
        try {
            const res = await fetch("/api/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "same-origin",
                body: JSON.stringify(data),
            });

            if (!res.ok) {
                let message = "Login failed";
                try {
                    const err = await res.json();
                    message = err.message || message;
                } catch {
                    // ignore JSON parsing issues and keep the fallback message
                }
                throw new Error(message);
            }

            let nextUser: ManagedUser;
            try {
                nextUser = await res.json();
            } catch {
                throw new Error("Server returned an invalid response. Please ensure the backend is running.");
            }

            setUser(nextUser);
            if (nextUser.mustChangePassword) {
                toast({
                    title: "Password change required",
                    description: "You must change your default password before continuing.",
                    variant: "destructive",
                });
                setLocation("/change-password");
            } else {
                toast({ title: "Welcome back!", description: `Logged in as ${nextUser.username}` });
                setLocation("/");
            }
        } catch (loginError) {
            const err = loginError instanceof Error ? loginError : new Error("Login failed");
            setError(err);
            toast({
                variant: "destructive",
                title: "Login failed",
                description: err.message,
            });
            throw err;
        }
    };

    const logout = async () => {
        try {
            await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
            setUser(null);
            setLocation("/auth");
            toast({ title: "Logged out", description: "See you soon!" });
        } catch (logoutError) {
            const err = logoutError instanceof Error ? logoutError : new Error("Logout failed");
            toast({
                variant: "destructive",
                title: "Logout failed",
                description: err.message,
            });
        }
    };

    const changeOwnPassword = async (newPassword: string, currentPassword?: string) => {
        const res = await fetch("/api/auth/password", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            credentials: "same-origin",
            body: JSON.stringify({ newPassword, currentPassword }),
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({ message: "Failed to change password" }));
            throw new Error(err.message);
        }
        setUser((currentUser) => (currentUser ? { ...currentUser, mustChangePassword: false } : currentUser));
        setLocation("/");
        toast({ title: "Password changed", description: "Your password has been updated successfully." });
    };

    return (
        <AuthContext.Provider
            value={{
                user,
                isLoading,
                error,
                login,
                logout,
                isAdmin: user?.role === "admin",
                canManageDNS: user?.role === "admin" || user?.role === "operator",
                isReadOnly: user?.role === "viewer",
                mustChangePassword: !!user?.mustChangePassword,
                changeOwnPassword,
            }}
        >
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
    const [, setLocation] = useLocation();

    useEffect(() => {
        setLocation(to);
    }, [to, setLocation]);

    return null;
}

export function ProtectedRoute({
    path,
    component: Component,
    adminOnly = false,
}: {
    path: string;
    component: ComponentType<any>;
    adminOnly?: boolean;
}) {
    const { user, isLoading } = useAuth();

    if (isLoading) {
        return <div className="flex min-h-screen items-center justify-center">Loading...</div>;
    }

    if (!user) {
        return <Redirect to="/auth" />;
    }

    if (adminOnly && user.role !== "admin") {
        return <Redirect to="/" />;
    }

    if (user.mustChangePassword) {
        return <Redirect to="/change-password" />;
    }

    return <Route path={path} component={Component} />;
}
