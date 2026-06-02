import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FolderOpen, Upload, Search, Download, Trash2, FileText, Image, Film, Archive } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import api from '@/services/api';
import { formatDate, formatBytes } from '@/lib/utils';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/stores/authStore';

function FileIcon({ mimeType }: { mimeType: string }) {
  if (mimeType.startsWith('image/')) return <Image className="h-5 w-5 text-blue-500" />;
  if (mimeType.startsWith('video/')) return <Film className="h-5 w-5 text-purple-500" />;
  if (mimeType.includes('zip') || mimeType.includes('tar') || mimeType.includes('rar'))
    return <Archive className="h-5 w-5 text-amber-500" />;
  return <FileText className="h-5 w-5 text-muted-foreground" />;
}

export function FilesPage() {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const queryClient = useQueryClient();
  const { user } = useAuthStore();

  const { data, isLoading } = useQuery({
    queryKey: ['files', { search, type: typeFilter }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (typeFilter) params.set('type', typeFilter);
      const res = await api.get(`/files?${params}`);
      return res.data.data;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/files/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['files'] });
      toast.success('File deleted');
    },
    onError: () => toast.error('Failed to delete file'),
  });

  const effectiveRole = user?.orgRole || user?.role || '';
  const canDelete = user && ['ADMIN', 'SUPERADMIN', 'PROJECT_MANAGER',
    'ORGANIZATION_OWNER', 'ORGANIZATION_ADMIN'].includes(effectiveRole);
  const canUpload = user && ['ADMIN', 'SUPERADMIN', 'PROJECT_MANAGER', 'CONTRIBUTOR',
    'ORGANIZATION_OWNER', 'ORGANIZATION_ADMIN'].includes(effectiveRole);
  const files = data?.files || [];
  const typeFilters = ['image', 'video', 'document', 'other'];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Files</h1>
          <p className="text-muted-foreground mt-1 text-sm">{data?.total || 0} files across all projects</p>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search files..."
            className="w-full pl-9 pr-4 py-2 text-sm border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setTypeFilter('')}
            className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${!typeFilter ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-accent'}`}
          >
            All
          </button>
          {typeFilters.map((t) => (
            <button
              key={t}
              onClick={() => setTypeFilter(t === typeFilter ? '' : t)}
              className={`px-3 py-1.5 text-xs rounded-full border transition-colors capitalize ${typeFilter === t ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-accent'}`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Files list */}
      {isLoading ? (
        <div className="space-y-2">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      ) : files.length === 0 ? (
        <div className="text-center py-16">
          <FolderOpen className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-30" />
          <h3 className="font-semibold text-lg mb-1">No files found</h3>
          <p className="text-sm text-muted-foreground">Files uploaded within projects will appear here.</p>
        </div>
      ) : (
        <div className="border rounded-xl divide-y">
          {files.map((file: {
            _id: string;
            originalName: string;
            mimeType: string;
            sizeBytes: number;
            projectId?: { name: string };
            uploadedBy?: { name: string };
            createdAt: string;
          }) => (
            <div key={file._id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-accent transition-colors">
              <FileIcon mimeType={file.mimeType} />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{file.originalName}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {formatBytes(file.sizeBytes)}
                  {file.projectId && ` · ${file.projectId.name}`}
                  {file.uploadedBy && ` · ${file.uploadedBy.name}`}
                  {` · ${formatDate(file.createdAt)}`}
                </p>
              </div>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => window.open(`/api/v1/files/${file._id}/download`, '_blank')}
                  title="Download"
                >
                  <Download className="h-3.5 w-3.5" />
                </Button>
                {canDelete && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => {
                      if (confirm('Delete this file?')) deleteMutation.mutate(file._id);
                    }}
                    title="Delete"
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
