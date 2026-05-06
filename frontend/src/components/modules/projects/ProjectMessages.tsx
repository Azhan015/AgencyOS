import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Send, Hash, Plus, X } from 'lucide-react';
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
  const [showAddChannel, setShowAddChannel] = useState(false);
  const [newChannelName, setNewChannelName] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const { user } = useAuthStore();

  const canManageChannels = user && ['ADMIN', 'SUPERADMIN', 'PROJECT_MANAGER'].includes(user.role);

  // Get channels for this project
  const { data: channelsData } = useQuery({
    queryKey: ['channels', projectId],
    queryFn: async () => {
      const res = await api.get(`/messages/channels?projectId=${projectId}`);
      return res.data.data;
    },
  });

  const channels: Array<{ _id: string; name: string }> = channelsData?.channels || channelsData || [];

  // Set default channel to first one
  useEffect(() => {
    if (channels.length && !channelId) {
      setChannelId(channels[0]._id);
    }
  }, [channels, channelId]);

  // Get messages for selected channel
  const { data: messagesData, isLoading } = useQuery({
    queryKey: ['messages', projectId, channelId],
    queryFn: async () => {
      if (!channelId) return [];
      const res = await api.get(`/messages/channels/${channelId}/messages?limit=50`);
      return res.data.data?.messages || res.data.data || [];
    },
    enabled: !!channelId,
    refetchInterval: 5000,
  });

  const messages: Array<{
    _id: string;
    content: string;
    senderId: { _id: string; name: string; avatar?: string; role: string };
    createdAt: string;
  }> = messagesData || [];

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = useMutation({
    mutationFn: async (content: string) => {
      if (!channelId) throw new Error('No channel selected');
      const res = await api.post(`/messages/channels/${channelId}/messages`, { content });
      return res.data.data;
    },
    onSuccess: () => {
      setMessage('');
      queryClient.invalidateQueries({ queryKey: ['messages', projectId, channelId] });
    },
    onError: () => toast.error('Failed to send message'),
  });

  const createChannel = useMutation({
    mutationFn: async (name: string) => {
      const res = await api.post('/messages/channels', { projectId, name });
      return res.data.data;
    },
    onSuccess: (channel) => {
      queryClient.invalidateQueries({ queryKey: ['channels', projectId] });
      setChannelId(channel._id);
      setNewChannelName('');
      setShowAddChannel(false);
      toast.success(`#${channel.name} created`);
    },
    onError: (error: unknown) => {
      const msg = (error as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      toast.error(msg || 'Failed to create channel');
    },
  });

  const handleSend = () => {
    if (message.trim()) sendMessage.mutate(message.trim());
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleCreateChannel = () => {
    const name = newChannelName.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    if (!name) {
      toast.error('Channel name must contain letters or numbers');
      return;
    }
    createChannel.mutate(name);
  };

  return (
    <div className="flex h-[600px] border rounded-xl overflow-hidden">
      {/* Channels sidebar */}
      <div className="w-48 border-r bg-muted/30 flex flex-col flex-shrink-0">
        <div className="p-3 border-b flex items-center justify-between">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Channels</p>
          {canManageChannels && (
            <button
              onClick={() => setShowAddChannel(!showAddChannel)}
              className="h-5 w-5 rounded flex items-center justify-center hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
              title="Add channel"
            >
              {showAddChannel ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
            </button>
          )}
        </div>

        {/* Add channel input */}
        {showAddChannel && (
          <div className="p-2 border-b bg-background">
            <div className="flex items-center gap-1 mb-1">
              <span className="text-muted-foreground text-sm">#</span>
              <input
                value={newChannelName}
                onChange={(e) => setNewChannelName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateChannel();
                  if (e.key === 'Escape') setShowAddChannel(false);
                }}
                placeholder="channel-name"
                className="flex-1 text-xs bg-transparent focus:outline-none"
                autoFocus
              />
            </div>
            <p className="text-[10px] text-muted-foreground mb-1.5">Lowercase, hyphens only</p>
            <Button
              size="sm"
              className="w-full h-6 text-xs"
              onClick={handleCreateChannel}
              loading={createChannel.isPending}
              disabled={!newChannelName.trim()}
            >
              Create
            </Button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {channels.length === 0 ? (
            <p className="text-xs text-muted-foreground p-2 text-center">
              No channels yet.
              {canManageChannels && ' Click + to create one.'}
            </p>
          ) : (
            channels.map((channel) => (
              <button
                key={channel._id}
                onClick={() => setChannelId(channel._id)}
                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors ${
                  channelId === channel._id
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'hover:bg-accent text-muted-foreground'
                }`}
              >
                <Hash className="h-3.5 w-3.5 flex-shrink-0" />
                <span className="truncate">{channel.name}</span>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Messages area */}
      <div className="flex-1 flex flex-col min-w-0">
        {!channelId ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm p-4 text-center">
            {channels.length === 0
              ? canManageChannels
                ? 'No channels yet. Click + in the sidebar to create one.'
                : 'No channels yet. Ask your project manager to create one.'
              : 'Select a channel to start messaging'}
          </div>
        ) : (
          <>
            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {isLoading ? (
                <div className="space-y-3">
                  {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
                </div>
              ) : messages.length === 0 ? (
                <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                  No messages yet. Start the conversation!
                </div>
              ) : (
                messages.map((msg) => {
                  const isOwn = msg.senderId?._id === user?.id;
                  return (
                    <div key={msg._id} className={`flex gap-3 ${isOwn ? 'flex-row-reverse' : ''}`}>
                      <UserAvatar
                        name={msg.senderId?.name || 'Unknown'}
                        src={msg.senderId?.avatar}
                        size="sm"
                        className="flex-shrink-0"
                      />
                      <div className={`max-w-[70%] ${isOwn ? 'items-end' : 'items-start'} flex flex-col`}>
                        <div className="flex items-center gap-2 mb-1">
                          {!isOwn && <span className="text-xs font-medium">{msg.senderId?.name}</span>}
                          <span className="text-xs text-muted-foreground">{formatRelativeTime(msg.createdAt)}</span>
                        </div>
                        <div className={`rounded-2xl px-4 py-2.5 text-sm ${
                          isOwn
                            ? 'bg-primary text-primary-foreground rounded-tr-sm'
                            : 'bg-muted rounded-tl-sm'
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
                    placeholder={`Message #${channels.find(c => c._id === channelId)?.name || '...'}`}
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
              <p className="text-xs text-muted-foreground mt-1 ml-1">Enter to send · Shift+Enter for new line</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
