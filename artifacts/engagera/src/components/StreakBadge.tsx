import React from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";

interface StreakResult {
  current: number;
  longest: number;
  totalDays: number;
}

function calcStreak(dates: string[]): StreakResult {
  if (dates.length === 0) return { current: 0, longest: 0, totalDays: 0 };
  const unique = [...new Set(dates.map((d) => d.slice(0, 10)))].sort().reverse();
  const totalDays = unique.length;
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

  let current = 0;
  if (unique[0] === today || unique[0] === yesterday) {
    current = 1;
    for (let i = 1; i < unique.length; i++) {
      const diffMs = new Date(unique[i - 1]).getTime() - new Date(unique[i]).getTime();
      if (Math.round(diffMs / 86_400_000) === 1) { current++; } else { break; }
    }
  }

  let longest = 0;
  let streak = 1;
  for (let i = 1; i < unique.length; i++) {
    const diffMs = new Date(unique[i - 1]).getTime() - new Date(unique[i]).getTime();
    if (Math.round(diffMs / 86_400_000) === 1) {
      streak++;
      longest = Math.max(longest, streak);
    } else {
      streak = 1;
    }
  }
  longest = Math.max(longest, current, unique.length > 0 ? 1 : 0);
  return { current, longest, totalDays };
}

export function StreakBadge() {
  const { user } = useAuth();
  const { data } = useQuery<StreakResult>({
    queryKey: ["streak", user?.id],
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase
        .from("engagera_usage_records")
        .select("created_at")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(200);
      return calcStreak(((data ?? []) as { created_at: string }[]).map((r) => r.created_at));
    },
  });

  if (!data || data.current === 0) return null;

  const { current, longest, totalDays } = data;
  const flameColor =
    current >= 14
      ? "text-orange-400"
      : current >= 7
      ? "text-yellow-400"
      : current >= 3
      ? "text-amber-400"
      : "text-zinc-500";

  return (
    <div className="flex items-center gap-4 rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3 w-fit">
      <div className="flex items-center gap-2.5">
        <span className={`text-xl leading-none ${flameColor}`}>🔥</span>
        <div>
          <p className="text-[10px] font-mono uppercase tracking-widest text-white/35 mb-0.5">Streak</p>
          <p className="text-sm font-semibold text-foreground">
            {current} day{current !== 1 ? "s" : ""}
          </p>
        </div>
      </div>
      {longest > current && (
        <>
          <div className="h-6 w-px bg-white/[0.06]" />
          <div>
            <p className="text-[10px] font-mono uppercase tracking-widest text-white/35 mb-0.5">Best</p>
            <p className="text-sm font-semibold text-foreground">{longest}d</p>
          </div>
        </>
      )}
      <div className="h-6 w-px bg-white/[0.06]" />
      <div>
        <p className="text-[10px] font-mono uppercase tracking-widest text-white/35 mb-0.5">Total days</p>
        <p className="text-sm font-semibold text-foreground">{totalDays}</p>
      </div>
    </div>
  );
}
