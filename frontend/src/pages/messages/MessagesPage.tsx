import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Send, Hash, MessageSquare, Paperclip } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { UserAvatar } from '@/components/ui/avatar';
import api from '@/services/api';
import { formatRelativeTime } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';
import { useSocket } from '@/hooks/useSocket';
import toast from 'react-hot-toast';

interface Channel {
  _id: string;
  name: string;
  projectId: { _id: string; name: string };
  unreadCount?: number;
}

interface Message {
  _id: string;
  content: string;
  senderId: { _id: string; name: string; avatar?: string };
  createdAt: string;
  attachments?: Array<{ url: string; originalName: string }>;
}

export function MessagesPage() {
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
  const [messageText, setMessageText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const { socket } = useSocket();

  // Fetch all channels across projects
  const { data: channelsData, isLoading: channelsLoading } = useQuery({
    queryKey: ['channels', 'all'],
    queryFn: async () => {
      const res = await api.get('/messages/channels');
      return res.data.data;
    },
  });

  // Fetch messages for selected channel
  const { data: messagesData, isLoading: messagesLoading } = useQuery({
    queryKey: ['messages', selectedChannel?._id],
    queryFn: async () => {
      if (!selectedChannel) return null;
      const res = await api.get(`/messages/channels/${selectedChannel._id}/messages`);
      return res.data.data;
    },
    enabled: !!selectedChannel,
  });

  const sendMessage = useMutation({
    mutationFn: async (content: string) => {
      if (!selectedChannel) return;
      const res = await api.post(`/messages/channels/${selectedChannel._id}/messages`, { content });
      return res.data.data;
    },
    onSuccess: () => {
      setMessageText('');
      queryClient.invalidateQueries({ queryKey: ['messages', selectedChannel?._id] });
    },
    onError: () => toast.error('Failed to send message'),
  });

  // Socket: join channel and listen for new messages
  useEffect(() => {
    if (!socket || !selectedChannel) return;
    socket.emit('join:channel', selectedChannel._id);
    const handler = () => {
      queryClient.invalidateQueries({ queryKey: ['messages', selectedChannel._id] });
    };
    socket.on('message:new', handler);
    return () => {
      socket.off('message:new', handler);
      socket.emit('leave:channel', selectedChannel._id);
    };
  }, [socket, selectedChannel, queryClient]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messagesData]);

  const channels: Channel[] = channelsData?.channels || [];
  const messages: Message[] = messagesData?.messages || [];

  const handleSend = () => {
    const trimmed = messageText.trim();
    if (!trimmed) return;
    sendMessage.mutate(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex h-[calc(100vh-8rem)] border rounded-xl overflow-hidden animate-fade-in">
      {/* Channel sidebar */}
      <div className="w-64 border-r flex flex-col bg-muted/30">
        <div className="p-4 border-b">
          <h2 className="font-semibold text-sm">Channels</h2>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {channelsLoading ? (
            <div className="space-y-2 p-2">
              {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
            </div>
          ) : channels.length === 0 ? (
            <div className="p-4 text-center">
              <p className="text-xs text-muted-foreground">No channels yet. Channels are created per project.</p>
            </div>
          ) : (
            channels.map((ch) => (
              <button
                key={ch._id}
                onClick={() => setSelectedChannel(ch)}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors text-left ${
                  selectedChannel?._id === ch._id
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'hover:bg-accent text-muted-foreground'
                }`}
              >
                <Hash className="h-3.5 w-3.5 flex-shrink-0" />
                <span className="truncate">{ch.name}</span>
                {ch.unreadCount ? (
                  <span className="ml-auto bg-primary text-primary-foreground text-xs rounded-full px-1.5 py-0.5 min-w-[1.25rem] text-center">
                    {ch.unreadCount}
                  </span>
                ) : null}
              </button>
            ))
          )}
        </div>
      </div>

      {/* Messages area */}
      <div className="flex-1 flex flex-col">
        {!selectedChannel ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <MessageSquare className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-30" />
              <p className="text-muted-foreground text-sm">Select a channel to start messaging</p>
            </div>
          </div>
        ) : (
          <>
            {/* Channel header */}
            <div className="px-5 py-3.5 border-b flex items-center gap-2">
              <Hash className="h-4 w-4 text-muted-foreground" />
              <span className="font-semibold">{selectedChannel.name}</span>
              <span className="text-xs text-muted-foreground">· {selectedChannel.projectId?.name}</span>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {messagesLoading ? (
                <div className="space-y-4">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="flex gap-3">
                      <Skeleton className="h-8 w-8 rounded-full flex-shrink-0" />
                      <div className="space-y-1.5 flex-1">
                        <Skeleton className="h-3 w-24" />
                        <Skeleton className="h-4 w-3/4" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : messages.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-sm text-muted-foreground">No messages yet. Start the conversation!</p>
                </div>
              ) : (
                messages.map((msg) => {
                  const isOwn = msg.senderId?._id === user?.id;
                  return (
                    <div key={msg._id} className={`flex gap-3 ${isOwn ? 'flex-row-reverse' : ''}`}>
                      <UserAvatar name={msg.senderId?.name || '?'} size="sm" className="flex-shrink-0" />
                      <div className={`max-w-[70%] ${isOwn ? 'items-end' : 'items-start'} flex flex-col`}>
                        <div className="flex items-baseline gap-2 mb-1">
                          {!isOwn && <span className="text-xs font-medium">{msg.senderId?.name}</span>}
                          <span className="text-xs text-muted-foreground">{formatRelativeTime(msg.createdAt)}</span>
                        </div>
                        <div className={`px-3.5 py-2.5 rounded-2xl text-sm ${
                          isOwn
                            ? 'bg-primary text-primary-foreground rounded-tr-sm'
                            : 'bg-muted rounded-tl-sm'
                        }`}>
                          {msg.content}
                        </div>
                        {msg.attachments && msg.attachments.length > 0 && (
                          <div className="mt-1 space-y-1">
                            {msg.attachments.map((att, i) => (
                              <a
                                key={i}
                                href={att.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1.5 text-xs text-primary hover:underline"
                              >
                                <Paperclip className="h-3 w-3" />
                                {att.originalName}
                              </a>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Message input */}
            <div className="p-4 border-t">
              <div className="flex gap-2 items-end">
                <textarea
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={`Message #${selectedChannel.name}`}
                  rows={1}
                  className="flex-1 resize-none px-4 py-2.5 text-sm border rounded-xl bg-background focus:outline-none focus:ring-2 focus:ring-ring min-h-[42px] max-h-32"
                  style={{ height: 'auto' }}
                />
                <Button
                  onClick={handleSend}
                  disabled={!messageText.trim() || sendMessage.isPending}
                  size="icon"
                  className="flex-shrink-0"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-1.5 ml-1">Enter to send · Shift+Enter for new line</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
