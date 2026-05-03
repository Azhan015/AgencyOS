import { Project } from '../../models/Project';
import { Invoice } from '../../models/Invoice';
import { Task } from '../../models/Task';
import { Approval } from '../../models/Approval';
import { Client } from '../../models/Client';
import { User } from '../../models/User';
import { cacheGet, cacheSet } from '../../config/redis';

export async function getAgencyAnalytics() {
  const cacheKey = 'analytics:agency';
  const cached = await cacheGet(cacheKey);
  if (cached) return cached;

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

  const [
    totalClients,
    activeClients,
    totalProjects,
    activeProjects,
    completedProjects,
    totalInvoices,
    paidInvoices,
    overdueInvoices,
    recentRevenue,
    previousRevenue,
    teamMembers,
  ] = await Promise.all([
    Client.countDocuments(),
    Client.countDocuments({ status: 'ACTIVE' }),
    Project.countDocuments(),
    Project.countDocuments({ status: 'ACTIVE' }),
    Project.countDocuments({ status: 'COMPLETED' }),
    Invoice.countDocuments(),
    Invoice.countDocuments({ status: 'PAID' }),
    Invoice.countDocuments({ status: 'OVERDUE' }),
    Invoice.aggregate([
      { $match: { status: 'PAID', paidAt: { $gte: thirtyDaysAgo } } },
      { $group: { _id: null, total: { $sum: '$total' } } },
    ]),
    Invoice.aggregate([
      { $match: { status: 'PAID', paidAt: { $gte: sixtyDaysAgo, $lt: thirtyDaysAgo } } },
      { $group: { _id: null, total: { $sum: '$total' } } },
    ]),
    User.countDocuments({ role: { $in: ['ADMIN', 'PROJECT_MANAGER', 'CONTRIBUTOR'] }, isActive: true }),
  ]);

  // Revenue trend (last 6 months)
  const revenueTrend = await Invoice.aggregate([
    { $match: { status: 'PAID', paidAt: { $gte: new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000) } } },
    {
      $group: {
        _id: { year: { $year: '$paidAt' }, month: { $month: '$paidAt' } },
        revenue: { $sum: '$total' },
        count: { $sum: 1 },
      },
    },
    { $sort: { '_id.year': 1, '_id.month': 1 } },
  ]);

  // Outstanding revenue
  const outstandingResult = await Invoice.aggregate([
    { $match: { status: { $in: ['SENT', 'VIEWED', 'PARTIAL', 'OVERDUE'] } } },
    { $group: { _id: null, total: { $sum: '$total' } } },
  ]);

  const currentRevenue = recentRevenue[0]?.total || 0;
  const prevRevenue = previousRevenue[0]?.total || 0;
  const revenueGrowth = prevRevenue > 0 ? ((currentRevenue - prevRevenue) / prevRevenue) * 100 : 0;

  const result = {
    clients: { total: totalClients, active: activeClients },
    projects: { total: totalProjects, active: activeProjects, completed: completedProjects },
    invoices: { total: totalInvoices, paid: paidInvoices, overdue: overdueInvoices },
    revenue: {
      current30Days: currentRevenue,
      previous30Days: prevRevenue,
      growth: Math.round(revenueGrowth * 10) / 10,
      outstanding: outstandingResult[0]?.total || 0,
      trend: revenueTrend,
    },
    team: { total: teamMembers },
  };

  await cacheSet(cacheKey, result, 300); // 5 min cache
  return result;
}

export async function getProjectAnalytics(projectId: string) {
  const cacheKey = `analytics:project:${projectId}`;
  const cached = await cacheGet(cacheKey);
  if (cached) return cached;

  const [project, tasks, approvals, invoices] = await Promise.all([
    Project.findById(projectId),
    Task.find({ projectId }).lean(),
    Approval.find({ projectId }).lean(),
    Invoice.find({ projectId }).lean(),
  ]);

  if (!project) return null;

  const tasksByStatus = tasks.reduce((acc, task) => {
    acc[task.status] = (acc[task.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const completedMilestones = project.milestones.filter(m => m.status === 'COMPLETED').length;
  const totalMilestones = project.milestones.length;

  const approvalStats = {
    total: approvals.length,
    approved: approvals.filter(a => a.status === 'APPROVED').length,
    pending: approvals.filter(a => ['PENDING', 'IN_REVIEW'].includes(a.status)).length,
    revisions: approvals.reduce((sum, a) => sum + a.revisions.length, 0),
  };

  const invoiceStats = {
    total: invoices.reduce((sum, i) => sum + i.total, 0),
    paid: invoices.filter(i => i.status === 'PAID').reduce((sum, i) => sum + i.total, 0),
    outstanding: invoices.filter(i => ['SENT', 'VIEWED', 'PARTIAL', 'OVERDUE'].includes(i.status)).reduce((sum, i) => sum + i.total, 0),
  };

  const result = {
    project: {
      name: project.name,
      status: project.status,
      healthScore: project.healthScore,
      budget: project.budget,
      currency: project.currency,
      startDate: project.startDate,
      endDate: project.endDate,
    },
    milestones: { completed: completedMilestones, total: totalMilestones },
    tasks: { total: tasks.length, byStatus: tasksByStatus },
    approvals: approvalStats,
    invoices: invoiceStats,
  };

  await cacheSet(cacheKey, result, 120);
  return result;
}

export async function getClientAnalytics(clientId: string) {
  const cacheKey = `analytics:client:${clientId}`;
  const cached = await cacheGet(cacheKey);
  if (cached) return cached;

  const [projects, invoices, client] = await Promise.all([
    Project.find({ clientId }).lean(),
    Invoice.find({ clientId }).lean(),
    Client.findById(clientId),
  ]);

  const projectsByStatus = projects.reduce((acc, p) => {
    acc[p.status] = (acc[p.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const invoiceHistory = invoices.map(i => ({
    id: i._id,
    number: i.invoiceNumber,
    amount: i.total,
    currency: i.currency,
    status: i.status,
    dueDate: i.dueDate,
    paidAt: i.paidAt,
  }));

  const result = {
    client: {
      companyName: client?.companyName,
      tier: client?.tier,
      status: client?.status,
      storageUsed: client?.storageUsedBytes,
      storageLimit: client?.storageLimitBytes,
    },
    projects: { total: projects.length, byStatus: projectsByStatus },
    revenue: {
      total: invoices.filter(i => i.status === 'PAID').reduce((sum, i) => sum + i.total, 0),
      outstanding: invoices.filter(i => ['SENT', 'VIEWED', 'PARTIAL', 'OVERDUE'].includes(i.status)).reduce((sum, i) => sum + i.total, 0),
    },
    invoiceHistory,
  };

  await cacheSet(cacheKey, result, 120);
  return result;
}
