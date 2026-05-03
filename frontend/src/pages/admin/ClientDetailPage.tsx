import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Building2, Mail, Phone, Globe, FolderOpen, Receipt, FileText, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusPill } from '@/components/ui/status-pill';
import { Skeleton } from '@/components/ui/skeleton';
import api from '@/services/api';
import { formatDate, formatCurrency } from '@/lib/utils';
import toast from 'react-hot-toast';

export function ClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [activeTab, setActiveTab] = useState('overview');
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['client', id],
    queryFn: async () => {
      const res = await api.get(`/clients/${id}`);
      return res.data.data;
    },
    enabled: !!id,
  });

  // Fetch related projects, invoices, contracts separately
  const { data: projectsData } = useQuery({
    queryKey: ['projects', 'client', id],
    queryFn: async () => {
      const res = await api.get(`/projects?clientId=${id}&limit=50`);
      return res.data.data;
    },
    enabled: !!id,
  });

  const { data: invoicesData } = useQuery({
    queryKey: ['invoices', 'client', id],
    queryFn: async () => {
      const res = await api.get(`/invoices?clientId=${id}&limit=50`);
      return res.data.data;
    },
    enabled: !!id,
  });

  const { data: contractsData } = useQuery({
    queryKey: ['contracts', 'client', id],
    queryFn: async () => {
      const res = await api.get(`/contracts?clientId=${id}&limit=50`);
      return res.data.data;
    },
    enabled: !!id,
  });

  const inviteMutation = useMutation({
    mutationFn: async () => {
      await api.post(`/clients/${id}/invite`);
    },
    onSuccess: () => toast.success('Invitation sent'),
    onError: () => toast.error('Failed to send invitation'),
  });

  const client = data?.client || data;
  const clientProjects = projectsData?.projects || [];
  const clientInvoices = invoicesData?.invoices || [];
  const clientContracts = contractsData?.contracts || [];

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'projects', label: 'Projects' },
    { id: 'invoices', label: 'Invoices' },
    { id: 'contracts', label: 'Contracts' },
  ];

  if (isLoading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!client) {
    return (
      <div className="text-center py-16">
        <p className="text-muted-foreground">Client not found.</p>
        <Link
          to="/admin/clients"
          className="inline-flex items-center justify-center mt-4 h-10 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
        >
          Back to Clients
        </Link>
      </div>
    );
  }

  const tierColors: Record<string, string> = {
    STARTER: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
    GROWTH: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    ENTERPRISE: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400',
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            to="/admin/clients"
            className="inline-flex items-center justify-center h-8 w-8 rounded-md hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">{client.companyName}</h1>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${tierColors[client.tier]}`}>
                {client.tier}
              </span>
              <StatusPill status={client.status} />
            </div>
            <p className="text-muted-foreground text-sm mt-0.5">{client.contactName}</p>
          </div>
        </div>
        <Button variant="outline" onClick={() => inviteMutation.mutate()} loading={inviteMutation.isPending}>
          <Send className="mr-2 h-4 w-4" />
          Resend Invite
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === tab.id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader><CardTitle>Contact Information</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center gap-3">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <span>{client.companyName}</span>
              </div>
              <div className="flex items-center gap-3">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <a href={`mailto:${client.email}`} className="text-primary hover:underline">{client.email}</a>
              </div>
              {client.phone && (
                <div className="flex items-center gap-3">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <span>{client.phone}</span>
                </div>
              )}
              {client.website && (
                <div className="flex items-center gap-3">
                  <Globe className="h-4 w-4 text-muted-foreground" />
                  <a href={client.website} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                    {client.website}
                  </a>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Account Details</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Status</span>
                <StatusPill status={client.status} />
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tier</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${tierColors[client.tier]}`}>{client.tier}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Client Since</span>
                <span>{formatDate(client.createdAt)}</span>
              </div>
              {client.assignedPM && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Account Manager</span>
                  <span>{client.assignedPM.name}</span>
                </div>
              )}
              {client.healthScore !== undefined && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Health Score</span>
                  <span className={`font-medium ${client.healthScore >= 70 ? 'text-emerald-600' : client.healthScore >= 40 ? 'text-amber-600' : 'text-red-500'}`}>
                    {client.healthScore}/100
                  </span>
                </div>
              )}
            </CardContent>
          </Card>

          {client.notes && (
            <Card className="md:col-span-2">
              <CardHeader><CardTitle>Notes</CardTitle></CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{client.notes}</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {activeTab === 'projects' && (
        <div className="space-y-3">
          {clientProjects.length === 0 ? (
            <div className="text-center py-12">
              <FolderOpen className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-30" />
              <p className="text-muted-foreground text-sm">No projects yet</p>
            </div>
          ) : (
            <div className="border rounded-xl divide-y">
              {clientProjects.map((project: {
                _id: string;
                name: string;
                status: string;
                startDate?: string;
                endDate?: string;
              }) => (
                <div key={project._id} className="flex items-center gap-4 px-5 py-4 hover:bg-accent transition-colors">
                  <div className="flex-1">
                    <p className="font-medium text-sm">{project.name}</p>
                    {project.startDate && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {formatDate(project.startDate)}{project.endDate && ` → ${formatDate(project.endDate)}`}
                      </p>
                    )}
                  </div>
                  <StatusPill status={project.status} />
                  <Link
                    to={`/projects/${project._id}`}
                    className="inline-flex items-center justify-center h-8 rounded-md px-3 text-xs font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
                  >
                    View
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'invoices' && (
        <div className="space-y-3">
          {clientInvoices.length === 0 ? (
            <div className="text-center py-12">
              <Receipt className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-30" />
              <p className="text-muted-foreground text-sm">No invoices yet</p>
            </div>
          ) : (
            <div className="border rounded-xl divide-y">
              {clientInvoices.map((invoice: {
                _id: string;
                invoiceNumber: string;
                total: number;
                currency: string;
                status: string;
                dueDate: string;
              }) => (
                <div key={invoice._id} className="flex items-center gap-4 px-5 py-4 hover:bg-accent transition-colors">
                  <div className="flex-1">
                    <p className="font-medium text-sm">{invoice.invoiceNumber}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Due {formatDate(invoice.dueDate)}</p>
                  </div>
                  <p className="font-semibold">{formatCurrency(invoice.total, invoice.currency)}</p>
                  <StatusPill status={invoice.status} />
                  <Link
                    to={`/invoices/${invoice._id}`}
                    className="inline-flex items-center justify-center h-8 rounded-md px-3 text-xs font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
                  >
                    View
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'contracts' && (
        <div className="space-y-3">
          {clientContracts.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-30" />
              <p className="text-muted-foreground text-sm">No contracts yet</p>
            </div>
          ) : (
            <div className="border rounded-xl divide-y">
              {clientContracts.map((contract: {
                _id: string;
                title: string;
                type: string;
                status: string;
                createdAt: string;
              }) => (
                <div key={contract._id} className="flex items-center gap-4 px-5 py-4 hover:bg-accent transition-colors">
                  <div className="flex-1">
                    <p className="font-medium text-sm">{contract.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{contract.type} · {formatDate(contract.createdAt)}</p>
                  </div>
                  <StatusPill status={contract.status} />
                  <Link
                    to={`/contracts/${contract._id}`}
                    className="inline-flex items-center justify-center h-8 rounded-md px-3 text-xs font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
                  >
                    View
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
