import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Send, Hash } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { UserAvatar } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import api from '@/services/api';
import { formatRelativeTime } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';
import toast from 'react-hot-toast';

interface ProjectMessagesProps {
  projectId: string;
}

export function ProjectMessages({ projectId }: ProjectMessagesProps) {
  const [message, setMessage] = useState('');
  const [channelId, setChannelId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const { user } = useAuthStore();

  // Get channels
  const { data: channels } = useQuery({
    queryKey: ['channels', projectId],
    queryFn: async () => {
      const res = await api.get(`/messages/channels?projectId=${projectId}`);
      return res.data.data;
    },
  });

  // Set default channel
  useEffect(() => {
    if (channels?.length && !channelId) {
      setChannelId(channels[0]._id);
    }
  }, [channels, channelId]);

  // Get messages
  const { data: messages, isLoading } = useQuery({
    queryKey: ['messages', projectId, channelId],
    queryFn: async () => {
      if (!channelId) return [];
      const res = await api.get(`/messages?projectId=${projectId}&channelId=${channelId}&limit=50`);
      return res.data.data;
    },
    enabled: !!channelId,
    refetchInterval: 5000,
  });

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = useMutation({
    mutationFn: async (content: string) => {
      if (!channelId) throw new Error('No channel selected');
      const res = await api.post('/messages', {
        projectId,
        channelId,
        content,
        contentType: 'TEXT',
      });
      return res.data.data;
    },
    onSuccess: () => {
      setMessage('');
      queryClient.invalidateQueries({ queryKey: ['messages', projectId, channelId] });
    },
    onError: () => toast.error('Failed to send message'),
  });

  const handleSend = () => {
    if (message.trim()) {
      sendMessage.mutate(message.trim());
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex h-[600px] border rounded-xl overflow-hidden">
      {/* Channels sidebar */}
      <div className="w-48 border-r bg-muted/30 flex flex-col">
        <div className="p-3 border-b">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Channels</p>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {channels?.map((channel: { _id: string; name: string }) => (
            <button
              key={channel._id}
              onClick={() => setChannelId(channel._id)}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors ${
                channelId === channel._id ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-accent text-muted-foreground'
              }`}
            >
              <Hash className="h-3.5 w-3.5" />
              {channel.name}
            </button>
          ))}
        </div>
      </div>

      {/* Messages area */}
      <div className="flex-1 flex flex-col">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          ) : !messages?.length ? (
            <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
              No messages yet. Start the conversation!
            </div>
          ) : (
            messages.map((msg: {
              _id: string;
              content: string;
              senderId: { _id: string; name: string; avatar?: string; role: string };
              createdAt: string;
              editedAt?: string;
            }) => {
              const isOwn = msg.senderId?._id === user?.id;
              return (
                <div key={msg._id} className={`flex gap-3 ${isOwn ? 'flex-row-reverse' : ''}`}>
                  <UserAvatar name={msg.senderId?.name || 'Unknown'} src={msg.senderId?.avatar} size="sm" className="flex-shrink-0" />
                  <div className={`max-w-[70%] ${isOwn ? 'items-end' : 'items-start'} flex flex-col`}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium">{msg.senderId?.name}</span>
                      <span className="text-xs text-muted-foreground">{formatRelativeTime(msg.createdAt)}</span>
                    </div>
                    <div className={`rounded-2xl px-4 py-2.5 text-sm ${
                      isOwn ? 'bg-primary text-primary-foreground rounded-tr-sm' : 'bg-muted rounded-tl-sm'
                    }`}>
                      {msg.content}
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="border-t p-3">
          <div className="flex items-end gap-2">
            <div className="flex-1 border rounded-xl bg-background">
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type a message... (Enter to send)"
                rows={1}
                className="w-full px-4 py-3 text-sm bg-transparent resize-none focus:outline-none max-h-32"
                style={{ minHeight: '44px' }}
              />
            </div>
            <Button
              size="icon"
              onClick={handleSend}
              disabled={!message.trim() || sendMessage.isPending}
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
