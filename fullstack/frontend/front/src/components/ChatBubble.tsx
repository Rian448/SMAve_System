'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { api, type ChatMessage } from '@/lib/api';

const ROLE_COLOR: Record<string, string> = {
  administrator: 'bg-[#011c72]',
  supervisor:    'bg-purple-700',
};

function initials(name: string) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function formatDay(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
}

export default function ChatBubble() {
  const { user } = useAuth();

  // ── All hooks unconditionally at the top ──────────────────────────────────
  const [open, setOpen]         = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput]       = useState('');
  const [sending, setSending]   = useState(false);
  const [unread, setUnread]     = useState(0);
  const lastSeenId  = useRef<number>(0);
  const latestTs    = useRef<string | null>(null);
  const bottomRef   = useRef<HTMLDivElement>(null);
  const inputRef    = useRef<HTMLTextAreaElement>(null);
  const pollRef     = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchMessages = useCallback(async (sinceParam?: string) => {
    if (!user) return;
    try {
      const res = await api.chat.list(sinceParam ?? undefined);
      const msgs: ChatMessage[] = (res as any).data ?? res ?? [];
      if (!Array.isArray(msgs) || msgs.length === 0) return;

      if (sinceParam) {
        setMessages(prev => {
          const existingIds = new Set(prev.map(m => m.id));
          const fresh = msgs.filter(m => !existingIds.has(m.id));
          if (fresh.length === 0) return prev;
          if (!open) setUnread(u => u + fresh.filter(m => m.senderId !== user.id).length);
          return [...prev, ...fresh];
        });
      } else {
        setMessages(msgs);
        lastSeenId.current = msgs[msgs.length - 1]?.id ?? 0;
      }
      const last = msgs[msgs.length - 1];
      if (last) latestTs.current = last.createdAt;
    } catch { /* ignore */ }
  }, [open, user]);

  // Initial load
  useEffect(() => { fetchMessages(); }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  // Polling: 3s when open, 15s when closed
  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(
      () => fetchMessages(latestTs.current ?? undefined),
      open ? 3000 : 15000,
    );
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [open, fetchMessages]);

  // Scroll to bottom when messages change and panel is open
  useEffect(() => {
    if (open) setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
  }, [messages, open]);

  // Clear unread and focus input when opening
  useEffect(() => {
    if (open) {
      setUnread(0);
      lastSeenId.current = messages[messages.length - 1]?.id ?? 0;
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Early return AFTER all hooks ─────────────────────────────────────────
  const allowed = user?.role === 'administrator' || user?.role === 'supervisor';
  if (!allowed) return null;

  // ── Handlers ──────────────────────────────────────────────────────────────
  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    setInput('');
    try {
      const res = await api.chat.send(text);
      const msg: ChatMessage = (res as any).data ?? res;
      if (msg?.id) {
        setMessages(prev => [...prev, msg]);
        latestTs.current = msg.createdAt;
      }
    } catch { /* ignore */ } finally { setSending(false); }
  };

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  // Group messages by day
  const grouped: { day: string; msgs: ChatMessage[] }[] = [];
  for (const m of messages) {
    const day = formatDay(m.createdAt);
    if (!grouped.length || grouped[grouped.length - 1].day !== day) {
      grouped.push({ day, msgs: [m] });
    } else {
      grouped[grouped.length - 1].msgs.push(m);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-3">

      {/* Chat panel */}
      {open && (
        <div className="w-80 bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden"
          style={{ height: '480px' }}>

          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-[#011c72] text-white">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/>
              </svg>
              <span className="text-sm font-semibold">Team Chat</span>
              <span className="text-xs text-white/60">Admin &amp; Supervisors</span>
            </div>
            <button onClick={() => setOpen(false)}
              className="p-1 rounded-lg hover:bg-white/20 transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/>
              </svg>
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <svg className="w-10 h-10 text-gray-200 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/>
                </svg>
                <p className="text-xs text-gray-400">No messages yet. Say hi!</p>
              </div>
            )}
            {grouped.map(group => (
              <div key={group.day}>
                <div className="flex items-center gap-2 my-2">
                  <div className="flex-1 h-px bg-gray-100" />
                  <span className="text-[10px] text-gray-400 font-medium px-1">{group.day}</span>
                  <div className="flex-1 h-px bg-gray-100" />
                </div>
                <div className="space-y-2">
                  {group.msgs.map((m, i) => {
                    const isMe      = m.senderId === user!.id;
                    const prevSame  = i > 0 && group.msgs[i - 1].senderId === m.senderId;
                    const avatarBg  = ROLE_COLOR[m.senderRole] || 'bg-gray-500';
                    return (
                      <div key={m.id} className={`flex items-end gap-2 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                        <div className="w-7 shrink-0">
                          {!prevSame && !isMe && (
                            <div className={`w-7 h-7 rounded-full ${avatarBg} flex items-center justify-center text-white text-[10px] font-bold`}>
                              {initials(m.senderName)}
                            </div>
                          )}
                        </div>
                        <div className={`flex flex-col max-w-50 ${isMe ? 'items-end' : 'items-start'}`}>
                          {!prevSame && (
                            <span className="text-[10px] text-gray-400 mb-0.5 px-1">
                              {isMe ? 'You' : m.senderName}
                            </span>
                          )}
                          <div className={`px-3 py-2 rounded-2xl text-sm leading-snug whitespace-pre-wrap wrap-break-word
                            ${isMe ? 'bg-[#011c72] text-white rounded-br-sm' : 'bg-gray-100 text-gray-900 rounded-bl-sm'}`}>
                            {m.content}
                          </div>
                          <span className="text-[10px] text-gray-400 mt-0.5 px-1">{formatTime(m.createdAt)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="border-t border-gray-100 px-3 py-2 flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={onKey}
              rows={1}
              placeholder="Message… (Enter to send)"
              className="flex-1 resize-none rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 focus:ring-2 focus:ring-[#011c72] focus:border-transparent outline-none max-h-24 overflow-y-auto"
              style={{ minHeight: '38px' }}
            />
            <button onClick={send} disabled={sending || !input.trim()}
              className="p-2 rounded-xl bg-[#011c72] text-white hover:bg-[#022a9e] disabled:opacity-40 transition-colors shrink-0">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/>
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Bubble button */}
      <button onClick={() => setOpen(o => !o)}
        className="relative w-13 h-13 rounded-full bg-[#011c72] text-white shadow-lg hover:bg-[#022a9e] hover:scale-105 active:scale-95 transition-all flex items-center justify-center"
        title="Team Chat">
        {open ? (
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/>
          </svg>
        ) : (
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/>
          </svg>
        )}
        {!open && unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-4.5 h-4.5 px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
    </div>
  );
}
