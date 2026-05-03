import { useQuery } from '@tanstack/react-query';
import { Receipt, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import { StatusPill } from '@/components/ui/status-pill';
import { Skeleton } from '@/components/ui/skeleton';
import api from '@/services/api';
import { formatCurrency, formatDate } from '@/lib/utils';

interface ProjectInvoicesProps {
  projectId: string;
  clientId?: string;
}

export function ProjectInvoices({ projectId }: ProjectInvoicesProps) {
  const { data, isLoading } = useQuery({
    queryKey: ['invoices', 'project', projectId],
    queryFn: async () => {
      const res = await api.get(`/invoices?projectId=${projectId}`);
      return res.data.data;
    },
  });

  const invoices = data?.invoices || [];

  if (isLoading) return <Skeleton className="h-48 w-full" />;

  if (invoices.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Receipt className="h-8 w-8 mx-auto mb-2 opacity-30" />
        <p className="text-sm">No invoices for this project</p>
      </div>
    );
  }

  return (
    <div className="border rounded-xl divide-y">
      {invoices.map((invoice: {
        _id: string;
        invoiceNumber: string;
        total: number;
        currency: string;
        status: string;
        dueDate: string;
        issuedAt?: string;
      }) => (
        <div key={invoice._id} className="flex items-center gap-4 px-5 py-4 hover:bg-accent transition-colors">
          <div className="flex-1">
            <p className="font-medium text-sm">{invoice.invoiceNumber}</p>
            <p className="text-xs text-muted-foreground">
              {invoice.issuedAt ? `Issued ${formatDate(invoice.issuedAt)}` : 'Draft'} · Due {formatDate(invoice.dueDate)}
            </p>
          </div>
          <p className="font-semibold">{formatCurrency(invoice.total, invoice.currency)}</p>
          <StatusPill status={invoice.status} />
          <Link to={`/invoices/${invoice._id}`} className="text-muted-foreground hover:text-foreground">
            <ExternalLink className="h-4 w-4" />
          </Link>
        </div>
      ))}
    </div>
  );
}
