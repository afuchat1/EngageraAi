import React, { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Activity, Key, Plus, Trash2, ShieldAlert, Cpu, Zap, Copy, Check } from "lucide-react";
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
        onSuccess: (data) => {
          setCreatedKey(data.key);
          queryClient.invalidateQueries({ queryKey: getListApiKeysQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetDashboardStatsQueryKey() });
          setNewKeyName("");
        },
        onError: (err) => {
          toast({
            title: "Failed to create key",
            description: err.message,
            variant: "destructive",
          });
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
          toast({
            title: "Key revoked successfully",
          });
        },
        onError: (err) => {
          toast({
            title: "Failed to revoke key",
            description: err.message,
            variant: "destructive",
          });
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

  return (
    <AppLayout requireAuth showSidebar>
      <div className="p-8 max-w-6xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground mt-2">Manage your API keys and monitor usage.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card className="bg-card/50">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active API Keys</CardTitle>
              <Key className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{statsLoading ? "-" : stats?.activeKeys}</div>
            </CardContent>
          </Card>

          <Card className="bg-card/50">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Requests</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{statsLoading ? "-" : stats?.totalRequests.toLocaleString()}</div>
            </CardContent>
          </Card>

          <Card className="bg-card/50">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Tokens This Month</CardTitle>
              <Zap className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{statsLoading ? "-" : stats?.totalTokensThisMonth.toLocaleString()}</div>
            </CardContent>
          </Card>

          <Card className="bg-card/50">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Top Model</CardTitle>
              <Cpu className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{statsLoading ? "-" : (stats?.topModel || "None")}</div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-8 md:grid-cols-3">
          <Card className="md:col-span-2 bg-card/50">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>API Keys</CardTitle>
                <CardDescription>Manage your access to the Engagera API.</CardDescription>
              </div>
              <Button onClick={() => setIsCreateOpen(true)} size="sm" className="gap-1">
                <Plus className="h-4 w-4" />
                Create Key
              </Button>
            </CardHeader>
            <CardContent>
              {keysLoading ? (
                <div className="py-8 text-center text-muted-foreground">Loading keys...</div>
              ) : apiKeys && apiKeys.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Prefix</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead>Last Used</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {apiKeys.map((key) => (
                      <TableRow key={key.id}>
                        <TableCell className="font-medium">{key.name}</TableCell>
                        <TableCell className="font-mono text-xs">{key.prefix}...</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {format(new Date(key.createdAt), "MMM d, yyyy")}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {key.lastUsedAt ? format(new Date(key.lastUsedAt), "MMM d, yyyy") : "Never"}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => {
                              setKeyToRevoke(key.id);
                              setIsRevokeOpen(true);
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="py-12 text-center border border-dashed rounded-lg">
                  <Key className="h-8 w-8 mx-auto text-muted-foreground mb-4 opacity-50" />
                  <p className="text-sm text-muted-foreground">No API keys found. Create one to get started.</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="bg-card/50">
            <CardHeader>
              <CardTitle>Recent Activity</CardTitle>
              <CardDescription>Latest API requests.</CardDescription>
            </CardHeader>
            <CardContent>
              {statsLoading ? (
                <div className="py-4 text-center text-sm text-muted-foreground">Loading...</div>
              ) : stats?.recentActivity && stats.recentActivity.length > 0 ? (
                <div className="space-y-4">
                  {stats.recentActivity.map((activity, i) => (
                    <div key={i} className="flex items-center justify-between border-b pb-4 last:border-0 last:pb-0">
                      <div>
                        <div className="text-sm font-medium">{activity.model}</div>
                        <div className="text-xs text-muted-foreground">{format(new Date(activity.createdAt), "MMM d, HH:mm")}</div>
                      </div>
                      <div className="text-sm font-mono">{activity.tokens} tkns</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-8 text-center text-sm text-muted-foreground">No recent activity</div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={isCreateOpen} onOpenChange={closeCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create API Key</DialogTitle>
            <DialogDescription>
              Create a new API key to access Engagera models.
            </DialogDescription>
          </DialogHeader>
          
          {createdKey ? (
            <div className="space-y-4">
              <Alert variant="default" className="bg-primary/10 border-primary/20">
                <ShieldAlert className="h-4 w-4 text-primary" />
                <AlertTitle className="text-primary font-medium">Save this key</AlertTitle>
                <AlertDescription className="text-primary/80">
                  Please copy this key and save it securely. You won't be able to see it again!
                </AlertDescription>
              </Alert>
              
              <div className="flex items-center space-x-2">
                <Input value={createdKey} readOnly className="font-mono text-sm" />
                <Button size="icon" variant="outline" onClick={handleCopy}>
                  {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
              
              <DialogFooter>
                <Button onClick={closeCreateDialog} className="w-full">I've saved it</Button>
              </DialogFooter>
            </div>
          ) : (
            <form onSubmit={handleCreateKey}>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Key Name</Label>
                  <Input 
                    id="name" 
                    placeholder="e.g. Production Web App" 
                    value={newKeyName}
                    onChange={(e) => setNewKeyName(e.target.value)}
                    required
                  />
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={closeCreateDialog}>Cancel</Button>
                <Button type="submit" disabled={createKey.isPending || !newKeyName.trim()}>
                  {createKey.isPending ? "Creating..." : "Create"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={isRevokeOpen} onOpenChange={setIsRevokeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revoke API Key</DialogTitle>
            <DialogDescription>
              Are you sure you want to revoke this API key? This action cannot be undone and any applications using this key will immediately lose access.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRevokeOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleRevoke} disabled={revokeKey.isPending}>
              {revokeKey.isPending ? "Revoking..." : "Revoke Key"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
