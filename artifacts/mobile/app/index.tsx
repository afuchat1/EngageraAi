import React, { useCallback, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChatTabView } from '@/components/ChatTabView';
import { BrowserTab } from '@/components/BrowserTab';
import { BottomTabBar, type Tab } from '@/components/BottomTabBar';
import { Sidebar } from '@/components/Sidebar';
import { SearchEngine } from '@/components/SearchEngine';
import { useChatSession } from '@/hooks/useChatSession';
import { CHAT_MODEL, LAB_MODEL } from '@/lib/chat';
import { fetchConversationMessages, type ConversationSummary } from '@/lib/conversations';
import type { DisplayMessage } from '@/components/ChatBubble';

/**
 * Root screen — four independent navigation stacks (Chat, Search, Lab, Browser).
 *
 * All four tab panels are always mounted; inactive ones are hidden with
 * display:'none'. This preserves every tab's state (AI response in-flight,
 * search results, browser page, lab workspace) across tab switches with no
 * reloads and no white-screen transitions.
 */
export default function MainScreen() {
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<Tab>('chat');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);

  // Both chat sessions are kept alive at the root so the Sidebar can access
  // conversation history and route back to the correct tab.
  const chatSession = useChatSession(CHAT_MODEL);
  const labSession  = useChatSession(LAB_MODEL, 'research');

  // ── Tab switching ──────────────────────────────────────────────────────
  const handleTabPress = useCallback((tab: Tab) => {
    setActiveTab(tab);
    setSidebarOpen(false);
  }, []);

  // ── Sidebar ────────────────────────────────────────────────────────────
  const handleOpenSidebar = useCallback(() => {
    setSidebarOpen(true);
    setRefreshToken((t) => t + 1);
  }, []);

  /** "New chat" from the sidebar resets both sessions (clean slate). */
  const handleNewChatAll = useCallback(() => {
    chatSession.startNewConversation();
    labSession.startNewConversation();
    setSidebarOpen(false);
  }, [chatSession, labSession]);

  /** "New chat" from a tab header only resets that tab's session. */
  const handleNewChatForTab = useCallback(
    (tab: Tab) => {
      if (tab === 'chat') chatSession.startNewConversation();
      if (tab === 'lab')  labSession.startNewConversation();
    },
    [chatSession, labSession],
  );

  const handleSelectConversation = useCallback(
    async (conv: ConversationSummary) => {
      const targetTab: Tab = conv.model === LAB_MODEL ? 'lab' : 'chat';
      const target = targetTab === 'lab' ? labSession : chatSession;
      try {
        const history = await fetchConversationMessages(conv.id);
        const displayMessages: DisplayMessage[] = history
          .filter((m) => m.role === 'user' || m.role === 'assistant')
          .map((m) => ({
            id: String(m.id),
            role: m.role as 'user' | 'assistant',
            text: m.content,
            searchInfo:
              m.sources && m.sources.length > 0
                ? { query: '', sources: m.sources }
                : undefined,
            timeInfo: m.timeInfo,
            weatherInfo: m.weatherInfo,
          }));
        target.loadConversation(conv.id, displayMessages);
        setActiveTab(targetTab);
        setSidebarOpen(false);
      } catch {
        Alert.alert('Could not open chat', 'Please check your connection and try again.');
      }
    },
    [chatSession, labSession],
  );

  const activeConversationId =
    activeTab === 'lab' ? labSession.conversationId : chatSession.conversationId;

  return (
    <View style={styles.root}>
      {/* ── Chat Tab ──────────────────────────────────────────────────────
          State preserved: conversation, streaming response, scroll, input,
          attached image, conversation history. */}
      <View style={[styles.tab, activeTab !== 'chat' && styles.hidden]}>
        <ChatTabView
          session={chatSession}
          title="Engagera"
          placeholder="Message Engagera…"
          emptyTitle="Ask me anything"
          emptyBody="Attach a photo and I can read, describe, or reason about it too."
          onOpenSidebar={handleOpenSidebar}
          onNewChat={() => handleNewChatForTab('chat')}
        />
      </View>

      {/* ── Search Tab ────────────────────────────────────────────────────
          State preserved: query, filters, results, scroll, open preview,
          image/news tabs. SearchEngine manages its own internal state. */}
      <View
        style={[
          styles.tab,
          activeTab !== 'search' && styles.hidden,
          { paddingTop: insets.top },
        ]}
      >
        <SearchEngine topPad={0} />
      </View>

      {/* ── Lab Tab ───────────────────────────────────────────────────────
          State preserved: deep-research conversation, streaming response,
          scroll, input, conversation history. Independent from Chat. */}
      <View style={[styles.tab, activeTab !== 'lab' && styles.hidden]}>
        <ChatTabView
          session={labSession}
          title="Lab"
          placeholder="Research with Engagera…"
          emptyTitle="Deep research mode"
          emptyBody="Ask complex questions. Lab uses a more powerful model optimised for research."
          onOpenSidebar={handleOpenSidebar}
          onNewChat={() => handleNewChatForTab('lab')}
        />
      </View>

      {/* ── Browser Tab ───────────────────────────────────────────────────
          State preserved: current page, back/forward history, scroll,
          loading progress. WebView stays mounted behind display:none. */}
      <View style={[styles.tab, activeTab !== 'browser' && styles.hidden]}>
        <BrowserTab />
      </View>

      {/* ── Bottom Tab Bar ────────────────────────────────────────────────
          Switches between the four stacks. Tab press closes the sidebar. */}
      <BottomTabBar activeTab={activeTab} onTabPress={handleTabPress} />

      {/* ── Sidebar (Chat + Lab) ──────────────────────────────────────────
          Shared across Chat and Lab tabs. Selecting a conversation routes
          to the correct tab based on the conversation's model. */}
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onNewChat={handleNewChatAll}
        onSelectConversation={handleSelectConversation}
        activeConversationId={activeConversationId}
        refreshToken={refreshToken}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  tab: { flex: 1 },
  hidden: { display: 'none' },
});
