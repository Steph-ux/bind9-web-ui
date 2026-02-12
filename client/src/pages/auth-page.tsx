import { useAuth } from "@/lib/auth-provider";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { InsertUser } from "@shared/schema";
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useLocation } from "wouter";
import { useEffect } from "react";

const loginSchema = z.object({
    username: z.string().min(1, "Username is required"),
    password: z.string().min(1, "Password is required"),
});

export default function AuthPage() {
    const { user, login } = useAuth();
    const [_, setLocation] = useLocation();

    useEffect(() => {
        if (user) {
            setLocation("/");
        }
    }, [user, setLocation]);

    const form = useForm<z.infer<typeof loginSchema>>({
        resolver: zodResolver(loginSchema),
        defaultValues: {
            username: "",
            password: "",
        },
    });

    const onSubmit = async (data: z.infer<typeof loginSchema>) => {
        try {
            await login(data);
        } catch (error) {
            // toast handled in login
        }
    };

    return (
        <div className="min-h-screen grid lg:grid-cols-2">
            <div className="flex items-center justify-center p-8 bg-zinc-950 text-zinc-50">
                <div className="max-w-md w-full space-y-4">
                    <div className="flex items-center gap-2 mb-8">
                        <div className="h-8 w-8 bg-indigo-500 rounded-lg flex items-center justify-center font-bold text-white">B</div>
                        <h1 className="text-2xl font-bold tracking-tight">BIND9 Admin</h1>
                    </div>

                    <Card className="border-zinc-800 bg-zinc-900 text-zinc-50">
                        <CardHeader>
                            <CardTitle>Welcome back</CardTitle>
                            <CardDescription className="text-zinc-400">
                                Enter your credentials to access the admin panel via user: admin pass: admin
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Form {...form}>
                                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                                    <FormField
                                        control={form.control}
                                        name="username"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Username</FormLabel>
                                                <FormControl>
                                                    <Input className="bg-zinc-950 border-zinc-800" {...field} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="password"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Password</FormLabel>
                                                <FormControl>
                                                    <Input type="password" className="bg-zinc-950 border-zinc-800" {...field} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <Button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700">
                                        Login
                                    </Button>
                                </form>
                            </Form>
                        </CardContent>
                    </Card>
                </div>
            </div>
            <div className="hidden lg:block bg-zinc-900 relative">
                <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/20 to-purple-900/20" />
                <div className="absolute inset-0 flex items-center justify-center p-12">
                    <div className="text-zinc-400 max-w-md">
                        <h2 className="text-3xl font-bold text-zinc-100 mb-4">DNS Management Made Simple</h2>
                        <p>Manage your BIND9 zones, records, ACLs, and TSIG keys through a modern, secure interface.</p>
                    </div>
                </div>
            </div>
        </div>
    );
}
