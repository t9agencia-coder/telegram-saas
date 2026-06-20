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

  async findById(id: string) {
    const product = await this.prisma.product.findUnique({ where: { id } });
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

  async update(id: string, dto: UpdateProductDto) {
    await this.findById(id);
    return this.prisma.product.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.findById(id);
    return this.prisma.product.update({
      where: { id },
      data: { isActive: false },
    });
  }
}
