import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Download, Send, ExternalLink, CheckCircle, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusPill } from '@/components/ui/status-pill';
import { Skeleton } from '@/components/ui/skeleton';
import api from '@/services/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';
import toast from 'react-hot-toast';

export function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();

  const { data, isLoading } = useQuery({
    queryKey: ['invoice', id],
    queryFn: async () => {
      const res = await api.get(`/invoices/${id}`);
      return res.data.data;
    },
    enabled: !!id,
  });

  const sendMutation = useMutation({
    mutationFn: async () => {
      await api.post(`/invoices/${id}/send`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoice', id] });
      toast.success('Invoice sent to client');
    },
    onError: () => toast.error('Failed to send invoice'),
  });

  const paymentLinkMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post(`/invoices/${id}/payment-link`);
      return res.data.data.url as string;
    },
    onSuccess: (url) => window.open(url, '_blank'),
    onError: () => toast.error('Failed to generate payment link'),
  });

  const voidMutation = useMutation({
    mutationFn: async () => {
      await api.post(`/invoices/${id}/void`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoice', id] });
      toast.success('Invoice voided');
    },
    onError: () => toast.error('Failed to void invoice'),
  });

  const canManage = user && ['ADMIN', 'SUPERADMIN', 'PROJECT_MANAGER'].includes(user.role);
  const invoice = data?.invoice || data;

  if (isLoading) {
    return (
      <div className="space-y-6 animate-fade-in max-w-4xl">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="text-center py-16">
        <p className="text-muted-foreground">Invoice not found.</p>
        <Link
          to="/invoices"
          className="inline-flex items-center justify-center mt-4 h-10 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
        >
          Back to Invoices
        </Link>
      </div>
    );
  }

  const subtotal = invoice.lineItems?.reduce(
    (sum: number, item: { quantity: number; unitPrice: number }) => sum + item.quantity * item.unitPrice,
    0
  ) ?? invoice.subtotal ?? 0;

  return (
    <div className="space-y-6 animate-fade-in max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            to="/invoices"
            className="inline-flex items-center justify-center h-8 w-8 rounded-md hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold">{invoice.invoiceNumber}</h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              {invoice.clientId?.companyName}
              {invoice.projectId && ` · ${invoice.projectId.name}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusPill status={invoice.status} />
          {canManage && invoice.status === 'DRAFT' && (
            <Button onClick={() => sendMutation.mutate()} loading={sendMutation.isPending}>
              <Send className="mr-2 h-4 w-4" />
              Send Invoice
            </Button>
          )}
          {canManage && ['SENT', 'VIEWED', 'PARTIAL', 'OVERDUE'].includes(invoice.status) && (
            <Button variant="outline" onClick={() => paymentLinkMutation.mutate()} loading={paymentLinkMutation.isPending}>
              <ExternalLink className="mr-2 h-4 w-4" />
              Payment Link
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Invoice details */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Invoice Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs mb-1">Invoice Number</p>
                  <p className="font-medium">{invoice.invoiceNumber}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs mb-1">Status</p>
                  <StatusPill status={invoice.status} />
                </div>
                <div>
                  <p className="text-muted-foreground text-xs mb-1">Issue Date</p>
                  <p className="font-medium">{invoice.issuedAt ? formatDate(invoice.issuedAt) : '—'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs mb-1">Due Date</p>
                  <p className="font-medium">{formatDate(invoice.dueDate)}</p>
                </div>
                {invoice.paidAt && (
                  <div>
                    <p className="text-muted-foreground text-xs mb-1">Paid Date</p>
                    <p className="font-medium text-emerald-600">{formatDate(invoice.paidAt)}</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Line items */}
          <Card>
            <CardHeader>
              <CardTitle>Line Items</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-0">
                <div className="grid grid-cols-12 gap-2 text-xs text-muted-foreground pb-2 border-b">
                  <div className="col-span-6">Description</div>
                  <div className="col-span-2 text-right">Qty</div>
                  <div className="col-span-2 text-right">Unit Price</div>
                  <div className="col-span-2 text-right">Total</div>
                </div>
                {invoice.lineItems?.map((item: {
                  description: string;
                  quantity: number;
                  unitPrice: number;
                }, i: number) => (
                  <div key={i} className="grid grid-cols-12 gap-2 py-3 border-b last:border-0 text-sm">
                    <div className="col-span-6">{item.description}</div>
                    <div className="col-span-2 text-right">{item.quantity}</div>
                    <div className="col-span-2 text-right">{formatCurrency(item.unitPrice, invoice.currency)}</div>
                    <div className="col-span-2 text-right font-medium">{formatCurrency(item.quantity * item.unitPrice, invoice.currency)}</div>
                  </div>
                ))}
              </div>

              {/* Totals */}
              <div className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>{formatCurrency(subtotal, invoice.currency)}</span>
                </div>
                {invoice.taxRate > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Tax ({invoice.taxRate}%)</span>
                    <span>{formatCurrency(subtotal * invoice.taxRate / 100, invoice.currency)}</span>
                  </div>
                )}
                {invoice.discount > 0 && (
                  <div className="flex justify-between text-emerald-600">
                    <span>Discount</span>
                    <span>-{formatCurrency(invoice.discount, invoice.currency)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-base pt-2 border-t">
                  <span>Total</span>
                  <span>{formatCurrency(invoice.total, invoice.currency)}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {invoice.notes && (
            <Card>
              <CardHeader><CardTitle>Notes</CardTitle></CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{invoice.notes}</p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Client</CardTitle></CardHeader>
            <CardContent className="text-sm space-y-1">
              <p className="font-medium">{invoice.clientId?.companyName}</p>
              <p className="text-muted-foreground">{invoice.clientId?.contactName}</p>
              <p className="text-muted-foreground">{invoice.clientId?.email}</p>
            </CardContent>
          </Card>

          {canManage && (
            <Card>
              <CardHeader><CardTitle>Actions</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                <Button variant="outline" className="w-full justify-start" size="sm">
                  <Download className="mr-2 h-4 w-4" />
                  Download PDF
                </Button>
                {invoice.status !== 'VOID' && invoice.status !== 'PAID' && (
                  <Button
                    variant="outline"
                    className="w-full justify-start text-destructive hover:text-destructive"
                    size="sm"
                    onClick={() => {
                      if (confirm('Void this invoice? This cannot be undone.')) voidMutation.mutate();
                    }}
                    loading={voidMutation.isPending}
                  >
                    <XCircle className="mr-2 h-4 w-4" />
                    Void Invoice
                  </Button>
                )}
                {invoice.status === 'PAID' && (
                  <div className="flex items-center gap-2 text-emerald-600 text-sm">
                    <CheckCircle className="h-4 w-4" />
                    <span>Paid in full</span>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
