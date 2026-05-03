import { Contract, IContract } from '../../models/Contract';
import { ContractTemplate } from '../../models/ContractTemplate';
import { NotFoundError, ValidationError } from '../../lib/errors';
import { hashContractSignature } from '../../lib/crypto';
import { generateContractPDF } from '../../lib/pdf';
import { uploadFile, generateStorageKey } from '../../config/storage';
import { sendEmail } from '../../lib/email';
import { createNotification } from '../notifications/notifications.service';
import { emitAutomationEvent } from '../automations/automations.service';
import { env } from '../../config/env';
import { logger } from '../../lib/logger';

export async function listContracts(query: {
  clientId?: string;
  projectId?: string;
  status?: string;
  page?: number;
  limit?: number;
}) {
  const { clientId, projectId, status, page = 1, limit = 20 } = query;
  const filter: Record<string, unknown> = {};
  if (clientId) filter.clientId = clientId;
  if (projectId) filter.projectId = projectId;
  if (status) filter.status = status;

  const [contracts, total] = await Promise.all([
    Contract.find(filter)
      .populate('clientId', 'companyName contactName email')
      .populate('projectId', 'name slug')
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Contract.countDocuments(filter),
  ]);

  return { contracts, total, page, limit };
}

export async function getContract(id: string): Promise<IContract> {
  const contract = await Contract.findById(id)
    .populate('clientId', 'companyName contactName email')
    .populate('projectId', 'name slug')
    .populate('createdBy', 'name email');
  if (!contract) throw new NotFoundError('Contract');
  return contract;
}

export async function createContract(data: {
  clientId: string;
  projectId?: string;
  templateId?: string;
  type: string;
  title: string;
  content?: string;
  variables?: Record<string, unknown>;
  expiresAt?: Date;
  createdBy: string;
}): Promise<IContract> {
  let content = data.content || '';

  // If template provided, use it
  if (data.templateId) {
    const template = await ContractTemplate.findById(data.templateId);
    if (template) {
      content = injectVariables(template.content, data.variables || {});
    }
  }

  const contract = await Contract.create({
    ...data,
    content,
    status: 'DRAFT',
  });

  return contract;
}

export async function updateContract(id: string, data: Partial<IContract>): Promise<IContract> {
  const contract = await Contract.findById(id);
  if (!contract) throw new NotFoundError('Contract');

  if (['SIGNED', 'EXECUTED'].includes(contract.status)) {
    throw new ValidationError('Cannot edit a signed or executed contract');
  }

  const updated = await Contract.findByIdAndUpdate(id, { $set: data }, { new: true });
  return updated!;
}

export async function sendContract(id: string): Promise<IContract> {
  const contract = await Contract.findById(id).populate('clientId');
  if (!contract) throw new NotFoundError('Contract');

  if (contract.status !== 'DRAFT') {
    throw new ValidationError('Only draft contracts can be sent');
  }

  const updated = await Contract.findByIdAndUpdate(
    id,
    { status: 'SENT', sentAt: new Date() },
    { new: true }
  ).populate('clientId');

  if (!updated) throw new NotFoundError('Contract');

  // Send email to client
  try {
    const client = updated.clientId as unknown as { email: string; contactName: string };
    const link = `${env.FRONTEND_URL}/contracts/${id}`;
    await sendEmail({
      to: client.email,
      subject: `Contract ready for review: ${updated.title}`,
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
          <h2>Contract Ready for Review</h2>
          <p>Hi ${client.contactName},</p>
          <p>A contract is ready for your review and signature: <strong>${updated.title}</strong></p>
          <a href="${link}" style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; margin-top: 16px;">Review & Sign</a>
        </div>
      `,
    });
  } catch (err) {
    logger.warn({ err }, 'Contract email failed');
  }

  // Notify client user
  const { User } = await import('../../models/User');
  const clientObj = updated.clientId as unknown as { _id: string };
  const clientUser = await User.findOne({ clientId: clientObj._id, role: 'CLIENT' });
  if (clientUser) {
    await createNotification({
      userId: clientUser._id.toString(),
      type: 'CONTRACT_SENT',
      title: 'Contract ready to sign',
      body: `"${updated.title}" is ready for your signature`,
      link: `/contracts/${id}`,
      metadata: { contractId: id },
    });
  }

  return updated;
}

export async function signContract(id: string, data: {
  svg: string;
  signerName: string;
  ipAddress: string;
  userAgent: string;
  isAgency?: boolean;
}): Promise<IContract> {
  const contract = await Contract.findById(id);
  if (!contract) throw new NotFoundError('Contract');

  if (!['SENT', 'VIEWED'].includes(contract.status) && !data.isAgency) {
    throw new ValidationError('Contract is not ready for signing');
  }

  const timestamp = new Date().toISOString();
  const hash = hashContractSignature(contract.content, data.svg, timestamp);

  const signature = {
    svg: data.svg,
    signedAt: new Date(timestamp),
    ipAddress: data.ipAddress,
    userAgent: data.userAgent,
    hash,
    signerName: data.signerName,
  };

  const updateField = data.isAgency ? 'agencySignature' : 'clientSignature';
  const update: Record<string, unknown> = { [updateField]: signature };

  // Re-fetch to check current state of the OTHER signature
  const currentContract = await Contract.findById(id);
  const otherSigned = data.isAgency
    ? !!currentContract?.clientSignature?.signedAt
    : !!currentContract?.agencySignature?.signedAt;

  if (otherSigned) {
    update.status = 'EXECUTED';
  } else {
    update.status = 'SIGNED';
  }

  const updated = await Contract.findByIdAndUpdate(id, { $set: update }, { new: true });
  if (!updated) throw new NotFoundError('Contract');

  // Generate PDF
  try {
    const pdfBuffer = await generateContractPDF(
      updated.title,
      updated.content,
      {
        client: updated.clientSignature?.signedAt ? {
          name: updated.clientSignature.signerName || 'Client',
          signedAt: updated.clientSignature.signedAt,
        } : undefined,
        agency: updated.agencySignature?.signedAt ? {
          name: updated.agencySignature.signerName || env.AGENCY_NAME,
          signedAt: updated.agencySignature.signedAt,
        } : undefined,
      }
    );

    const pdfKey = generateStorageKey('contracts', `${id}-signed.pdf`);
    await uploadFile(pdfKey, pdfBuffer, 'application/pdf');
    await Contract.findByIdAndUpdate(id, { pdfKey });
  } catch (err) {
    logger.warn({ err }, 'Contract PDF generation failed');
  }

  if (update.status === 'EXECUTED' || update.status === 'SIGNED') {
    await emitAutomationEvent('contract.signed', {
      contractId: id,
      clientId: updated.clientId.toString(),
      projectId: updated.projectId?.toString(),
    });
  }

  return updated;
}

export async function listTemplates() {
  return ContractTemplate.find().sort({ name: 1 }).lean();
}

export async function createTemplate(data: {
  name: string;
  type: string;
  content: string;
  variables?: string[];
  createdBy: string;
}) {
  return ContractTemplate.create(data);
}

function injectVariables(content: string, variables: Record<string, unknown>): string {
  return content.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return String(variables[key] ?? match);
  });
}
