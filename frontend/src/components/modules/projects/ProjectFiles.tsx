import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useDropzone } from 'react-dropzone';
import { Upload, File, Download, Trash2, Grid, List } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import api from '@/services/api';
import { formatBytes, formatRelativeTime, getFileIcon } from '@/lib/utils';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/stores/authStore';

interface ProjectFilesProps {
  projectId: string;
  clientId?: string;
}

export function ProjectFiles({ projectId, clientId }: ProjectFilesProps) {
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [uploading, setUploading] = useState(false);
  const queryClient = useQueryClient();
  const { user } = useAuthStore();

  const { data, isLoading } = useQuery({
    queryKey: ['files', projectId],
    queryFn: async () => {
      const res = await api.get(`/files?projectId=${projectId}`);
      return res.data.data;
    },
  });

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (!acceptedFiles.length) return;
    setUploading(true);

    for (const file of acceptedFiles) {
      try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('projectId', projectId);
        if (clientId) formData.append('clientId', clientId);
        formData.append('isClientVisible', 'false');

        await api.post('/files/upload', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        toast.success(`${file.name} uploaded`);
      } catch {
        toast.error(`Failed to upload ${file.name}`);
      }
    }

    setUploading(false);
    queryClient.invalidateQueries({ queryKey: ['files', projectId] });
  }, [projectId, clientId, queryClient]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    maxSize: 2 * 1024 * 1024 * 1024, // 2GB
  });

  const deleteFile = useMutation({
    mutationFn: async (fileId: string) => {
      await api.delete(`/files/${fileId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['files', projectId] });
      toast.success('File deleted');
    },
  });

  const handleDownload = (_fileId: string, _fileName: string) => {
    window.open(`/api/v1/files/${_fileId}/download`, '_blank');
  };

  const files = data?.files || [];

  return (
    <div className="space-y-4">
      {/* Upload zone */}
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
          isDragActive ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50 hover:bg-accent'
        }`}
      >
        <input {...getInputProps()} />
        <Upload className={`h-8 w-8 mx-auto mb-3 ${isDragActive ? 'text-primary' : 'text-muted-foreground'}`} />
        {uploading ? (
          <p className="text-sm text-muted-foreground">Uploading...</p>
        ) : isDragActive ? (
          <p className="text-sm font-medium text-primary">Drop files here</p>
        ) : (
          <>
            <p className="text-sm font-medium">Drag & drop files here</p>
            <p className="text-xs text-muted-foreground mt-1">or click to browse — up to 2GB per file</p>
          </>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{files.length} files</p>
        <div className="flex gap-1">
          <Button variant={viewMode === 'grid' ? 'secondary' : 'ghost'} size="icon-sm" onClick={() => setViewMode('grid')}>
            <Grid className="h-4 w-4" />
          </Button>
          <Button variant={viewMode === 'list' ? 'secondary' : 'ghost'} size="icon-sm" onClick={() => setViewMode('list')}>
            <List className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Files */}
      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-32 w-full rounded-xl" />)}
        </div>
      ) : files.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <File className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No files yet</p>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {files.map((file: {
            _id: string;
            name: string;
            mimeType: string;
            sizeBytes: number;
            version: number;
            createdAt: string;
            scanStatus: string;
            isClientVisible: boolean;
          }) => (
            <div key={file._id} className="border rounded-xl p-4 hover:shadow-md transition-shadow group">
              <div className="text-3xl mb-3">{getFileIcon(file.mimeType)}</div>
              <p className="text-sm font-medium truncate mb-1">{file.name}</p>
              <p className="text-xs text-muted-foreground">{formatBytes(file.sizeBytes)}</p>
              {file.version > 1 && (
                <Badge variant="secondary" className="mt-1 text-xs">v{file.version}</Badge>
              )}
              <div className="flex gap-1 mt-3 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button variant="ghost" size="icon-sm" onClick={() => handleDownload(file._id, file.name)}>
                  <Download className="h-3.5 w-3.5" />
                </Button>
                {user?.role !== 'CLIENT' && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => deleteFile.mutate(file._id)}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="border rounded-xl divide-y">
          {files.map((file: {
            _id: string;
            name: string;
            mimeType: string;
            sizeBytes: number;
            version: number;
            createdAt: string;
            uploadedBy?: { name: string };
          }) => (
            <div key={file._id} className="flex items-center gap-4 px-4 py-3 hover:bg-accent transition-colors">
              <span className="text-xl">{getFileIcon(file.mimeType)}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{file.name}</p>
                <p className="text-xs text-muted-foreground">
                  {formatBytes(file.sizeBytes)} · {formatRelativeTime(file.createdAt)}
                  {file.uploadedBy && ` · ${file.uploadedBy.name}`}
                </p>
              </div>
              {file.version > 1 && <Badge variant="secondary" className="text-xs">v{file.version}</Badge>}
              <div className="flex gap-1">
                <Button variant="ghost" size="icon-sm" onClick={() => handleDownload(file._id, file.name)}>
                  <Download className="h-3.5 w-3.5" />
                </Button>
                {user?.role !== 'CLIENT' && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => deleteFile.mutate(file._id)}
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
