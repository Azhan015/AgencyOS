import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search, FolderKanban, Receipt, FileText, Users, BarChart3,
  Settings, Plus, LayoutDashboard, Files, MessageSquare,
  CheckSquare, Zap, UserPlus,
} from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { useAuthStore } from '@/stores/authStore';

interface CommandItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  action: () => void;
  category: string;
  /** Roles that can see this command. Undefined = all roles. */
  roles?: string[];
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const role = user?.role ?? 'CLIENT';

  // ── All possible commands with role gates ──────────────────────────────────
  const allCommands: CommandItem[] = [
    // Navigation — available to everyone
    {
      id: 'dashboard',
      label: 'Go to Dashboard',
      icon: LayoutDashboard,
      action: () => navigate('/dashboard'),
      category: 'Navigation',
    },
    {
      id: 'projects',
      label: 'Go to Projects',
      icon: FolderKanban,
      action: () => navigate('/projects'),
      category: 'Navigation',
    },
    {
      id: 'files',
      label: 'Go to Files',
      icon: Files,
      action: () => navigate('/files'),
      category: 'Navigation',
    },
    {
      id: 'messages',
      label: 'Go to Messages',
      icon: MessageSquare,
      action: () => navigate('/messages'),
      category: 'Navigation',
    },
    {
      id: 'approvals',
      label: 'Go to Approvals',
      icon: CheckSquare,
      action: () => navigate('/approvals'),
      category: 'Navigation',
    },
    {
      id: 'settings',
      label: 'Go to Settings',
      icon: Settings,
      action: () => navigate('/settings'),
      category: 'Navigation',
    },

    // Navigation — not for CONTRIBUTOR (no invoices/contracts permission)
    {
      id: 'invoices',
      label: 'Go to Invoices',
      icon: Receipt,
      action: () => navigate('/invoices'),
      category: 'Navigation',
      roles: ['SUPERADMIN', 'ADMIN', 'PROJECT_MANAGER', 'CLIENT'],
    },
    {
      id: 'contracts',
      label: 'Go to Contracts',
      icon: FileText,
      action: () => navigate('/contracts'),
      category: 'Navigation',
      roles: ['SUPERADMIN', 'ADMIN', 'PROJECT_MANAGER', 'CLIENT'],
    },

    // Navigation — admin only
    {
      id: 'clients',
      label: 'Go to Clients',
      icon: Users,
      action: () => navigate('/admin/clients'),
      category: 'Navigation',
      roles: ['SUPERADMIN', 'ADMIN'],
    },
    {
      id: 'team',
      label: 'Go to Team',
      icon: UserPlus,
      action: () => navigate('/admin/team'),
      category: 'Navigation',
      roles: ['SUPERADMIN', 'ADMIN'],
    },
    {
      id: 'analytics',
      label: 'Go to Analytics',
      icon: BarChart3,
      action: () => navigate('/admin/analytics'),
      category: 'Navigation',
      roles: ['SUPERADMIN', 'ADMIN', 'PROJECT_MANAGER'],
    },
    {
      id: 'automations',
      label: 'Go to Automations',
      icon: Zap,
      action: () => navigate('/admin/automations'),
      category: 'Navigation',
      roles: ['SUPERADMIN', 'ADMIN'],
    },

    // Actions — create project (ADMIN, SUPERADMIN, PROJECT_MANAGER only)
    {
      id: 'new-project',
      label: 'Create New Project',
      icon: Plus,
      action: () => navigate('/projects?new=true'),
      category: 'Actions',
      roles: ['SUPERADMIN', 'ADMIN', 'PROJECT_MANAGER'],
    },

    // Actions — add client (ADMIN, SUPERADMIN only)
    {
      id: 'new-client',
      label: 'Add New Client',
      icon: UserPlus,
      action: () => navigate('/admin/clients?new=true'),
      category: 'Actions',
      roles: ['SUPERADMIN', 'ADMIN'],
    },

    // Actions — invite team member (ADMIN, SUPERADMIN only)
    {
      id: 'invite-team',
      label: 'Invite Team Member',
      icon: UserPlus,
      action: () => navigate('/admin/team'),
      category: 'Actions',
      roles: ['SUPERADMIN', 'ADMIN'],
    },
  ];

  // Filter by role
  const roleFiltered = allCommands.filter(
    cmd => !cmd.roles || cmd.roles.includes(role)
  );

  // Filter by search query
  const queryFiltered = query
    ? roleFiltered.filter(c =>
        c.label.toLowerCase().includes(query.toLowerCase()) ||
        c.category.toLowerCase().includes(query.toLowerCase())
      )
    : roleFiltered;

  // Group by category
  const grouped = queryFiltered.reduce((acc, cmd) => {
    if (!acc[cmd.category]) acc[cmd.category] = [];
    acc[cmd.category].push(cmd);
    return acc;
  }, {} as Record<string, CommandItem[]>);

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleSelect = (cmd: CommandItem) => {
    cmd.action();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="p-0 max-w-lg overflow-hidden">
        {/* Search input */}
        <div className="flex items-center border-b px-4">
          <Search className="h-4 w-4 text-muted-foreground mr-3 flex-shrink-0" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search commands..."
            className="flex-1 py-4 text-sm bg-transparent outline-none placeholder:text-muted-foreground"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="text-xs text-muted-foreground hover:text-foreground ml-2"
            >
              Clear
            </button>
          )}
        </div>

        {/* Results */}
        <div className="max-h-80 overflow-y-auto p-2">
          {Object.entries(grouped).map(([category, items]) => (
            <div key={category} className="mb-2">
              <p className="px-2 py-1 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {category}
              </p>
              {items.map((cmd) => {
                const Icon = cmd.icon;
                return (
                  <button
                    key={cmd.id}
                    onClick={() => handleSelect(cmd)}
                    className="w-full flex items-center gap-3 px-2 py-2 rounded-md text-sm hover:bg-accent transition-colors text-left"
                  >
                    <Icon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <span>{cmd.label}</span>
                  </button>
                );
              })}
            </div>
          ))}

          {queryFiltered.length === 0 && (
            <div className="py-8 text-center text-sm text-muted-foreground">
              {query ? `No results for "${query}"` : 'No commands available'}
            </div>
          )}
        </div>

        {/* Footer hint */}
        <div className="border-t px-4 py-2 flex items-center gap-3 text-xs text-muted-foreground">
          <span><kbd className="bg-muted border rounded px-1">↵</kbd> select</span>
          <span><kbd className="bg-muted border rounded px-1">Esc</kbd> close</span>
          <span className="ml-auto">Signed in as <strong>{role}</strong></span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
