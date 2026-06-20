import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { PixService } from '../pix/pix.service';
import { InitiatePaymentDto } from './dto/initiate-payment.dto';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private prisma: PrismaService,
    private pixService: PixService,
  ) {}

  async findAll(workspaceId: string) {
    return this.prisma.payment.findMany({
      where: { lead: { workspaceId } },
      include: {
        lead: { select: { id: true, name: true, leadUid: true } },
        product: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async findById(id: string) {
    return this.prisma.payment.findUnique({
      where: { id },
      include: {
        lead: { select: { id: true, name: true, leadUid: true } },
        product: { select: { id: true, name: true, price: true } },
      },
    });
  }

  async initiatePayment(workspaceId: string, dto: InitiatePaymentDto) {
    let lead = await this.prisma.lead.findUnique({
      where: { id: dto.leadId },
    });

    if (!lead || lead.workspaceId !== workspaceId) {
      throw new Error('Lead not found');
    }

    const charge = await this.pixService.createCharge(
      workspaceId,
      dto.leadId,
      dto.productId,
    );

    await this.prisma.event.create({
      data: {
        leadId: dto.leadId,
        eventName: 'INITIATE_CHECKOUT',
        source: 'pix',
        metadata: {
          productId: dto.productId,
          amount: charge.amount,
          transactionId: charge.transactionId || charge.id,
        },
      },
    });

    return charge;
  }
}
