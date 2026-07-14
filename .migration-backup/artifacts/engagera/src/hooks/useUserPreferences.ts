import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "engagera_user_prefs";
const MAX_TOPICS = 20;

interface UserPreferences {
  topicCounts: Record<string, number>;
  modelUsage: Record<string, number>;
  messageCount: number;
  lastUpdated: string;
}

function loadPrefs(): UserPreferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return { topicCounts: {}, modelUsage: {}, messageCount: 0, lastUpdated: new Date().toISOString() };
}

function savePrefs(prefs: UserPreferences): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch { /* storage full */ }
}

const TOPIC_PATTERNS: [RegExp, string][] = [
  [/\b(python|javascript|typescript|react|node|css|html|sql|rust|go|java|c\+\+|swift|kotlin)\b/i, "programming"],
  [/\b(machine learning|ml|ai|neural|deep learning|model|training|dataset)\b/i, "ai/ml"],
  [/\b(debug|error|bug|fix|issue|crash|exception|stack trace)\b/i, "debugging"],
  [/\b(explain|what is|how does|describe|definition|meaning)\b/i, "explanations"],
  [/\b(write|draft|create|generate|compose|make)\b/i, "content creation"],
  [/\b(math|calculate|equation|formula|statistics|probability)\b/i, "math"],
  [/\b(api|backend|server|database|deployment|cloud|docker)\b/i, "backend/devops"],
  [/\b(design|ui|ux|frontend|interface|layout|style)\b/i, "design/frontend"],
  [/\b(business|strategy|marketing|product|startup|revenue)\b/i, "business"],
  [/\b(research|paper|study|analysis|data|report)\b/i, "research"],
];

function extractTopics(text: string): string[] {
  const found: string[] = [];
  for (const [pattern, topic] of TOPIC_PATTERNS) {
    if (pattern.test(text) && !found.includes(topic)) found.push(topic);
  }
  return found;
}

export function useUserPreferences() {
  const [prefs, setPrefs] = useState<UserPreferences>(loadPrefs);

  useEffect(() => {
    savePrefs(prefs);
  }, [prefs]);

  const recordMessage = useCallback((content: string, model: string) => {
    setPrefs((prev) => {
      const updated = { ...prev };
      updated.messageCount = (prev.messageCount ?? 0) + 1;
      updated.modelUsage = { ...prev.modelUsage };
      updated.modelUsage[model] = (updated.modelUsage[model] ?? 0) + 1;

      const topics = extractTopics(content);
      updated.topicCounts = { ...prev.topicCounts };
      for (const topic of topics) {
        updated.topicCounts[topic] = (updated.topicCounts[topic] ?? 0) + 1;
      }

      const entries = Object.entries(updated.topicCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, MAX_TOPICS);
      updated.topicCounts = Object.fromEntries(entries);
      updated.lastUpdated = new Date().toISOString();
      return updated;
    });
  }, []);

  const getContextHint = useCallback((): string | null => {
    const topTopics = Object.entries(prefs.topicCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([t]) => t);

    const favModel = Object.entries(prefs.modelUsage)
      .sort((a, b) => b[1] - a[1])[0]?.[0];

    if (topTopics.length === 0) return null;

    const parts: string[] = [`User frequently discusses: ${topTopics.join(", ")}.`];
    if (favModel) parts.push(`Preferred model: ${favModel}.`);
    parts.push("Tailor your responses to match this user's background and interests.");
    return parts.join(" ");
  }, [prefs]);

  return { prefs, recordMessage, getContextHint };
}
