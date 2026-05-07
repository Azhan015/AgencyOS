import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, CheckCircle2, Clock, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { UserAvatar } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import api from '@/services/api';
import { formatDate } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';
import { hasPermission } from '@/lib/permissions';
import toast from 'react-hot-toast';

type TaskStatus = 'BACKLOG' | 'IN_PROGRESS' | 'REVIEW' | 'DONE';

const COLUMNS: { id: TaskStatus; label: string; color: string }[] = [
  { id: 'BACKLOG',     label: 'Backlog',      color: 'bg-gray-100 dark:bg-gray-800' },
  { id: 'IN_PROGRESS', label: 'In Progress',  color: 'bg-blue-50 dark:bg-blue-950/30' },
  { id: 'REVIEW',      label: 'Review',       color: 'bg-purple-50 dark:bg-purple-950/30' },
  { id: 'DONE',        label: 'Done',         color: 'bg-green-50 dark:bg-green-950/30' },
];

interface TaskUser {
  _id: string;
  name: string;
  email?: string;
  avatar?: string;
}

interface Task {
  _id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: string;
  assignees: TaskUser[];
  createdBy?: TaskUser;
  completedBy?: TaskUser;
  completedAt?: string;
  dueDate?: string;
  tags: string[];
}

interface TaskBoardProps {
  projectId: string;
}

const PRIORITY_DOT: Record<string, string> = {
  LOW:    'bg-gray-400',
  MEDIUM: 'bg-blue-500',
  HIGH:   'bg-amber-500',
  URGENT: 'bg-red-500',
};

const PRIORITY_LABEL: Record<string, string> = {
  LOW: 'Low', MEDIUM: 'Medium', HIGH: 'High', URGENT: 'Urgent',
};

export function TaskBoard({ projectId }: TaskBoardProps) {
  const { user } = useAuthStore();
  const canWrite = hasPermission(user?.role ?? '', 'tasks:write');

  const [createOpen, setCreateOpen]     = useState(false);
  const [detailTask, setDetailTask]     = useState<Task | null>(null);
  const [newTaskStatus, setNewTaskStatus] = useState<TaskStatus>('BACKLOG');
  const [newTaskTitle, setNewTaskTitle]  = useState('');
  const [newTaskPriority, setNewTaskPriority] = useState<string>('MEDIUM');
  const queryClient = useQueryClient();

  const { data: tasks, isLoading } = useQuery({
    queryKey: ['tasks', projectId],
    queryFn: async () => {
      const res = await api.get(`/tasks?projectId=${projectId}`);
      return res.data.data as Task[];
    },
  });

  const createTask = useMutation({
    mutationFn: async (data: { title: string; status: TaskStatus; priority: string }) => {
      const res = await api.post('/tasks', { ...data, projectId });
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks', projectId] });
      setNewTaskTitle('');
      setNewTaskPriority('MEDIUM');
      setCreateOpen(false);
      toast.success('Task created');
    },
    onError: () => toast.error('Failed to create task'),
  });

  const updateTask = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: TaskStatus }) => {
      const res = await api.patch(`/tasks/${id}`, { status });
      return res.data.data;
    },
    onSuccess: (updated: Task) => {
      queryClient.invalidateQueries({ queryKey: ['tasks', projectId] });
      // Refresh detail panel if open
      if (detailTask?._id === updated._id) setDetailTask(updated);
    },
    onError: () => toast.error('Failed to update task'),
  });

  const tasksByStatus = COLUMNS.reduce((acc, col) => {
    acc[col.id] = (tasks || []).filter(t => t.status === col.id);
    return acc;
  }, {} as Record<TaskStatus, Task[]>);

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
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
      {/* Toolbar — only shown to users who can write tasks */}
      {canWrite && (
        <div className="flex justify-end mb-4">
          <Button size="sm" onClick={() => { setNewTaskStatus('BACKLOG'); setCreateOpen(true); }}>
            <Plus className="mr-2 h-4 w-4" />
            Add Task
          </Button>
        </div>
      )}

      {/* Board columns */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {COLUMNS.map((col) => (
          <div key={col.id} className={`rounded-xl p-3 ${col.color} min-h-[200px]`}>
            {/* Column header */}
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold">{col.label}</h3>
              <span className="text-xs text-muted-foreground bg-background rounded-full px-2 py-0.5">
                {tasksByStatus[col.id]?.length || 0}
              </span>
            </div>

            {/* Task cards */}
            <div className="space-y-2">
              {tasksByStatus[col.id]?.map((task) => (
                <div
                  key={task._id}
                  onClick={() => setDetailTask(task)}
                  className="bg-card border rounded-lg p-3 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
                >
                  {/* Priority dot + title */}
                  <div className="flex items-start gap-2 mb-2">
                    <div
                      className={`h-2 w-2 rounded-full mt-1.5 flex-shrink-0 ${PRIORITY_DOT[task.priority] || 'bg-gray-400'}`}
                      title={PRIORITY_LABEL[task.priority] || task.priority}
                    />
                    <p className="text-sm font-medium flex-1 leading-snug">{task.title}</p>
                  </div>

                  {/* Due date */}
                  {task.dueDate && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground mb-2">
                      <Clock className="h-3 w-3" />
                      <span>Due {formatDate(task.dueDate)}</span>
                    </div>
                  )}

                  {/* Completed by — shown only on DONE cards */}
                  {task.status === 'DONE' && task.completedBy && (
                    <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 mb-2">
                      <CheckCircle2 className="h-3 w-3 flex-shrink-0" />
                      <span>
                        Done by <span className="font-medium">{task.completedBy.name}</span>
                        {task.completedAt && (
                          <span className="text-muted-foreground ml-1">
                            · {formatDate(task.completedAt)}
                          </span>
                        )}
                      </span>
                    </div>
                  )}

                  {/* Assignees + status selector */}
                  <div className="flex items-center justify-between mt-1">
                    {/* Assignee avatars with names on hover */}
                    <div className="flex -space-x-1" title={task.assignees?.map(a => a.name).join(', ')}>
                      {task.assignees?.length ? (
                        task.assignees.slice(0, 3).map(a => (
                          <UserAvatar
                            key={a._id}
                            name={a.name}
                            src={a.avatar}
                            size="sm"
                            className="h-5 w-5 text-[10px] ring-1 ring-background"
                          />
                        ))
                      ) : (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <User className="h-3 w-3" />
                          Unassigned
                        </span>
                      )}
                      {task.assignees?.length > 3 && (
                        <span className="h-5 w-5 rounded-full bg-muted text-[9px] flex items-center justify-center ring-1 ring-background text-muted-foreground">
                          +{task.assignees.length - 3}
                        </span>
                      )}
                    </div>

                    {/* Status selector — hidden for read-only roles */}
                    {canWrite ? (
                      <select
                        value={task.status}
                        onChange={(e) => {
                          e.stopPropagation();
                          updateTask.mutate({ id: task._id, status: e.target.value as TaskStatus });
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="text-xs border-0 bg-transparent text-muted-foreground focus:outline-none cursor-pointer max-w-[80px]"
                      >
                        {COLUMNS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                      </select>
                    ) : (
                      <span className="text-xs text-muted-foreground">{col.label}</span>
                    )}
                  </div>
                </div>
              ))}

              {/* Add task inline button — hidden for read-only roles */}
              {canWrite && (
                <button
                  onClick={() => { setNewTaskStatus(col.id); setCreateOpen(true); }}
                  className="w-full text-xs text-muted-foreground hover:text-foreground py-2 rounded-lg hover:bg-background/50 transition-colors flex items-center justify-center gap-1"
                >
                  <Plus className="h-3 w-3" />
                  Add task
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* ── Create task dialog ─────────────────────────────────────────────── */}
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
                  createTask.mutate({ title: newTaskTitle.trim(), status: newTaskStatus, priority: newTaskPriority });
                }
              }}
              autoFocus
            />
            <div className="grid grid-cols-2 gap-3">
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
              <div>
                <label className="block text-sm font-medium mb-1.5">Priority</label>
                <select
                  value={newTaskPriority}
                  onChange={(e) => setNewTaskPriority(e.target.value)}
                  className="w-full h-10 px-3 border rounded-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                  <option value="URGENT">Urgent</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button
                onClick={() => newTaskTitle.trim() && createTask.mutate({ title: newTaskTitle.trim(), status: newTaskStatus, priority: newTaskPriority })}
                loading={createTask.isPending}
                disabled={!newTaskTitle.trim()}
              >
                Create Task
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Task detail panel ──────────────────────────────────────────────── */}
      <Dialog open={!!detailTask} onOpenChange={(open) => !open && setDetailTask(null)}>
        <DialogContent className="max-w-lg">
          {detailTask && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-start gap-2 pr-6">
                  <div className={`h-2.5 w-2.5 rounded-full mt-1.5 flex-shrink-0 ${PRIORITY_DOT[detailTask.priority] || 'bg-gray-400'}`} />
                  <span>{detailTask.title}</span>
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-4 text-sm">
                {/* Description */}
                {detailTask.description && (
                  <p className="text-muted-foreground leading-relaxed">{detailTask.description}</p>
                )}

                {/* Meta grid */}
                <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Status</p>
                    <p className="font-medium">{COLUMNS.find(c => c.id === detailTask.status)?.label}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Priority</p>
                    <div className="flex items-center gap-1.5">
                      <div className={`h-2 w-2 rounded-full ${PRIORITY_DOT[detailTask.priority]}`} />
                      <span className="font-medium">{PRIORITY_LABEL[detailTask.priority] || detailTask.priority}</span>
                    </div>
                  </div>
                  {detailTask.dueDate && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Due Date</p>
                      <p className="font-medium">{formatDate(detailTask.dueDate)}</p>
                    </div>
                  )}
                  {detailTask.createdBy && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Created By</p>
                      <div className="flex items-center gap-1.5">
                        <UserAvatar name={detailTask.createdBy.name} src={detailTask.createdBy.avatar} size="sm" className="h-5 w-5 text-[10px]" />
                        <span className="font-medium">{detailTask.createdBy.name}</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Assignees */}
                {detailTask.assignees?.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-2">Assigned To</p>
                    <div className="flex flex-wrap gap-2">
                      {detailTask.assignees.map(a => (
                        <div key={a._id} className="flex items-center gap-1.5 bg-muted rounded-full px-2.5 py-1">
                          <UserAvatar name={a.name} src={a.avatar} size="sm" className="h-5 w-5 text-[10px]" />
                          <span className="text-xs font-medium">{a.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Completed by — the key info the user asked for */}
                {detailTask.status === 'DONE' && (
                  <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 px-4 py-3">
                    <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
                      <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
                      <div>
                        {detailTask.completedBy ? (
                          <p className="text-sm font-medium">
                            Completed by {detailTask.completedBy.name}
                          </p>
                        ) : (
                          <p className="text-sm font-medium">Completed</p>
                        )}
                        {detailTask.completedAt && (
                          <p className="text-xs opacity-75 mt-0.5">
                            {new Date(detailTask.completedAt).toLocaleString()}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Tags */}
                {detailTask.tags?.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {detailTask.tags.map(tag => (
                      <span key={tag} className="text-xs bg-muted px-2 py-0.5 rounded-full">{tag}</span>
                    ))}
                  </div>
                )}

                {/* Status change — only for users with write access */}
                {canWrite && (
                  <div className="pt-2 border-t">
                    <label className="block text-xs text-muted-foreground mb-1.5">Move to</label>
                    <div className="flex flex-wrap gap-2">
                      {COLUMNS.filter(c => c.id !== detailTask.status).map(c => (
                        <Button
                          key={c.id}
                          variant="outline"
                          size="sm"
                          loading={updateTask.isPending}
                          onClick={() => updateTask.mutate({ id: detailTask._id, status: c.id })}
                        >
                          {c.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
