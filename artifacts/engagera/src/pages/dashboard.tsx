import React, { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Activity, Key, Plus, Trash2, ShieldCheck, Cpu, Zap, Copy, Check, ArrowUpRight } from "lucide-react";
import { format } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetDashboardStats,
  useListApiKeys,
  useCreateApiKey,
  useRevokeApiKey,
  getListApiKeysQueryKey,
  getGetDashboardStatsQueryKey
} from "@workspace/api-client-react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";

export default function Dashboard() {
  const { user } = useAuth();
  const { data: stats, isLoading: statsLoading } = useGetDashboardStats();
  const { data: apiKeys, isLoading: keysLoading } = useListApiKeys();
  const createKey = useCreateApiKey();
  const revokeKey = useRevokeApiKey();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isRevokeOpen, setIsRevokeOpen] = useState(false);
  const [keyToRevoke, setKeyToRevoke] = useState<number | null>(null);

  const handleCreateKey = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyName.trim()) return;
    createKey.mutate(
      { data: { name: newKeyName } },
      {
        onSuccess: (data: { key: string }) => {
          setCreatedKey(data.key);
          queryClient.invalidateQueries({ queryKey: getListApiKeysQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetDashboardStatsQueryKey() });
          setNewKeyName("");
        },
        onError: (err: Error) => {
          toast({ title: "Failed to create key", description: err.message, variant: "destructive" });
        }
      }
    );
  };

  const handleRevoke = () => {
    if (!keyToRevoke) return;
    revokeKey.mutate(
      { id: keyToRevoke },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListApiKeysQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetDashboardStatsQueryKey() });
          setIsRevokeOpen(false);
          setKeyToRevoke(null);
          toast({ title: "Key revoked" });
        },
        onError: (err: Error) => {
          toast({ title: "Failed to revoke key", description: err.message, variant: "destructive" });
        }
      }
    );
  };

  const handleCopy = () => {
    if (createdKey) {
      navigator.clipboard.writeText(createdKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const closeCreateDialog = () => {
    setIsCreateOpen(false);
    setCreatedKey(null);
    setNewKeyName("");
  };

  const statCards = [
    {
      label: "Active API Keys",
      value: statsLoading ? "—" : String(stats?.activeKeys ?? 0),
      icon: Key,
    },
    {
      label: "Total Requests",
      value: statsLoading ? "—" : (stats?.totalRequests ?? 0).toLocaleString(),
      icon: Activity,
    },
    {
      label: "Tokens This Month",
      value: statsLoading ? "—" : (stats?.totalTokensThisMonth ?? 0).toLocaleString(),
      icon: Zap,
    },
    {
      label: "Top Model",
      value: statsLoading ? "—" : (stats?.topModel || "None"),
      icon: Cpu,
    },
  ];

  return (
    <AppLayout requireAuth showSidebar>
      <div className="p-6 md:p-8 max-w-6xl mx-auto space-y-8">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {user?.email && <span className="font-mono text-xs">{user.email}</span>}
            </p>
          </div>
          <Button onClick={() => setIsCreateOpen(true)} size="sm" className="gap-2 self-start sm:self-auto">
            <Plus className="h-4 w-4" />
            New API Key
          </Button>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {statCards.map(({ label, value, icon: Icon }) => (
            <Card key={label} className="bg-card border-border">
              <CardHeader className="flex flex-row items-center justify-between pb-2 pt-4 px-4">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</CardTitle>
                <Icon className="h-3.5 w-3.5 text-muted-foreground/50" />
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="text-2xl font-bold tracking-tight">{value}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Main content */}
        <div className="grid gap-6 lg:grid-cols-3">
          {/* API Keys — 2/3 width */}
          <Card className="lg:col-span-2 bg-card border-border">
            <CardHeader className="flex flex-row items-start justify-between px-6 pt-6 pb-4">
              <div>
                <CardTitle className="text-base font-semibold">API Keys</CardTitle>
                <CardDescription className="text-xs mt-1">Keys are stored hashed. Only shown once on creation.</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="px-6 pb-6">
              {keysLoading ? (
                <div className="py-10 text-center text-sm text-muted-foreground">Loading…</div>
              ) : Array.isArray(apiKeys) && apiKeys.length > 0 ? (
                <div className="rounded-lg border border-border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-border hover:bg-transparent">
                        <TableHead className="text-xs font-medium text-muted-foreground">Name</TableHead>
                        <TableHead className="text-xs font-medium text-muted-foreground">Key prefix</TableHead>
                        <TableHead className="text-xs font-medium text-muted-foreground hidden sm:table-cell">Created</TableHead>
                        <TableHead className="text-xs font-medium text-muted-foreground hidden md:table-cell">Last used</TableHead>
                        <TableHead className="w-10" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {apiKeys.map((key) => (
                        <TableRow key={key.id} className="border-border">
                          <TableCell className="font-medium text-sm">{key.name}</TableCell>
                          <TableCell>
                            <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">{key.prefix}•••</code>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground hidden sm:table-cell">
                            {format(new Date(key.createdAt), "MMM d, yyyy")}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground hidden md:table-cell">
                            {key.lastUsedAt ? format(new Date(key.lastUsedAt), "MMM d") : "Never"}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                              onClick={() => { setKeyToRevoke(key.id); setIsRevokeOpen(true); }}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="py-14 text-center rounded-lg border border-dashed border-border">
                  <Key className="h-8 w-8 mx-auto text-muted-foreground/30 mb-3" />
                  <p className="text-sm font-medium mb-1">No API keys yet</p>
                  <p className="text-xs text-muted-foreground mb-4">Create your first key to start using the API</p>
                  <Button size="sm" onClick={() => setIsCreateOpen(true)} className="gap-1.5">
                    <Plus className="h-3.5 w-3.5" />
                    Create API Key
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent activity — 1/3 width */}
          <Card className="bg-card border-border">
            <CardHeader className="px-6 pt-6 pb-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-semibold">Recent Activity</CardTitle>
                <Link href="/usage">
                  <button className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
                    View all <ArrowUpRight className="h-3 w-3" />
                  </button>
                </Link>
              </div>
            </CardHeader>
            <CardContent className="px-6 pb-6">
              {statsLoading ? (
                <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>
              ) : stats?.recentActivity && stats.recentActivity.length > 0 ? (
                <div className="space-y-3">
                  {stats.recentActivity.map((activity: { model: string; createdAt: string; tokens: number }, i: number) => (
                    <div key={i} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{activity.model}</div>
                        <div className="text-xs text-muted-foreground">{format(new Date(activity.createdAt), "MMM d, HH:mm")}</div>
                      </div>
                      <code className="text-xs font-mono text-muted-foreground ml-3 shrink-0">{activity.tokens.toLocaleString()}</code>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-10 text-center text-sm text-muted-foreground">No activity yet</div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Create Key Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={closeCreateDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-semibold">Create API Key</DialogTitle>
            <DialogDescription className="text-sm">
              Name your key for easy identification. The secret will only be shown once.
            </DialogDescription>
          </DialogHeader>

          {createdKey ? (
            <div className="space-y-4">
              <Alert className="border-border bg-card">
                <ShieldCheck className="h-4 w-4" />
                <AlertTitle className="font-semibold text-sm">Copy your API key now</AlertTitle>
                <AlertDescription className="text-xs text-muted-foreground mt-1">
                  This key won't be shown again. Store it somewhere safe.
                </AlertDescription>
              </Alert>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-muted px-3 py-2.5 rounded-lg text-xs font-mono break-all border border-border">
                  {createdKey}
                </code>
                <Button size="icon" variant="outline" onClick={handleCopy} className="shrink-0">
                  {copied ? <Check className="h-4 w-4 text-foreground" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
              <DialogFooter>
                <Button onClick={closeCreateDialog} className="w-full font-semibold">I've saved my key</Button>
              </DialogFooter>
            </div>
          ) : (
            <form onSubmit={handleCreateKey}>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label htmlFor="name" className="text-sm font-medium">Key name</Label>
                  <Input
                    id="name"
                    placeholder="e.g. Production, My App, Testing"
                    value={newKeyName}
                    onChange={(e) => setNewKeyName(e.target.value)}
                    required
                    className="h-10"
                  />
                </div>
              </div>
              <DialogFooter className="mt-4">
                <Button type="button" variant="outline" onClick={closeCreateDialog}>Cancel</Button>
                <Button type="submit" disabled={createKey.isPending || !newKeyName.trim()} className="font-semibold">
                  {createKey.isPending ? "Creating…" : "Create key"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Revoke Confirmation */}
      <Dialog open={isRevokeOpen} onOpenChange={setIsRevokeOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-semibold">Revoke API Key</DialogTitle>
            <DialogDescription className="text-sm">
              This action is irreversible. Any app using this key will immediately lose access.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRevokeOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleRevoke} disabled={revokeKey.isPending}>
              {revokeKey.isPending ? "Revoking…" : "Revoke key"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
