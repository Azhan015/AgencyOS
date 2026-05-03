import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { useUIStore } from '@/stores/uiStore';
import { cn } from '@/lib/utils';
import { useSocket } from '@/hooks/useSocket';
import { CommandPalette } from '@/components/modules/command/CommandPalette';
import { Toaster } from 'react-hot-toast';

export function AppShell() {
  const { sidebarCollapsed, mobileSidebarOpen, setMobileSidebarOpen, commandPaletteOpen, setCommandPaletteOpen } = useUIStore();

  useSocket();

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile overlay — closes sidebar when tapping outside */}
      {mobileSidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/50 lg:hidden"
          onClick={() => setMobileSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      <Sidebar />

      {/* Main content — offset by sidebar width on desktop only */}
      <div
        className={cn(
          'transition-all duration-300 ease-in-out',
          // Desktop: offset by sidebar width
          sidebarCollapsed ? 'lg:ml-[60px]' : 'lg:ml-[240px]',
          // Mobile: no offset (sidebar overlays)
          'ml-0'
        )}
      >
        <TopBar />
        <main className="p-4 sm:p-6 min-h-[calc(100vh-4rem)]">
          <Outlet />
        </main>
      </div>

      <CommandPalette
        open={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
      />

      <Toaster
        position="bottom-right"
        toastOptions={{
          className: 'bg-card border text-foreground text-sm',
          duration: 4000,
        }}
      />
    </div>
  );
}
