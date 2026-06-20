import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ProductsService } from './products.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

@ApiTags('Products')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('workspaces/:workspaceId/products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  @ApiOperation({ summary: 'List all products' })
  async findAll(@Param('workspaceId') workspaceId: string) {
    return this.productsService.findAll(workspaceId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get product by ID' })
  async findOne(@Param('id') id: string) {
    return this.productsService.findById(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a product' })
  async create(@Param('workspaceId') workspaceId: string, @Body() dto: CreateProductDto) {
    return this.productsService.create(workspaceId, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update product' })
  async update(@Param('id') id: string, @Body() dto: UpdateProductDto) {
    return this.productsService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete product' })
  async remove(@Param('id') id: string) {
    return this.productsService.remove(id);
  }
}
