import { cn, STATUS_COLORS } from '@/lib/utils';

interface StatusPillProps {
  status: string;
  className?: string;
  showDot?: boolean;
}

export function StatusPill({ status, className, showDot = true }: StatusPillProps) {
  const colorClass = STATUS_COLORS[status] || 'bg-gray-100 text-gray-600';

  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium', colorClass, className)}>
      {showDot && <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />}
      {status.replace(/_/g, ' ')}
    </span>
  );
}
