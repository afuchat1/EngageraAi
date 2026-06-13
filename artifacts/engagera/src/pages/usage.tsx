import React, { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { useGetUsage, useGetUsageSummary } from "@workspace/api-client-react";
import { format } from "date-fns";

export default function Usage() {
  const [days, setDays] = useState<"7" | "14" | "30">("7");
  const { data: summary, isLoading: summaryLoading } = useGetUsageSummary();
  const { data: records, isLoading: recordsLoading } = useGetUsage({ days: parseInt(days) });

  return (
    <AppLayout requireAuth showSidebar>
      <div className="p-8 max-w-6xl mx-auto space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Usage & Billing</h1>
            <p className="text-muted-foreground mt-2">Monitor your API consumption and costs.</p>
          </div>
          <Select value={days} onValueChange={(v: any) => setDays(v)}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Select range" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="14">Last 14 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <Card className="bg-card/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Tokens</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summaryLoading ? "-" : summary?.totalTokens.toLocaleString()}</div>
            </CardContent>
          </Card>
          <Card className="bg-card/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Input Tokens</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summaryLoading ? "-" : summary?.totalInputTokens.toLocaleString()}</div>
            </CardContent>
          </Card>
          <Card className="bg-card/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Output Tokens</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summaryLoading ? "-" : summary?.totalOutputTokens.toLocaleString()}</div>
            </CardContent>
          </Card>
          <Card className="bg-card/50 border-primary/20 bg-primary/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-primary">Est. Cost</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">
                ${summaryLoading ? "-" : ((summary?.totalTokens || 0) / 1000000 * 0.15).toFixed(2)}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-8 md:grid-cols-3">
          <Card className="md:col-span-2 bg-card/50">
            <CardHeader>
              <CardTitle>Daily Usage</CardTitle>
              <CardDescription>Token consumption over the last {days} days.</CardDescription>
            </CardHeader>
            <CardContent className="h-[300px]">
              {summaryLoading ? (
                <div className="h-full flex items-center justify-center text-muted-foreground">Loading chart...</div>
              ) : summary?.dailyUsage && summary.dailyUsage.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={summary.dailyUsage} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis 
                      dataKey="date" 
                      tickFormatter={(val) => format(new Date(val), 'MMM d')}
                      stroke="hsl(var(--muted-foreground))"
                      fontSize={12}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis 
                      stroke="hsl(var(--muted-foreground))" 
                      fontSize={12}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(val) => val >= 1000 ? `${(val/1000).toFixed(0)}k` : val}
                    />
                    <Tooltip 
                      contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
                      labelFormatter={(val) => format(new Date(val), 'MMM d, yyyy')}
                    />
                    <Bar dataKey="tokens" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground">No data available</div>
              )}
            </CardContent>
          </Card>

          <Card className="bg-card/50">
            <CardHeader>
              <CardTitle>By Model</CardTitle>
              <CardDescription>Token breakdown.</CardDescription>
            </CardHeader>
            <CardContent>
              {summaryLoading ? (
                <div className="text-center py-8 text-muted-foreground">Loading...</div>
              ) : summary?.byModel && summary.byModel.length > 0 ? (
                <div className="space-y-4">
                  {summary.byModel.map((model) => (
                    <div key={model.model} className="space-y-2 border-b pb-4 last:border-0 last:pb-0">
                      <div className="flex justify-between text-sm">
                        <span className="font-medium">{model.model}</span>
                        <span className="font-mono">{model.tokens.toLocaleString()} tkns</span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                        <div 
                          className="bg-primary h-1.5 rounded-full" 
                          style={{ width: `${Math.min(100, Math.max(2, (model.tokens / summary.totalTokens) * 100))}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">No data available</div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="bg-card/50">
          <CardHeader>
            <CardTitle>Recent Records</CardTitle>
            <CardDescription>Detailed log of your API requests.</CardDescription>
          </CardHeader>
          <CardContent>
            {recordsLoading ? (
              <div className="py-8 text-center text-muted-foreground">Loading records...</div>
            ) : records && records.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Model</TableHead>
                    <TableHead>API Key</TableHead>
                    <TableHead className="text-right">Input</TableHead>
                    <TableHead className="text-right">Output</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {records.map((record) => (
                    <TableRow key={record.id}>
                      <TableCell className="text-xs text-muted-foreground">{format(new Date(record.createdAt), "MMM d, HH:mm:ss")}</TableCell>
                      <TableCell className="font-medium">{record.model}</TableCell>
                      <TableCell className="text-xs">{record.apiKeyName || "Playground"}</TableCell>
                      <TableCell className="text-right font-mono text-xs">{record.inputTokens}</TableCell>
                      <TableCell className="text-right font-mono text-xs">{record.outputTokens}</TableCell>
                      <TableCell className="text-right font-mono text-xs font-medium text-primary">{record.totalTokens}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="py-8 text-center text-muted-foreground">No records found for this period.</div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
