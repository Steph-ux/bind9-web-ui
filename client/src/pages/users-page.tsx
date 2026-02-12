import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-provider";
import { User, InsertUser, insertUserSchema } from "@shared/schema";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useToast } from "@/hooks/use-toast";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Trash2, UserPlus } from "lucide-react";
import Layout from "@/components/layout";

export default function UsersPage() {
    const { user } = useAuth();
    const { toast } = useToast();
    const queryClient = useQueryClient();

    const { data: users, isLoading } = useQuery<User[]>({
        queryKey: ["users"],
        queryFn: async () => {
            const res = await fetch("/api/users");
            if (!res.ok) throw new Error("Failed to fetch users");
            return res.json();
        },
    });

    const form = useForm<InsertUser>({
        resolver: zodResolver(insertUserSchema),
        defaultValues: {
            username: "",
            password: "",
            role: "viewer",
        },
    });

    const createMutation = useMutation({
        mutationFn: async (data: InsertUser) => {
            const res = await fetch("/api/users", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(data),
            });
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.message || "Failed to create user");
            }
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["users"] });
            form.reset();
            toast({ title: "User created" });
        },
        onError: (err: Error) => {
            toast({ variant: "destructive", title: "Failed to create user", description: err.message });
        },
    });

    const deleteMutation = useMutation({
        mutationFn: async (id: string) => {
            const res = await fetch(`/api/users/${id}`, {
                method: "DELETE",
            });
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.message || "Failed to delete user");
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["users"] });
            toast({ title: "User deleted" });
        },
        onError: (err: Error) => {
            toast({ variant: "destructive", title: "Failed to delete user", description: err.message });
        },
    });

    if (!user || user.role !== "admin") {
        return <div className="p-8">Access Denied</div>;
    }

    return (
        <Layout>
            <div className="space-y-8">
                <div className="flex justify-between items-center">
                    <h1 className="text-3xl font-bold tracking-tight">User Management</h1>
                </div>

                <div className="grid gap-8 md:grid-cols-3">
                    <Card className="md:col-span-1 h-fit">
                        <CardHeader>
                            <CardTitle>Add New User</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <Form {...form}>
                                <form onSubmit={form.handleSubmit((data) => createMutation.mutate(data))} className="space-y-4">
                                    <FormField
                                        control={form.control}
                                        name="username"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Username</FormLabel>
                                                <FormControl>
                                                    <Input {...field} />
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
                                                    <Input type="password" {...field} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="role"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Role</FormLabel>
                                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                                    <FormControl>
                                                        <SelectTrigger>
                                                            <SelectValue placeholder="Select role" />
                                                        </SelectTrigger>
                                                    </FormControl>
                                                    <SelectContent>
                                                        <SelectItem value="admin">Admin</SelectItem>
                                                        <SelectItem value="operator">Operator</SelectItem>
                                                        <SelectItem value="viewer">Viewer</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <Button type="submit" className="w-full" disabled={createMutation.isPending}>
                                        {createMutation.isPending ? "Creating..." : "Create User"}
                                    </Button>
                                </form>
                            </Form>
                        </CardContent>
                    </Card>

                    <Card className="md:col-span-2">
                        <CardHeader>
                            <CardTitle>Users</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Username</TableHead>
                                        <TableHead>Role</TableHead>
                                        <TableHead>Created At</TableHead>
                                        <TableHead className="w-[100px]">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {isLoading ? (
                                        <TableRow>
                                            <TableCell colSpan={4} className="text-center">Loading...</TableCell>
                                        </TableRow>
                                    ) : (
                                        users?.map((u) => (
                                            <TableRow key={u.id}>
                                                <TableCell className="font-medium">{u.username}</TableCell>
                                                <TableCell>
                                                    <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${u.role === 'admin' ? 'bg-indigo-400/10 text-indigo-400 ring-indigo-400/30' :
                                                        u.role === 'operator' ? 'bg-green-400/10 text-green-400 ring-green-400/30' :
                                                            'bg-gray-400/10 text-gray-400 ring-gray-400/30'
                                                        }`}>
                                                        {u.role}
                                                    </span>
                                                </TableCell>
                                                <TableCell>{new Date(u.createdAt).toLocaleDateString()}</TableCell>
                                                <TableCell>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        onClick={() => {
                                                            if (confirm("Are you sure?")) deleteMutation.mutate(u.id);
                                                        }}
                                                        disabled={u.id === user?.id || deleteMutation.isPending}
                                                    >
                                                        <Trash2 className="h-4 w-4 text-red-500" />
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </Layout>
    );
}
