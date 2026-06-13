import React, { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { useGetUsage, useGetUsageSummary } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";
import { Link } from "wouter";

export default function Usage() {
  const [days, setDays] = useState<"7" | "14" | "30">("7");
  const { user } = useAuth();
  const { data: summary, isLoading: summaryLoading } = useGetUsageSummary();
  const { data: records, isLoading: recordsLoading } = useGetUsage({ days: parseInt(days) });

  const statCards = [
    { label: "Total Tokens", value: summaryLoading ? "—" : (summary?.totalTokens ?? 0).toLocaleString() },
    { label: "Input Tokens", value: summaryLoading ? "—" : (summary?.totalInputTokens ?? 0).toLocaleString() },
    { label: "Output Tokens", value: summaryLoading ? "—" : (summary?.totalOutputTokens ?? 0).toLocaleString() },
    { label: "Est. Cost", value: summaryLoading ? "—" : `$${(((summary?.totalTokens ?? 0) / 1_000_000) * 0.15).toFixed(4)}` },
  ];

  return (
    <AppLayout showSidebar>
      <div className="p-6 md:p-8 max-w-6xl mx-auto space-y-8">

        {/* Guest banner */}
        {!user && (
          <div className="flex items-center justify-between gap-4 px-5 py-3.5 rounded-lg border border-amber-500/20 bg-amber-500/5">
            <div>
              <p className="text-sm font-medium text-amber-400">Sign in to see your usage</p>
              <p className="text-xs text-muted-foreground mt-0.5">Track token consumption, costs, and request logs.</p>
            </div>
            <div className="flex gap-2 shrink-0">
              <Link href="/sign-in">
                <Button variant="outline" size="sm" onClick={() => sessionStorage.setItem("engagera_return_to", "/usage")}>Sign in</Button>
              </Link>
              <Link href="/sign-up">
                <Button size="sm" onClick={() => sessionStorage.setItem("engagera_return_to", "/usage")}>Get started free</Button>
              </Link>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Usage</h1>
            <p className="text-sm text-muted-foreground mt-1">API consumption and token analytics</p>
          </div>
          <Select value={days} onValueChange={(v: any) => setDays(v)}>
            <SelectTrigger className="w-[140px] h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="14">Last 14 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {statCards.map(({ label, value }) => (
            <Card key={label} className="bg-card border-border">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="text-2xl font-bold tracking-tight font-mono">{value}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Charts */}
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Daily usage chart */}
          <Card className="lg:col-span-2 bg-card border-border">
            <CardHeader className="px-6 pt-6 pb-4">
              <CardTitle className="text-base font-semibold">Daily Usage</CardTitle>
              <CardDescription className="text-xs">Token consumption over the last {days} days</CardDescription>
            </CardHeader>
            <CardContent className="px-6 pb-6">
              <div className="h-56">
                {summaryLoading ? (
                  <div className="h-full flex items-center justify-center text-sm text-muted-foreground">Loading…</div>
                ) : summary?.dailyUsage && summary.dailyUsage.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={summary.dailyUsage} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                      <XAxis
                        dataKey="date"
                        tickFormatter={(val) => format(new Date(val), "MMM d")}
                        stroke="hsl(var(--muted-foreground))"
                        fontSize={11}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis
                        stroke="hsl(var(--muted-foreground))"
                        fontSize={11}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(val) => val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "hsl(var(--card))",
                          borderColor: "hsl(var(--border))",
                          borderRadius: "8px",
                          fontSize: "12px",
                        }}
                        labelFormatter={(val) => format(new Date(val), "MMM d, yyyy")}
                        cursor={{ fill: "hsl(var(--muted))" }}
                      />
                      <Bar dataKey="tokens" fill="hsl(var(--foreground))" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-sm text-muted-foreground">No data for this period</div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* By model */}
          <Card className="bg-card border-border">
            <CardHeader className="px-6 pt-6 pb-4">
              <CardTitle className="text-base font-semibold">By Model</CardTitle>
              <CardDescription className="text-xs">Token distribution</CardDescription>
            </CardHeader>
            <CardContent className="px-6 pb-6">
              {summaryLoading ? (
                <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>
              ) : summary?.byModel && summary.byModel.length > 0 ? (
                <div className="space-y-4">
                  {summary.byModel.map((model: { model: string; tokens: number }) => {
                    const pct = Math.min(100, Math.max(2, ((model.tokens / (summary.totalTokens || 1)) * 100)));
                    return (
                      <div key={model.model} className="space-y-2">
                        <div className="flex justify-between text-xs">
                          <span className="font-medium truncate pr-2">{model.model}</span>
                          <span className="font-mono text-muted-foreground shrink-0">{model.tokens.toLocaleString()}</span>
                        </div>
                        <div className="h-1 w-full rounded-full bg-muted overflow-hidden">
                          <div className="h-full rounded-full bg-foreground transition-all" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="py-8 text-center text-sm text-muted-foreground">No data available</div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Records table */}
        <Card className="bg-card border-border">
          <CardHeader className="px-6 pt-6 pb-4">
            <CardTitle className="text-base font-semibold">Request Log</CardTitle>
            <CardDescription className="text-xs">Detailed log of recent API requests</CardDescription>
          </CardHeader>
          <CardContent className="px-6 pb-6">
            {recordsLoading ? (
              <div className="py-10 text-center text-sm text-muted-foreground">Loading…</div>
            ) : Array.isArray(records) && records.length > 0 ? (
              <div className="rounded-lg border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border hover:bg-transparent">
                      <TableHead className="text-xs text-muted-foreground">Time</TableHead>
                      <TableHead className="text-xs text-muted-foreground">Model</TableHead>
                      <TableHead className="text-xs text-muted-foreground hidden sm:table-cell">Key</TableHead>
                      <TableHead className="text-xs text-muted-foreground text-right">In</TableHead>
                      <TableHead className="text-xs text-muted-foreground text-right">Out</TableHead>
                      <TableHead className="text-xs text-muted-foreground text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {records.map((record) => (
                      <TableRow key={record.id} className="border-border">
                        <TableCell className="text-xs text-muted-foreground font-mono">
                          {format(new Date(record.createdAt), "MMM d, HH:mm")}
                        </TableCell>
                        <TableCell className="text-sm font-medium">{record.model}</TableCell>
                        <TableCell className="text-xs text-muted-foreground hidden sm:table-cell">
                          {record.apiKeyName || "Playground"}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs text-muted-foreground">{record.inputTokens}</TableCell>
                        <TableCell className="text-right font-mono text-xs text-muted-foreground">{record.outputTokens}</TableCell>
                        <TableCell className="text-right font-mono text-xs font-semibold">{record.totalTokens}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="py-10 text-center text-sm text-muted-foreground">No records found for this period</div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
