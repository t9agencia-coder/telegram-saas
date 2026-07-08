import { Injectable, CanActivate, ExecutionContext, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

// Confere que o usuário autenticado (JWT) é dono do :workspaceId da rota.
// Sem isso, qualquer usuário logado podia acessar dados de outro workspace
// só sabendo/adivinhando o ID (IDOR) — usado nos mesmos controllers que já
// tem @UseGuards(JwtAuthGuard), depois dele na lista.
@Injectable()
export class WorkspaceOwnerGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const workspaceId = request.params?.workspaceId;
    const user = request.user;

    // Rota sem :workspaceId não é afetada por este guard.
    if (!workspaceId) return true;

    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { ownerId: true },
    });
    if (!workspace) throw new NotFoundException('Workspace not found');
    if (!user || workspace.ownerId !== user.id) {
      throw new ForbiddenException('Você não tem acesso a este workspace');
    }
    return true;
  }
}
