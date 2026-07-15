import { buildAuthHeaders } from '@/lib/chat';
import { SUPABASE_URL } from '@/lib/supabase';
import type { SearchSource, TimeInfo } from '@/lib/chat';

const BASE_URL = `${SUPABASE_URL}/functions/v1/conversations`;

export interface ConversationSummary {
  id: number;
  title: string;
  model: string;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationMessage {
  id: number;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: string;
  sources?: SearchSource[];
  timeInfo?: TimeInfo;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = await buildAuthHeaders();
  const res = await fetch(`${BASE_URL}${path}`, { ...init, headers: { ...headers, ...init?.headers } });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? `Request failed (${res.status})`);
  }
  return res.json();
}

export function listConversations(): Promise<ConversationSummary[]> {
  return request<ConversationSummary[]>('');
}

export function fetchConversationMessages(id: number): Promise<ConversationMessage[]> {
  return request<ConversationMessage[]>(`/${id}/messages`);
}

export async function deleteConversation(id: number): Promise<void> {
  await request<{ success: boolean }>(`/${id}`, { method: 'DELETE' });
}
