import { Link } from 'react-router-dom';
import { ArrowRight, FolderKanban, Receipt, FileText, MessageSquare, CheckSquare, BarChart3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/ui/logo';

const features = [
  {
    icon: FolderKanban,
    title: 'Project Management',
    description: 'Kanban boards, milestones, and task tracking — keep every project on schedule.',
    color: 'bg-blue-500',
  },
  {
    icon: Receipt,
    title: 'Invoicing & Payments',
    description: 'Create, send, and track invoices. Accept payments via Stripe.',
    color: 'bg-emerald-500',
  },
  {
    icon: FileText,
    title: 'Contracts',
    description: 'Digital contracts with e-signatures. Never chase a signature again.',
    color: 'bg-violet-500',
  },
  {
    icon: MessageSquare,
    title: 'Client Messaging',
    description: 'Real-time messaging per project. Keep all communication in context.',
    color: 'bg-amber-500',
  },
  {
    icon: CheckSquare,
    title: 'Approvals',
    description: 'Structured approval workflows for deliverables and creative assets.',
    color: 'bg-rose-500',
  },
  {
    icon: BarChart3,
    title: 'Analytics',
    description: 'Revenue, project health, and client NPS — all in one dashboard.',
    color: 'bg-cyan-500',
  },
];

const stats = [
  { label: 'Active Projects', value: '24' },
  { label: 'Revenue Tracked', value: '$48k' },
  { label: 'Pending Approvals', value: '7' },
  { label: 'Client NPS', value: '72' },
];

export function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <header className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 sm:h-16 flex items-center justify-between">
          <Logo size="md" showText={true} />
          <div className="flex items-center gap-2 sm:gap-3">
            <Link to="/auth/login">
              <Button variant="ghost" size="sm">Sign in</Button>
            </Link>
            <Link to="/auth/register">
              <Button size="sm">Get started</Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-12 sm:py-24 text-center">
        <div className="inline-flex items-center gap-2 bg-primary/10 text-primary rounded-full px-4 py-1.5 text-sm font-medium mb-6">
          <span className="h-1.5 w-1.5 rounded-full bg-primary" />
          The unified client OS for agencies
        </div>
        <h1 className="text-3xl sm:text-5xl font-bold tracking-tight mb-6 max-w-3xl mx-auto">
          Run your agency from{' '}
          <span className="gradient-text">one place</span>
        </h1>
        <p className="text-base sm:text-xl text-muted-foreground mb-8 sm:mb-10 max-w-2xl mx-auto">
          Projects, invoices, contracts, files, and client communication — all unified in a single platform built for modern agencies.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4">
          <Link to="/auth/register" className="w-full sm:w-auto">
            <Button size="lg" className="gap-2 w-full sm:w-auto">
              Start for free
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
          <Link to="/auth/login" className="w-full sm:w-auto">
            <Button size="lg" variant="outline" className="w-full sm:w-auto">
              Sign in
            </Button>
          </Link>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-16 max-w-2xl mx-auto">
          {stats.map((stat) => (
            <div key={stat.label} className="bg-card border rounded-xl p-4 text-center shadow-sm">
              <p className="text-2xl font-bold">{stat.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{stat.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
        <div className="text-center mb-8 sm:mb-12">
          <h2 className="text-2xl sm:text-3xl font-bold mb-3">Everything your agency needs</h2>
          <p className="text-muted-foreground max-w-xl mx-auto text-sm sm:text-base">
            Stop juggling multiple tools. Agency OS brings your entire workflow into one cohesive platform.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <div key={feature.title} className="bg-card border rounded-xl p-5 sm:p-6 hover:shadow-md transition-shadow">
                <div className={`h-10 w-10 rounded-xl ${feature.color} flex items-center justify-center mb-4`}>
                  <Icon className="h-5 w-5 text-white" />
                </div>
                <h3 className="font-semibold mb-2">{feature.title}</h3>
                <p className="text-sm text-muted-foreground">{feature.description}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
        <div className="bg-primary rounded-2xl p-8 sm:p-12 text-center text-white">
          <h2 className="text-2xl sm:text-3xl font-bold mb-3">Ready to streamline your agency?</h2>
          <p className="text-primary-foreground/80 mb-6 sm:mb-8 max-w-xl mx-auto text-sm sm:text-base">
            Join agencies already using Agency OS to deliver better work, faster.
          </p>
          <Link to="/auth/register">
            <Button size="lg" variant="secondary" className="gap-2">
              Get started for free
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-6 sm:py-8">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-muted-foreground">
          <Logo size="sm" showText={true} />
          <p>© {new Date().getFullYear()} Agency OS. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
