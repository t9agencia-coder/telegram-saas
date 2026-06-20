import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { CreateWorkspaceDto } from './dto/create-workspace.dto';
import { UpdateWorkspaceDto } from './dto/update-workspace.dto';

@Injectable()
export class WorkspacesService {
  constructor(private prisma: PrismaService) {}

  async findAllByUser(userId: string) {
    return this.prisma.workspace.findMany({
      where: { ownerId: userId, isActive: true },
      select: {
        id: true,
        name: true,
        createdAt: true,
        _count: {
          select: {
            bots: true,
            leads: true,
            products: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(id: string, userId: string) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            bots: true,
            leads: true,
            products: true,
            automations: true,
          },
        },
      },
    });

    if (!workspace) throw new NotFoundException('Workspace not found');
    if (workspace.ownerId !== userId) throw new ForbiddenException('Access denied');

    return workspace;
  }

  async create(dto: CreateWorkspaceDto, userId: string) {
    return this.prisma.workspace.create({
      data: {
        name: dto.name,
        ownerId: userId,
      },
    });
  }

  async update(id: string, dto: UpdateWorkspaceDto, userId: string) {
    await this.findById(id, userId);
    return this.prisma.workspace.update({
      where: { id },
      data: dto,
    });
  }

  async remove(id: string, userId: string) {
    await this.findById(id, userId);
    return this.prisma.workspace.update({
      where: { id },
      data: { isActive: false },
    });
  }
}
