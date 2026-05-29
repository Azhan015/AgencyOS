import { Client, IClient } from '../../models/Client';
import { User } from '../../models/User';
import { generateSlug, generateSecureToken, hashSHA256 } from '../../lib/crypto';
import { sendEmail, getInvitationEmail } from '../../lib/email';
import { cacheGet, cacheSet, cacheDel } from '../../config/redis';
import { NotFoundError, ConflictError, ValidationError } from '../../lib/errors';
import { env } from '../../config/env';
import { signAccessToken, signRefreshToken } from '../../lib/jwt';
import { logger } from '../../lib/logger';
import { v4 as uuidv4 } from 'uuid';

const INVITE_TOKEN_PREFIX = 'invite:';

export async function listClients(query: {
  page?: number;
  limit?: number;
  status?: string;
  search?: string;
  pmId?: string;
  organizationId?: string;
}) {
  const { page = 1, limit = 20, status, search, pmId, organizationId } = query;
  const filter: Record<string, unknown> = {};

  if (organizationId) filter.organizationId = organizationId;
  if (status) filter.status = status;
  if (pmId) filter.assignedPM = pmId;
  if (search) {
    filter.$or = [
      { companyName: { $regex: search, $options: 'i' } },
      { contactName: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
    ];
  }

  const [clients, total] = await Promise.all([
    Client.find(filter)
      .populate('assignedPM', 'name email avatar')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Client.countDocuments(filter),
  ]);

  return { clients, total, page, limit, pages: Math.ceil(total / limit) };
}

export async function getClient(id: string, organizationId?: string): Promise<IClient> {
  const cacheKey = `client:${id}`;
  const cached = await cacheGet<IClient>(cacheKey);
  if (cached) {
    // Validate cached client belongs to the requesting org
    if (organizationId && (cached as unknown as { organizationId?: { toString(): string } }).organizationId?.toString() !== organizationId) {
      throw new NotFoundError('Client');
    }
    return cached;
  }

  const filter: Record<string, unknown> = { _id: id };
  if (organizationId) filter.organizationId = organizationId;

  const client = await Client.findOne(filter).populate('assignedPM', 'name email avatar');
  if (!client) throw new NotFoundError('Client');

  await cacheSet(cacheKey, client.toObject(), 300);
  return client;
}

export async function createClient(data: {
  companyName: string;
  contactName: string;
  email: string;
  phone?: string;
  website?: string;
  tier?: string;
  assignedPM?: string;
  organizationId?: string;
  metadata?: Record<string, unknown>;
}): Promise<IClient> {
  // Email uniqueness is scoped per organization — same email can exist in different orgs
  const emailFilter: Record<string, unknown> = { email: data.email.toLowerCase() };
  if (data.organizationId) emailFilter.organizationId = data.organizationId;

  const existing = await Client.findOne(emailFilter);
  if (existing) throw new ConflictError('Client with this email already exists in your organization');

  const slug = generateSlug(data.companyName);

  const client = await Client.create({
    ...data,
    slug,
    email: data.email.toLowerCase(),
  });

  return client;
}

export async function updateClient(id: string, data: Partial<IClient>, organizationId?: string): Promise<IClient> {
  const filter: Record<string, unknown> = { _id: id };
  if (organizationId) filter.organizationId = organizationId;

  const client = await Client.findOneAndUpdate(
    filter,
    { $set: data },
    { new: true, runValidators: true }
  ).populate('assignedPM', 'name email avatar');

  if (!client) throw new NotFoundError('Client');

  await cacheDel(`client:${id}`);
  return client;
}

export async function deleteClient(id: string, organizationId?: string): Promise<void> {
  const filter: Record<string, unknown> = { _id: id };
  if (organizationId) filter.organizationId = organizationId;

  const client = await Client.findOne(filter);
  if (!client) throw new NotFoundError('Client');

  // Soft delete by suspending
  await Client.findOneAndUpdate(filter, { status: 'SUSPENDED' });
  await cacheDel(`client:${id}`);
}

export async function inviteClient(clientId: string, resend = false, frontendUrl?: string): Promise<void> {
  const client = await Client.findById(clientId);
  if (!client) throw new NotFoundError('Client');

  // Check if user already exists
  let user = await User.findOne({ email: client.email });

  if (!user) {
    user = await User.create({
      email: client.email,
      name: client.contactName,
      role: 'CLIENT',
      orgRole: 'CLIENT',
      organizationId: client.organizationId,
    });
  }

  // Generate invite token
  const token = generateSecureToken(32);
  const hash = hashSHA256(token);
  const key = `${INVITE_TOKEN_PREFIX}${hash}`;

  await cacheSet(key, { clientId: client._id.toString(), userId: user._id.toString() }, 72 * 60 * 60);

  const base = frontendUrl || env.FRONTEND_URL;
  const inviteLink = `${base}/auth/accept-invite?token=${token}`;

  await sendEmail({
    to: client.email,
    subject: `You're invited to ${env.AGENCY_NAME}'s client portal`,
    html: getInvitationEmail(client.contactName, env.AGENCY_NAME, inviteLink, env.AGENCY_EMAIL),
  });

  if (!resend) {
    await Client.findByIdAndUpdate(clientId, { status: 'INVITED' });
  }

  logger.info({ clientId, email: client.email }, 'Client invitation sent');
}

export async function acceptInvite(token: string, password?: string): Promise<{ userId: string; clientId: string; accessToken: string; refreshToken: string; user: Partial<import('../../models/User').IUser> }> {
  const hash = hashSHA256(token);
  const key = `${INVITE_TOKEN_PREFIX}${hash}`;

  const raw = await cacheGet<unknown>(key);
  if (!raw) throw new ValidationError('Invitation token is invalid or expired');

  // cacheGet already JSON.parses the stored value, so raw is either:
  //   - an object  { clientId, userId }  (Redis returned parsed JSON)
  //   - a string   '{"clientId":...}'    (Redis returned raw string, shouldn't happen but guard anyway)
  let clientId: string;
  let userId: string;

  if (typeof raw === 'string') {
    const parsed = JSON.parse(raw) as { clientId: string; userId: string };
    clientId = parsed.clientId;
    userId   = parsed.userId;
  } else {
    const parsed = raw as { clientId: string; userId: string };
    clientId = parsed.clientId;
    userId   = parsed.userId;
  }

  await cacheDel(key);

  if (password) {
    const argon2 = await import('argon2');
    const passwordHash = await argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });
    await User.findByIdAndUpdate(userId, { passwordHash });
  }

  await Client.findByIdAndUpdate(clientId, { status: 'ONBOARDING' });

  // Auto-login: generate tokens so the frontend can log the user in immediately
  const user = await User.findById(userId);
  if (!user) throw new ValidationError('User not found after accepting invite');

  const sessionId = uuidv4();
  const tokenFamily = uuidv4();

  const accessToken = signAccessToken({
    sub: user._id.toString(),
    role: user.role,
    orgRole: user.orgRole || user.role,
    organizationId: user.organizationId?.toString() || '',
    clientId: user.clientId?.toString(),
    sessionId,
  });

  const refreshToken = signRefreshToken({
    sub: user._id.toString(),
    sessionId,
    family: tokenFamily,
    organizationId: user.organizationId?.toString() || '',
  });

  // Store refresh token hash in Redis
  const refreshHash = hashSHA256(refreshToken);
  await cacheSet(`refresh:${sessionId}`, refreshHash, 7 * 24 * 60 * 60);

  user.lastLoginAt = new Date();
  await user.save();

  return { userId, clientId, accessToken, refreshToken, user: user.toSafeObject() };
}

export async function getClientAnalytics(clientId: string, organizationId?: string) {
  const { Project } = await import('../../models/Project');
  const { Invoice } = await import('../../models/Invoice');

  // Always scope to org when available — prevents cross-tenant data leakage
  const projectFilter: Record<string, unknown> = { clientId };
  const invoiceFilter: Record<string, unknown> = { clientId };
  if (organizationId) {
    projectFilter.organizationId = organizationId;
    invoiceFilter.organizationId = organizationId;
  }

  const [projects, invoices] = await Promise.all([
    Project.find(projectFilter).lean(),
    Invoice.find(invoiceFilter).lean(),
  ]);

  const totalRevenue = invoices
    .filter(i => i.status === 'PAID')
    .reduce((sum, i) => sum + i.total, 0);

  const outstandingRevenue = invoices
    .filter(i => ['SENT', 'VIEWED', 'PARTIAL', 'OVERDUE'].includes(i.status))
    .reduce((sum, i) => sum + i.total, 0);

  return {
    totalProjects: projects.length,
    activeProjects: projects.filter(p => p.status === 'ACTIVE').length,
    completedProjects: projects.filter(p => p.status === 'COMPLETED').length,
    totalRevenue,
    outstandingRevenue,
    totalInvoices: invoices.length,
    paidInvoices: invoices.filter(i => i.status === 'PAID').length,
    overdueInvoices: invoices.filter(i => i.status === 'OVERDUE').length,
  };
}
