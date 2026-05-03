import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { UserAvatar } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import api from '@/services/api';
import { formatDate } from '@/lib/utils';
import toast from 'react-hot-toast';

type TaskStatus = 'BACKLOG' | 'IN_PROGRESS' | 'REVIEW' | 'DONE';

const COLUMNS: { id: TaskStatus; label: string; color: string }[] = [
  { id: 'BACKLOG', label: 'Backlog', color: 'bg-gray-100 dark:bg-gray-800' },
  { id: 'IN_PROGRESS', label: 'In Progress', color: 'bg-blue-50 dark:bg-blue-950/30' },
  { id: 'REVIEW', label: 'Review', color: 'bg-purple-50 dark:bg-purple-950/30' },
  { id: 'DONE', label: 'Done', color: 'bg-green-50 dark:bg-green-950/30' },
];

interface Task {
  _id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: string;
  assignees: Array<{ _id: string; name: string; avatar?: string }>;
  dueDate?: string;
  tags: string[];
}

interface TaskBoardProps {
  projectId: string;
}

export function TaskBoard({ projectId }: TaskBoardProps) {
  const [createOpen, setCreateOpen] = useState(false);
  const [newTaskStatus, setNewTaskStatus] = useState<TaskStatus>('BACKLOG');
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const queryClient = useQueryClient();

  const { data: tasks, isLoading } = useQuery({
    queryKey: ['tasks', projectId],
    queryFn: async () => {
      const res = await api.get(`/tasks?projectId=${projectId}`);
      return res.data.data as Task[];
    },
  });

  const createTask = useMutation({
    mutationFn: async (data: { title: string; status: TaskStatus }) => {
      const res = await api.post('/tasks', { ...data, projectId });
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks', projectId] });
      setNewTaskTitle('');
      setCreateOpen(false);
      toast.success('Task created');
    },
  });

  const updateTask = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: TaskStatus }) => {
      const res = await api.patch(`/tasks/${id}`, { status });
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks', projectId] });
    },
  });

  const tasksByStatus = COLUMNS.reduce((acc, col) => {
    acc[col.id] = (tasks || []).filter(t => t.status === col.id);
    return acc;
  }, {} as Record<TaskStatus, Task[]>);

  const priorityColors: Record<string, string> = {
    LOW: 'bg-gray-400',
    MEDIUM: 'bg-blue-500',
    HIGH: 'bg-amber-500',
    URGENT: 'bg-red-500',
  };

  if (isLoading) {
    return (
      <div className="grid grid-cols-4 gap-4">
        {COLUMNS.map(col => (
          <div key={col.id} className="space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-end mb-4">
        <Button size="sm" onClick={() => { setNewTaskStatus('BACKLOG'); setCreateOpen(true); }}>
          <Plus className="mr-2 h-4 w-4" />
          Add Task
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {COLUMNS.map((col) => (
          <div key={col.id} className={`rounded-xl p-3 ${col.color} min-h-[200px]`}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold">{col.label}</h3>
              <span className="text-xs text-muted-foreground bg-background rounded-full px-2 py-0.5">
                {tasksByStatus[col.id]?.length || 0}
              </span>
            </div>

            <div className="space-y-2">
              {tasksByStatus[col.id]?.map((task) => (
                <div
                  key={task._id}
                  className="bg-card border rounded-lg p-3 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
                >
                  <div className="flex items-start gap-2 mb-2">
                    <div className={`h-2 w-2 rounded-full mt-1.5 flex-shrink-0 ${priorityColors[task.priority] || 'bg-gray-400'}`} />
                    <p className="text-sm font-medium flex-1">{task.title}</p>
                  </div>

                  {task.dueDate && (
                    <p className="text-xs text-muted-foreground mb-2">Due {formatDate(task.dueDate)}</p>
                  )}

                  <div className="flex items-center justify-between">
                    <div className="flex -space-x-1">
                      {task.assignees?.slice(0, 3).map(a => (
                        <UserAvatar key={a._id} name={a.name} src={a.avatar} size="sm" className="h-5 w-5 text-[10px] ring-1 ring-background" />
                      ))}
                    </div>

                    {/* Quick status change */}
                    <select
                      value={task.status}
                      onChange={(e) => updateTask.mutate({ id: task._id, status: e.target.value as TaskStatus })}
                      onClick={(e) => e.stopPropagation()}
                      className="text-xs border-0 bg-transparent text-muted-foreground focus:outline-none cursor-pointer"
                    >
                      {COLUMNS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                    </select>
                  </div>
                </div>
              ))}

              <button
                onClick={() => { setNewTaskStatus(col.id); setCreateOpen(true); }}
                className="w-full text-xs text-muted-foreground hover:text-foreground py-2 rounded-lg hover:bg-background/50 transition-colors flex items-center justify-center gap-1"
              >
                <Plus className="h-3 w-3" />
                Add task
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Create task dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Task</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              label="Task Title"
              placeholder="What needs to be done?"
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newTaskTitle.trim()) {
                  createTask.mutate({ title: newTaskTitle.trim(), status: newTaskStatus });
                }
              }}
            />
            <div>
              <label className="block text-sm font-medium mb-1.5">Status</label>
              <select
                value={newTaskStatus}
                onChange={(e) => setNewTaskStatus(e.target.value as TaskStatus)}
                className="w-full h-10 px-3 border rounded-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {COLUMNS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button
                onClick={() => newTaskTitle.trim() && createTask.mutate({ title: newTaskTitle.trim(), status: newTaskStatus })}
                loading={createTask.isPending}
                disabled={!newTaskTitle.trim()}
              >
                Create Task
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
