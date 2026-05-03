import { CheckCircle2, Circle, Clock } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface Milestone {
  _id: string;
  name: string;
  dueDate: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';
  invoiceAmount: number;
  order: number;
}

interface MilestoneTimelineProps {
  milestones: Milestone[];
  projectId: string;
}

export function MilestoneTimeline({ milestones }: MilestoneTimelineProps) {
  const sorted = [...(milestones || [])].sort((a, b) => a.order - b.order);

  if (sorted.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground text-sm">
          No milestones defined yet
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Milestones</CardTitle>
      </CardHeader>
      <CardContent>
        {/* Visual timeline */}
        <div className="flex items-center gap-0 mb-6 overflow-x-auto pb-2">
          {sorted.map((milestone, index) => (
            <div key={milestone._id} className="flex items-center flex-shrink-0">
              <div className="flex flex-col items-center">
                <div className={`h-8 w-8 rounded-full flex items-center justify-center border-2 ${
                  milestone.status === 'COMPLETED'
                    ? 'bg-primary border-primary text-white'
                    : milestone.status === 'IN_PROGRESS'
                    ? 'bg-primary/20 border-primary text-primary'
                    : 'bg-background border-muted-foreground/30 text-muted-foreground'
                }`}>
                  {milestone.status === 'COMPLETED' ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : milestone.status === 'IN_PROGRESS' ? (
                    <Clock className="h-4 w-4" />
                  ) : (
                    <Circle className="h-4 w-4" />
                  )}
                </div>
                <p className="text-xs font-medium mt-2 text-center max-w-[80px] truncate">{milestone.name}</p>
                <p className="text-xs text-muted-foreground">{formatDate(milestone.dueDate, 'MMM d')}</p>
              </div>
              {index < sorted.length - 1 && (
                <div className={`h-0.5 w-12 mx-1 ${
                  milestone.status === 'COMPLETED' ? 'bg-primary' : 'bg-muted'
                }`} />
              )}
            </div>
          ))}
        </div>

        {/* List view */}
        <div className="space-y-2">
          {sorted.map((milestone) => (
            <div key={milestone._id} className="flex items-center gap-3 p-3 rounded-lg hover:bg-accent transition-colors">
              <div className={`h-2 w-2 rounded-full flex-shrink-0 ${
                milestone.status === 'COMPLETED' ? 'bg-primary' :
                milestone.status === 'IN_PROGRESS' ? 'bg-amber-500' : 'bg-muted-foreground/30'
              }`} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{milestone.name}</p>
                <p className="text-xs text-muted-foreground">Due {formatDate(milestone.dueDate)}</p>
              </div>
              <div className="text-right">
                {milestone.invoiceAmount > 0 && (
                  <p className="text-sm font-medium">${milestone.invoiceAmount.toLocaleString()}</p>
                )}
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  milestone.status === 'COMPLETED' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                  milestone.status === 'IN_PROGRESS' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
                  'bg-muted text-muted-foreground'
                }`}>
                  {milestone.status.replace('_', ' ')}
                </span>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
