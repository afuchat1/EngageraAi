import React, { useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { useGetUsage, useGetUsageSummary } from "@workspace/api-client-react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, CartesianGrid } from "recharts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format, subDays, parseISO } from "date-fns";

export default function Usage() {
  const [timeRange, setTimeRange] = useState("30");
  
  const { data: usageRecords = [], isLoading: recordsLoading } = useGetUsage({ days: parseInt(timeRange) });
  const { data: summary, isLoading: summaryLoading } = useGetUsageSummary();

  // Process data for charts
  // Group usage by date for the area chart
  const usageByDate = usageRecords.reduce((acc: any, record) => {
    const dateStr = format(parseISO(record.createdAt), "MMM dd");
    if (!acc[dateStr]) {
      acc[dateStr] = { date: dateStr, tokens: 0, requests: 0 };
    }
    acc[dateStr].tokens += record.totalTokens;
    acc[dateStr].requests += 1;
    return acc;
  }, {});

  const chartData = Object.values(usageByDate).sort((a: any, b: any) => {
     // Naive sort by assuming they are sequentially ordered from API, 
     // but ideally we'd sort by actual date object. The API returns descending.
     return 1; 
  }).reverse();

  // If chartData is empty, pad it with some zeroes for the UI
  if (chartData.length === 0 && !recordsLoading) {
    for(let i=6; i>=0; i--) {
      chartData.push({
        date: format(subDays(new Date(), i), "MMM dd"),
        tokens: 0,
        requests: 0
      });
    }
  }

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-black border border-white/20 p-3 shadow-xl">
          <p className="text-white/60 text-xs mb-2 font-mono uppercase">{label}</p>
          <p className="text-white text-sm font-medium">{payload[0].value.toLocaleString()} Tokens</p>
          <p className="text-white/60 text-xs mt-1">{payload[0].payload.requests} Requests</p>
        </div>
      );
    }
    return null;
  };

  return (
    <AppLayout title="Usage & Analytics">
      <div className="flex justify-end mb-6">
        <Select value={timeRange} onValueChange={setTimeRange}>
          <SelectTrigger className="w-[180px] bg-transparent border-white/20 rounded-none text-sm">
            <SelectValue placeholder="Select Range" />
          </SelectTrigger>
          <SelectContent className="bg-black border-white/20 rounded-none">
            <SelectItem value="7" className="rounded-none hover:bg-white/10">Last 7 Days</SelectItem>
            <SelectItem value="30" className="rounded-none hover:bg-white/10">Last 30 Days</SelectItem>
            <SelectItem value="90" className="rounded-none hover:bg-white/10">Last 90 Days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="p-6 border border-white/15 bg-white/[0.01]">
          <div className="text-white/60 text-[10px] uppercase font-mono tracking-wider mb-2">Total Tokens</div>
          <div className="text-3xl font-light">
            {summaryLoading ? "..." : summary?.totalTokens.toLocaleString() || "0"}
          </div>
        </div>
        <div className="p-6 border border-white/15 bg-white/[0.01]">
          <div className="text-white/60 text-[10px] uppercase font-mono tracking-wider mb-2">Total Requests</div>
          <div className="text-3xl font-light">
            {summaryLoading ? "..." : summary?.totalRequests.toLocaleString() || "0"}
          </div>
        </div>
        <div className="p-6 border border-white/15 bg-white/[0.01]">
          <div className="text-white/60 text-[10px] uppercase font-mono tracking-wider mb-2">Input Tokens</div>
          <div className="text-3xl font-light">
            {summaryLoading ? "..." : summary?.totalInputTokens.toLocaleString() || "0"}
          </div>
        </div>
        <div className="p-6 border border-white/15 bg-white/[0.01]">
          <div className="text-white/60 text-[10px] uppercase font-mono tracking-wider mb-2">Output Tokens</div>
          <div className="text-3xl font-light">
            {summaryLoading ? "..." : summary?.totalOutputTokens.toLocaleString() || "0"}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <div className="lg:col-span-2 border border-white/15 p-6 bg-white/[0.01]">
          <h3 className="text-sm font-medium mb-6 flex items-center justify-between">
            Token Usage Over Time
            {recordsLoading && <span className="text-[10px] text-white/40 uppercase font-mono">Loading...</span>}
          </h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorTokens" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ffffff" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="#ffffff" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis 
                  dataKey="date" 
                  stroke="rgba(255,255,255,0.4)" 
                  fontSize={10} 
                  tickLine={false} 
                  axisLine={false}
                  dy={10}
                />
                <YAxis 
                  stroke="rgba(255,255,255,0.4)" 
                  fontSize={10} 
                  tickLine={false} 
                  axisLine={false}
                  tickFormatter={(value) => value >= 1000 ? `${(value / 1000).toFixed(0)}k` : value}
                />
                <Tooltip content={<CustomTooltip />} />
                <Area 
                  type="monotone" 
                  dataKey="tokens" 
                  stroke="#ffffff" 
                  strokeWidth={2}
                  fillOpacity={1} 
                  fill="url(#colorTokens)" 
                  animationDuration={1000}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="border border-white/15 p-6 bg-white/[0.01]">
          <h3 className="text-sm font-medium mb-6">Model Distribution</h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={summary?.byModel || []} layout="vertical" margin={{ top: 0, right: 0, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={true} vertical={false} />
                <XAxis type="number" hide />
                <YAxis 
                  dataKey="model" 
                  type="category" 
                  stroke="rgba(255,255,255,0.6)" 
                  fontSize={10} 
                  tickLine={false} 
                  axisLine={false}
                  width={90}
                />
                <Tooltip 
                  cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      return (
                        <div className="bg-black border border-white/20 p-2 text-xs shadow-xl">
                          <span className="font-medium">{payload[0].value?.toLocaleString()}</span> tokens
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Bar 
                  dataKey="tokens" 
                  fill="#ffffff" 
                  radius={[0, 4, 4, 0]}
                  barSize={20}
                  animationDuration={1000}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
          {(!summary?.byModel || summary.byModel.length === 0) && !summaryLoading && (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-white/40 pointer-events-none">
              No model usage data
            </div>
          )}
        </div>
      </div>
      
      <div className="border border-white/15 overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="text-[10px] text-white/50 uppercase font-mono border-b border-white/15 bg-white/5 tracking-wider">
            <tr>
              <th className="px-6 py-4 font-normal">Date</th>
              <th className="px-6 py-4 font-normal">Model</th>
              <th className="px-6 py-4 font-normal text-right">Input Tokens</th>
              <th className="px-6 py-4 font-normal text-right">Output Tokens</th>
              <th className="px-6 py-4 font-normal text-right">Total Tokens</th>
            </tr>
          </thead>
          <tbody>
            {recordsLoading ? (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-white/40">Loading records...</td>
              </tr>
            ) : usageRecords.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-white/40">No usage records found.</td>
              </tr>
            ) : (
              usageRecords.slice(0, 10).map((record) => (
                <tr key={record.id} className="border-b border-white/10 last:border-0 hover:bg-white/[0.02]">
                  <td className="px-6 py-4 text-white/80">{new Date(record.createdAt).toLocaleString()}</td>
                  <td className="px-6 py-4 text-white/80"><span className="px-2 py-0.5 border border-white/10 text-[10px] font-mono rounded">{record.model}</span></td>
                  <td className="px-6 py-4 text-white/60 text-right font-mono">{record.inputTokens.toLocaleString()}</td>
                  <td className="px-6 py-4 text-white/60 text-right font-mono">{record.outputTokens.toLocaleString()}</td>
                  <td className="px-6 py-4 font-medium text-right font-mono">{record.totalTokens.toLocaleString()}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        {usageRecords.length > 10 && (
          <div className="p-4 text-center border-t border-white/15 text-xs text-white/40">
            Showing latest 10 records. Use API for full export.
          </div>
        )}
      </div>
    </AppLayout>
  );
}
