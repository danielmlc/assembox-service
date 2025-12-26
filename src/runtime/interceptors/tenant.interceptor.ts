import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  ForbiddenException,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { ContextService } from '@cs/nest-common';

/**
 * 租户拦截器
 * 负责从请求中提取租户信息并设置到上下文中
 * MysqlDriverInterceptor 会自动读取上下文中的 tenantCode 并添加 SQL 条件
 */
@Injectable()
export class TenantInterceptor implements NestInterceptor {
  constructor(private readonly contextService: ContextService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();

    // 从请求头或用户信息中获取租户代码
    const tenantCode = this.extractTenantCode(request);

    if (!tenantCode) {
      throw new ForbiddenException('租户信息缺失');
    }

    // 设置租户上下文
    // MysqlDriverInterceptor.processSQL() 会读取这个值并自动添加 tenant 条件
    this.contextService.setContext('tenantCode', tenantCode);

    // 同时设置其他有用的上下文信息
    const userId = request.user?.id || request.headers['x-user-id'];
    const userName = request.user?.name || request.headers['x-user-name'];

    if (userId) {
      this.contextService.setContext('userId', userId);
    }
    if (userName) {
      this.contextService.setContext('userName', userName);
    }

    return next.handle();
  }

  /**
   * 从请求中提取租户代码
   */
  private extractTenantCode(request: any): string | undefined {
    // 优先级：
    // 1. 用户信息中的租户代码（如果已通过认证）
    // 2. 请求头中的租户代码
    // 3. 查询参数中的租户代码（不推荐，仅用于开发调试）

    if (request.user?.tenantCode) {
      return request.user.tenantCode;
    }

    if (request.headers['x-tenant-code']) {
      return request.headers['x-tenant-code'];
    }

    // 开发环境可以从查询参数获取
    if (process.env.NODE_ENV === 'development' && request.query?.tenantCode) {
      return request.query.tenantCode;
    }

    return undefined;
  }
}
