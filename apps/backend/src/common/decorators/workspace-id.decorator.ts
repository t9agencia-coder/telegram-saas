import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const WorkspaceId = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.headers['x-workspace-id'] || request.params.workspaceId;
  },
);
