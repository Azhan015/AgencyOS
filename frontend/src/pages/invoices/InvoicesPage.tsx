import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Receipt, Send, ExternalLink, Download } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { StatusPill } from '@/components/ui/status-pill';
import { Skeleton } from '@/components/ui/skeleton';
import api from '@/services/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/stores/authStore';

export function InvoicesPage() {
  const [statusFilter, setStatusFilter] = useState('');
  const queryClient = useQueryClient();
  const { user } = useAuthStore();

  const { data, isLoading } = useQuery({
    queryKey: ['invoices', { status: statusFilter }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      const res = await api.get(`/invoices?${params}`);
      return res.data.data;
    },
  });

  const sendInvoice = useMutation({
    mutationFn: async (id: string) => {
      await api.post(`/invoices/${id}/send`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      toast.success('Invoice sent');
    },
    onError: () => toast.error('Failed to send invoice'),
  });

  const getPaymentLink = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.post(`/invoices/${id}/payment-link`);
      return res.data.data.url;
    },
    onSuccess: (url) => {
      window.open(url, '_blank');
    },
    onError: () => toast.error('Failed to generate payment link'),
  });

  const canCreate = user && ['ADMIN', 'SUPERADMIN', 'PROJECT_MANAGER'].includes(user.role);
  const statuses = ['DRAFT', 'SENT', 'VIEWED', 'PARTIAL', 'PAID', 'OVERDUE', 'VOID'];
  const invoices = data?.invoices || [];

  // Summary stats
  const totalOutstanding = invoices
    .filter((i: { status: string; total: number }) => ['SENT', 'VIEWED', 'PARTIAL', 'OVERDUE'].includes(i.status))
    .reduce((sum: number, i: { total: number }) => sum + i.total, 0);

  const totalPaid = invoices
    .filter((i: { status: string; total: number }) => i.status === 'PAID')
    .reduce((sum: number, i: { total: number }) => sum + i.total, 0);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Invoices</h1>
          <p className="text-muted-foreground mt-1">{data?.total || 0} total invoices</p>
        </div>
        {canCreate && (
          <Button onClick={() => toast('Invoice creation coming soon — use the project invoices tab', { icon: '📋' })}>
            <Plus className="mr-2 h-4 w-4" />
            New Invoice
          </Button>
        )}
      </div>

      {/* Summary cards */}
      {canCreate && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Outstanding', value: formatCurrency(totalOutstanding), color: 'text-amber-600' },
            { label: 'Collected', value: formatCurrency(totalPaid), color: 'text-emerald-600' },
            { label: 'Overdue', value: invoices.filter((i: { status: string }) => i.status === 'OVERDUE').length, color: 'text-red-500' },
            { label: 'Draft', value: invoices.filter((i: { status: string }) => i.status === 'DRAFT').length, color: 'text-muted-foreground' },
          ].map((stat) => (
            <Card key={stat.label}>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">{stat.label}</p>
                <p className={`text-xl font-bold mt-1 ${stat.color}`}>{stat.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setStatusFilter('')}
          className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${!statusFilter ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-accent'}`}
        >
          All
        </button>
        {statuses.map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s === statusFilter ? '' : s)}
            className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${statusFilter === s ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-accent'}`}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Invoices table */}
      {isLoading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      ) : invoices.length === 0 ? (
        <div className="text-center py-16">
          <Receipt className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-30" />
          <h3 className="font-semibold text-lg mb-1">No invoices found</h3>
          {canCreate && (
            <Button className="mt-3" onClick={() => toast('Invoice creation coming soon — use the project invoices tab', { icon: '📋' })}>
              Create Invoice
            </Button>
          )}
        </div>
      ) : (
        <div className="border rounded-xl divide-y">
          {invoices.map((invoice: {
            _id: string;
            invoiceNumber: string;
            clientId: { companyName: string };
            projectId?: { name: string };
            total: number;
            currency: string;
            status: string;
            dueDate: string;
            issuedAt?: string;
          }) => (
            <div key={invoice._id} className="flex items-center gap-3 px-4 sm:px-5 py-3 sm:py-4 hover:bg-accent transition-colors">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-medium text-sm">{invoice.invoiceNumber}</p>
                  {invoice.projectId && (
                    <span className="text-xs text-muted-foreground hidden sm:inline">· {invoice.projectId.name}</span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 truncate">
                  {invoice.clientId?.companyName}
                  <span className="hidden sm:inline"> · Due {formatDate(invoice.dueDate)}</span>
                </p>
              </div>
              <p className="font-semibold text-sm whitespace-nowrap">{formatCurrency(invoice.total, invoice.currency)}</p>
              <StatusPill status={invoice.status} />
              <div className="flex gap-1">
                {invoice.status === 'DRAFT' && canCreate && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => sendInvoice.mutate(invoice._id)}
                    title="Send invoice"
                  >
                    <Send className="h-3.5 w-3.5" />
                  </Button>
                )}
                {['SENT', 'VIEWED', 'PARTIAL', 'OVERDUE'].includes(invoice.status) && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => getPaymentLink.mutate(invoice._id)}
                    title="Get payment link"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Button>
                )}
                <Button variant="ghost" size="icon-sm" onClick={() => window.location.href = `/invoices/${invoice._id}`} title="View invoice">
                  <Download className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
