import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

@Injectable()
export class ProductsService {
  constructor(private prisma: PrismaService) {}

  async findAll(workspaceId: string) {
    return this.prisma.product.findMany({
      where: { workspaceId, isActive: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(workspaceId: string, id: string) {
    const product = await this.prisma.product.findFirst({ where: { id, workspaceId } });
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  async create(workspaceId: string, dto: CreateProductDto) {
    return this.prisma.product.create({
      data: {
        workspaceId,
        name: dto.name,
        description: dto.description,
        price: dto.price,
      },
    });
  }

  async update(workspaceId: string, id: string, dto: UpdateProductDto) {
    await this.findById(workspaceId, id);
    return this.prisma.product.update({ where: { id }, data: dto });
  }

  async remove(workspaceId: string, id: string) {
    await this.findById(workspaceId, id);
    return this.prisma.product.update({
      where: { id },
      data: { isActive: false },
    });
  }
}
