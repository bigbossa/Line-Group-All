import React, { useEffect, useState, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { MessageSquare, Settings, Bell, BellOff, Send } from 'lucide-react';

interface Group {
  id: string;
  name: string;
  pictureUrl?: string;
}

interface Message {
  id: string;
  text: string;
  sender: string;
  timestamp: number;
  isMe: boolean;
}

export default function App() {
  const [isConfigured, setIsConfigured] = useState<boolean | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [messages, setMessages] = useState<Record<string, Message[]>>({});
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [hiddenGroups, setHiddenGroups] = useState<Set<string>>(new Set());
  const [inputText, setInputText] = useState('');
  const socketRef = useRef<Socket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/config-check')
      .then(res => res.json())
      .then(data => setIsConfigured(data.isConfigured));

    fetch('/api/groups')
      .then(res => res.json())
      .then(data => setGroups(data));

    socketRef.current = io();

    socketRef.current.on('group_updated', (group: Group) => {
      setGroups(prev => {
        if (prev.find(g => g.id === group.id)) return prev;
        return [...prev, group];
      });
    });

    socketRef.current.on('new_message', ({ groupId, message }: { groupId: string, message: Message }) => {
      setMessages(prev => ({
        ...prev,
        [groupId]: [...(prev[groupId] || []), message]
      }));
    });

    return () => {
      socketRef.current?.disconnect();
    };
  }, []);

  useEffect(() => {
    if (selectedGroupId && !messages[selectedGroupId]) {
      fetch(`/api/messages/${selectedGroupId}`)
        .then(res => res.json())
        .then(data => {
          setMessages(prev => ({ ...prev, [selectedGroupId]: data }));
        });
    }
  }, [selectedGroupId, messages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, selectedGroupId]);

  const toggleGroupVisibility = (groupId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setHiddenGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
    if (selectedGroupId === groupId) setSelectedGroupId(null);
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGroupId || !inputText.trim()) return;

    const text = inputText;
    setInputText('');

    try {
      await fetch('/api/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupId: selectedGroupId, text })
      });
    } catch (err) {
      console.error('Failed to send', err);
    }
  };

  if (isConfigured === false) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center">
          <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-6">
            <Settings size={32} />
          </div>
          <h1 className="text-2xl font-bold text-zinc-900 mb-2">LINE API Setup Required</h1>
          <p className="text-zinc-600 mb-6">
            To use this dashboard, you need to configure your LINE Channel Access Token and Secret in the environment variables.
          </p>
          <div className="bg-zinc-100 rounded-lg p-4 text-left text-sm font-mono text-zinc-800 mb-6 overflow-x-auto">
            LINE_CHANNEL_ACCESS_TOKEN=...<br/>
            LINE_CHANNEL_SECRET=...
          </div>
          <p className="text-sm text-zinc-500">
            Webhook URL: <br/>
            <span className="font-mono text-xs bg-zinc-200 px-1 py-0.5 rounded">{window.location.origin}/webhook</span>
          </p>
        </div>
      </div>
    );
  }

  const visibleGroups = groups.filter(g => !hiddenGroups.has(g.id));
  const hiddenGroupsList = groups.filter(g => hiddenGroups.has(g.id));

  return (
    <div className="flex h-screen bg-zinc-100 font-sans">
      {/* Sidebar */}
      <div className="w-80 bg-white border-r border-zinc-200 flex flex-col">
        <div className="p-4 border-b border-zinc-200 bg-zinc-50">
          <h1 className="text-xl font-bold text-zinc-800 flex items-center gap-2">
            <MessageSquare className="text-emerald-500" />
            LINE Hub
          </h1>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="p-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">
            Active Groups ({visibleGroups.length})
          </div>
          {visibleGroups.length === 0 && (
            <div className="px-4 py-8 text-center text-zinc-400 text-sm">
              No active groups. Waiting for messages...
            </div>
          )}
          {visibleGroups.map(group => (
            <div
              key={group.id}
              onClick={() => setSelectedGroupId(group.id)}
              className={`flex items-center gap-3 p-3 mx-2 rounded-xl cursor-pointer transition-colors ${
                selectedGroupId === group.id ? 'bg-emerald-50 border border-emerald-100' : 'hover:bg-zinc-50'
              }`}
            >
              <div className="w-10 h-10 rounded-full bg-zinc-200 flex-shrink-0 overflow-hidden">
                {group.pictureUrl ? (
                  <img src={group.pictureUrl} alt={group.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-zinc-500 font-bold">
                    {group.name.charAt(0)}
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-zinc-900 truncate">{group.name}</div>
                <div className="text-xs text-zinc-500 truncate">
                  {messages[group.id]?.length ? messages[group.id][messages[group.id].length - 1].text : 'No messages yet'}
                </div>
              </div>
              <button
                onClick={(e) => toggleGroupVisibility(group.id, e)}
                className="p-2 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-200 rounded-full transition-colors"
                title="Hide group"
              >
                <BellOff size={16} />
              </button>
            </div>
          ))}

          {hiddenGroupsList.length > 0 && (
            <>
              <div className="p-3 mt-4 text-xs font-semibold text-zinc-500 uppercase tracking-wider border-t border-zinc-100">
                Hidden Groups ({hiddenGroupsList.length})
              </div>
              {hiddenGroupsList.map(group => (
                <div
                  key={group.id}
                  className="flex items-center gap-3 p-3 mx-2 rounded-xl opacity-60 hover:opacity-100 transition-opacity"
                >
                  <div className="w-8 h-8 rounded-full bg-zinc-200 flex-shrink-0 overflow-hidden grayscale">
                    {group.pictureUrl && <img src={group.pictureUrl} alt={group.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-zinc-700 truncate">{group.name}</div>
                  </div>
                  <button
                    onClick={(e) => toggleGroupVisibility(group.id, e)}
                    className="p-2 text-zinc-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-full transition-colors"
                    title="Show group"
                  >
                    <Bell size={16} />
                  </button>
                </div>
              ))}
            </>
          )}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col bg-[#E4E3E0] relative">
        {selectedGroupId ? (
          <>
            {/* Chat Header */}
            <div className="h-16 bg-white border-b border-zinc-200 flex items-center px-6 shadow-sm z-10">
              <h2 className="text-lg font-semibold text-zinc-800">
                {groups.find(g => g.id === selectedGroupId)?.name}
              </h2>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {(messages[selectedGroupId] || []).map((msg, idx) => {
                const isMe = msg.isMe;
                return (
                  <div key={msg.id || idx} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                    {!isMe && <span className="text-xs text-zinc-500 mb-1 ml-1">{msg.sender}</span>}
                    <div
                      className={`max-w-[70%] px-4 py-2 rounded-2xl ${
                        isMe
                          ? 'bg-emerald-500 text-white rounded-tr-sm'
                          : 'bg-white text-zinc-800 shadow-sm rounded-tl-sm'
                      }`}
                    >
                      {msg.text}
                    </div>
                    <span className="text-[10px] text-zinc-400 mt-1 mx-1">
                      {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="p-4 bg-white border-t border-zinc-200">
              <form onSubmit={sendMessage} className="flex gap-2 max-w-4xl mx-auto">
                <input
                  type="text"
                  value={inputText}
                  onChange={e => setInputText(e.target.value)}
                  placeholder="Type a message..."
                  className="flex-1 bg-zinc-100 border-transparent focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 rounded-full px-6 py-3 outline-none transition-all"
                />
                <button
                  type="submit"
                  disabled={!inputText.trim()}
                  className="bg-emerald-500 hover:bg-emerald-600 disabled:bg-zinc-300 disabled:cursor-not-allowed text-white rounded-full w-12 h-12 flex items-center justify-center transition-colors shadow-sm"
                >
                  <Send size={20} className="ml-1" />
                </button>
              </form>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-zinc-400">
            <MessageSquare size={64} className="mb-4 opacity-20" />
            <p className="text-lg font-medium">Select a group to start messaging</p>
            <p className="text-sm mt-2 max-w-md text-center">
              When your LINE bot receives messages from groups, they will appear in the sidebar.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
