import React, { useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { useGetUsage, useGetUsageSummary } from "@workspace/api-client-react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  BarChart, Bar, CartesianGrid,
} from "recharts";
import { format, subDays, parseISO, startOfDay, endOfDay, differenceInCalendarDays } from "date-fns";
import { TrendingUp, Hash, ArrowRight, ArrowUpRight, ArrowDownRight } from "lucide-react";

function toDateInputValue(d: Date) {
  return d.toISOString().slice(0, 10);
}

function StatCard({
  label, value, loading, icon: Icon,
}: {
  label: string; value: string | number | undefined; loading: boolean; icon: React.ElementType;
}) {
  return (
    <div className="rounded-2xl bg-white/[0.04] p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[10px] font-mono uppercase tracking-widest text-white/30">{label}</p>
        <Icon className="w-3.5 h-3.5 text-white/20" />
      </div>
      <p className="text-3xl font-light tracking-tight">
        {loading ? "—" : (value?.toLocaleString() ?? "0")}
      </p>
    </div>
  );
}

export default function Usage() {
  const defaultTo   = new Date();
  const defaultFrom = subDays(defaultTo, 29);

  const [fromDate, setFromDate] = useState(toDateInputValue(defaultFrom));
  const [toDate,   setToDate]   = useState(toDateInputValue(defaultTo));

  const { data: allRecords = [], isLoading: recordsLoading } = useGetUsage({ days: 90 });
  const { data: summary, isLoading: summaryLoading } = useGetUsageSummary();

  const from = startOfDay(new Date(fromDate + "T00:00:00"));
  const to   = endOfDay(new Date(toDate   + "T00:00:00"));

  const usageRecords = allRecords.filter((r) => {
    const d = new Date(r.createdAt);
    return d >= from && d <= to;
  });

  const byDate: Record<string, { date: string; tokens: number; requests: number }> = {};
  usageRecords.forEach((r) => {
    const key = format(parseISO(r.createdAt), "MMM dd");
    if (!byDate[key]) byDate[key] = { date: key, tokens: 0, requests: 0 };
    byDate[key].tokens   += r.totalTokens;
    byDate[key].requests += 1;
  });

  const diffDays = Math.min(differenceInCalendarDays(to, from) + 1, 90);
  const chartData = Array.from({ length: diffDays }, (_, i) => {
    const d = format(subDays(to, diffDays - 1 - i), "MMM dd");
    return byDate[d] ?? { date: d, tokens: 0, requests: 0 };
  });

  const ChartTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-[#111] rounded-xl px-3 py-2.5 shadow-2xl text-xs">
        <p className="text-white/40 font-mono mb-1.5 uppercase tracking-wider text-[10px]">{label}</p>
        <p className="text-white font-medium">{payload[0].value.toLocaleString()} tokens</p>
        <p className="text-white/40 mt-0.5">{payload[0].payload.requests} requests</p>
      </div>
    );
  };

  return (
    <AppLayout title="Usage & Analytics">

      {/* Date range */}
      <div className="flex items-center gap-2 justify-end mb-6">
        <input
          type="date"
          value={fromDate}
          max={toDate}
          onChange={(e) => setFromDate(e.target.value)}
          className="bg-white/[0.04] text-sm text-white/80 px-3 py-1.5 rounded-xl outline-none focus:bg-white/[0.07] transition-colors [color-scheme:dark]"
        />
        <ArrowRight className="w-3.5 h-3.5 text-white/20 shrink-0" />
        <input
          type="date"
          value={toDate}
          min={fromDate}
          max={toDateInputValue(new Date())}
          onChange={(e) => setToDate(e.target.value)}
          className="bg-white/[0.04] text-sm text-white/80 px-3 py-1.5 rounded-xl outline-none focus:bg-white/[0.07] transition-colors [color-scheme:dark]"
        />
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total Tokens"   value={summary?.totalTokens}       loading={summaryLoading} icon={TrendingUp} />
        <StatCard label="Total Requests" value={summary?.totalRequests}     loading={summaryLoading} icon={Hash} />
        <StatCard label="Input Tokens"   value={summary?.totalInputTokens}  loading={summaryLoading} icon={ArrowUpRight} />
        <StatCard label="Output Tokens"  value={summary?.totalOutputTokens} loading={summaryLoading} icon={ArrowDownRight} />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <div className="lg:col-span-2 rounded-2xl bg-white/[0.03] p-5">
          <div className="flex items-center justify-between mb-5">
            <p className="text-sm font-medium">Token Usage</p>
            {recordsLoading && (
              <span className="text-[10px] text-white/30 uppercase font-mono tracking-wider">Loading…</span>
            )}
          </div>
          <div className="h-60 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="tokGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#fff" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#fff" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis
                  dataKey="date" stroke="rgba(255,255,255,0.3)" fontSize={10}
                  tickLine={false} axisLine={false} dy={8}
                  interval="preserveStartEnd"
                />
                <YAxis
                  stroke="rgba(255,255,255,0.3)" fontSize={10} tickLine={false} axisLine={false}
                  tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v)}
                />
                <Tooltip content={<ChartTooltip />} />
                <Area
                  type="monotone" dataKey="tokens" stroke="#ffffff" strokeWidth={1.5}
                  fillOpacity={1} fill="url(#tokGrad)" animationDuration={500}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl bg-white/[0.03] p-5 relative">
          <p className="text-sm font-medium mb-5">Model Distribution</p>
          <div className="h-60 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={summary?.byModel || []}
                layout="vertical"
                margin={{ top: 0, right: 0, left: 10, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" horizontal={false} />
                <XAxis type="number" hide />
                <YAxis
                  dataKey="model" type="category"
                  stroke="rgba(255,255,255,0.4)" fontSize={10}
                  tickLine={false} axisLine={false} width={80}
                />
                <Tooltip
                  cursor={{ fill: "rgba(255,255,255,0.04)" }}
                  content={({ active, payload }) =>
                    active && payload?.length ? (
                      <div className="bg-[#111] rounded-xl px-3 py-2 text-xs shadow-2xl">
                        <span className="font-medium">{payload[0].value?.toLocaleString()}</span> tokens
                      </div>
                    ) : null
                  }
                />
                <Bar dataKey="tokens" fill="#ffffff" radius={[0, 6, 6, 0]} barSize={16} animationDuration={500} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          {(!summary?.byModel || summary.byModel.length === 0) && !summaryLoading && (
            <div className="absolute inset-0 flex items-center justify-center text-xs text-white/30 pointer-events-none">
              No model data yet
            </div>
          )}
        </div>
      </div>

      {/* Records table */}
      <div className="rounded-2xl bg-white/[0.03] overflow-hidden">
        <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-4 px-5 py-3 text-[10px] font-mono uppercase tracking-widest text-white/25">
          <span>Date</span>
          <span className="hidden sm:block">Model</span>
          <span className="text-right hidden md:block">Input</span>
          <span className="text-right hidden md:block">Output</span>
          <span className="text-right">Total</span>
        </div>
        <div className="divide-y divide-white/[0.05]">
          {recordsLoading ? (
            <div className="px-5 py-8 text-center text-sm text-white/30">Loading records…</div>
          ) : usageRecords.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <TrendingUp className="w-8 h-8 text-white/15 mx-auto mb-3" />
              <p className="text-sm text-white/40">No usage records in this range.</p>
            </div>
          ) : (
            usageRecords.slice(0, 50).map((record) => (
              <div
                key={record.id}
                className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-4 items-center px-5 py-3 hover:bg-white/[0.02] transition-colors"
              >
                <span className="text-xs text-white/60">
                  {new Date(record.createdAt).toLocaleString()}
                </span>
                <span className="hidden sm:block">
                  <span className="text-[10px] font-mono text-white/40 px-2 py-0.5 bg-white/[0.06] rounded-full">
                    {record.model}
                  </span>
                </span>
                <span className="hidden md:block text-xs font-mono text-white/40 text-right">
                  {record.inputTokens.toLocaleString()}
                </span>
                <span className="hidden md:block text-xs font-mono text-white/40 text-right">
                  {record.outputTokens.toLocaleString()}
                </span>
                <span className="text-xs font-mono font-medium text-right">
                  {record.totalTokens.toLocaleString()}
                </span>
              </div>
            ))
          )}
        </div>
        {usageRecords.length > 50 && (
          <div className="px-5 py-3 text-center text-xs text-white/30 border-t border-white/[0.05]">
            Showing 50 most recent records in selected range.
          </div>
        )}
      </div>
    </AppLayout>
  );
}
