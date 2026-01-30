import {
  IsString,
  IsOptional,
  IsIn,
  IsInt,
  IsNumber,
  IsArray,
  IsObject,
  IsBoolean,
  IsDateString,
  MinLength,
  MaxLength,
  Min,
  Max,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

/**
 * 创建测试记录DTO
 */
export class CreateTestRecordDto {
  id?: string;
  @IsString({ message: '标题必须是字符串' })
  @MinLength(1, { message: '标题不能为空' })
  @MaxLength(200, { message: '标题最多200个字符' })
  title = '';

  @IsOptional()
  @IsString({ message: '内容必须是字符串' })
  content?: string;

  @IsOptional()
  @IsIn(['active', 'inactive', 'pending'], {
    message: '状态必须是 active、inactive 或 pending',
  })
  status?: string;

  @IsOptional()
  @IsInt({ message: '优先级必须是整数' })
  @Min(1, { message: '优先级最小值为1' })
  @Max(3, { message: '优先级最大值为3' })
  @Transform(({ value }) => parseInt(value))
  priority?: number;

  @IsOptional()
  @IsNumber({}, { message: '评分必须是数字' })
  @Min(0, { message: '评分最小值为0' })
  @Max(100, { message: '评分最大值为100' })
  @Transform(({ value }) => parseFloat(value))
  score?: number;

  @IsOptional()
  @IsArray({ message: '标签必须是数组' })
  @IsString({ each: true, message: '标签元素必须是字符串' })
  tags?: string[];

  @IsOptional()
  @IsObject({ message: '元数据必须是对象' })
  metadata?: Record<string, any>;

  @IsOptional()
  @IsDateString({}, { message: '到期时间格式不正确' })
  dueDate?: string;

  @IsOptional()
  @IsInt({ message: '查看次数必须是整数' })
  @Min(0, { message: '查看次数不能为负数' })
  @Transform(({ value }) => parseInt(value))
  viewCount?: number;

  @IsOptional()
  @IsBoolean({ message: '是否特色必须是布尔值' })
  @Transform(({ value }) => value === 'true' || value === true)
  isFeatured?: boolean;

  @IsOptional()
  @IsInt({ message: '排序码必须是整数' })
  @Transform(({ value }) => parseInt(value))
  sortCode?: number;

  @IsOptional()
  @IsBoolean({ message: '启用状态必须是布尔值' })
  @Transform(({ value }) => value === 'true' || value === true)
  isEnable?: boolean;
}

/**
 * 更新测试记录DTO
 */
export class UpdateTestRecordDto {
  @IsOptional()
  @IsString({ message: '标题必须是字符串' })
  @MinLength(1, { message: '标题不能为空' })
  @MaxLength(200, { message: '标题最多200个字符' })
  title?: string;

  @IsOptional()
  @IsString({ message: '内容必须是字符串' })
  content?: string;

  @IsOptional()
  @IsIn(['active', 'inactive', 'pending'], {
    message: '状态必须是 active、inactive 或 pending',
  })
  status?: string;

  @IsOptional()
  @IsInt({ message: '优先级必须是整数' })
  @Min(1, { message: '优先级最小值为1' })
  @Max(3, { message: '优先级最大值为3' })
  @Transform(({ value }) => parseInt(value))
  priority?: number;

  @IsOptional()
  @IsNumber({}, { message: '评分必须是数字' })
  @Min(0, { message: '评分最小值为0' })
  @Max(100, { message: '评分最大值为100' })
  @Transform(({ value }) => parseFloat(value))
  score?: number;

  @IsOptional()
  @IsArray({ message: '标签必须是数组' })
  @IsString({ each: true, message: '标签元素必须是字符串' })
  tags?: string[];

  @IsOptional()
  @IsObject({ message: '元数据必须是对象' })
  metadata?: Record<string, any>;

  @IsOptional()
  @IsDateString({}, { message: '到期时间格式不正确' })
  dueDate?: string;

  @IsOptional()
  @IsInt({ message: '查看次数必须是整数' })
  @Min(0, { message: '查看次数不能为负数' })
  @Transform(({ value }) => parseInt(value))
  viewCount?: number;

  @IsOptional()
  @IsBoolean({ message: '是否特色必须是布尔值' })
  @Transform(({ value }) => value === 'true' || value === true)
  isFeatured?: boolean;

  @IsOptional()
  @IsInt({ message: '排序码必须是整数' })
  @Transform(({ value }) => parseInt(value))
  sortCode?: number;

  @IsOptional()
  @IsBoolean({ message: '启用状态必须是布尔值' })
  @Transform(({ value }) => value === 'true' || value === true)
  isEnable?: boolean;
}

/**
 * 查询测试记录DTO
 */
export class QueryTestRecordDto {
  @IsOptional()
  @IsString({ message: '标题必须是字符串' })
  title?: string;

  @IsOptional()
  @IsString({ message: '内容必须是字符串' })
  content?: string;

  @IsOptional()
  @IsIn(['active', 'inactive', 'pending'], {
    message: '状态必须是 active、inactive 或 pending',
  })
  status?: string;

  @IsOptional()
  @IsInt({ message: '优先级必须是整数' })
  @Transform(({ value }) => parseInt(value))
  priority?: number;

  @IsOptional()
  @IsNumber({}, { message: '最小评分必须是数字' })
  @Transform(({ value }) => parseFloat(value))
  minScore?: number;

  @IsOptional()
  @IsNumber({}, { message: '最大评分必须是数字' })
  @Transform(({ value }) => parseFloat(value))
  maxScore?: number;

  @IsOptional()
  @IsBoolean({ message: '是否特色必须是布尔值' })
  @Transform(({ value }) => value === 'true' || value === true)
  isFeatured?: boolean;

  @IsOptional()
  @IsBoolean({ message: '启用状态必须是布尔值' })
  @Transform(({ value }) => value === 'true' || value === true)
  isEnable?: boolean;

  @IsOptional()
  @IsDateString({}, { message: '开始时间格式不正确' })
  startDate?: string;

  @IsOptional()
  @IsDateString({}, { message: '结束时间格式不正确' })
  endDate?: string;

  @IsOptional()
  @IsInt({ message: '页码必须是整数' })
  @Min(1, { message: '页码最小值为1' })
  @Transform(({ value }) => parseInt(value))
  page?: number = 1;

  @IsOptional()
  @IsInt({ message: '每页数量必须是整数' })
  @Min(1, { message: '每页数量最小值为1' })
  @Max(100, { message: '每页数量最大值为100' })
  @Transform(({ value }) => parseInt(value))
  pageSize?: number = 10;

  @IsOptional()
  @IsString({ message: '排序字段必须是字符串' })
  sortField?: string;

  @IsOptional()
  @IsIn(['ASC', 'DESC'], { message: '排序方向必须是 ASC 或 DESC' })
  sortOrder?: 'ASC' | 'DESC';
}

/**
 * 批量操作DTO
 */
export class BatchOperationDto {
  @IsArray({ message: 'ID列表必须是数组' })
  @IsString({ each: true, message: 'ID必须是字符串' })
  ids: string[] = [];
}

/**
 * 批量更新状态DTO
 */
export class BatchUpdateStatusDto extends BatchOperationDto {
  @IsIn(['active', 'inactive', 'pending'], {
    message: '状态必须是 active、inactive 或 pending',
  })
  status = 'active';
}

/**
 * 批量创建DTO
 */
export class BatchCreateTestRecordDto {
  @IsArray({ message: '记录列表必须是数组' })
  @ValidateNested({ each: true })
  @Type(() => CreateTestRecordDto)
  records: CreateTestRecordDto[] = [];
}

/**
 * SQL测试DTO
 */
export class SqlTestDto {
  @IsOptional()
  @IsString({ message: 'SQL语句必须是字符串' })
  sql?: string;

  @IsOptional()
  @IsObject({ message: '参数必须是对象' })
  parameters?: Record<string, any>;

  @IsOptional()
  @IsIn(['basic', 'complex', 'custom'], { message: '测试类型无效' })
  testType?: string;
}

/**
 * 测试记录响应DTO
 */
export class TestRecordResponseDto {
  id = '';
  title = '';
  content?: string;
  status = 'active';
  priority = 0;
  score?: number;
  tags?: string[];
  metadata?: Record<string, any>;
  dueDate?: Date;
  viewCount = 0;
  isFeatured = false;
  sortCode?: number;
  isEnable = true;
  createdAt: Date = new Date();
  creatorId?: string;
  creatorName?: string;
  modifierAt?: Date;
  modifierId?: string;
  modifierName?: string;
  version?: number;
}

/**
 * 统计信息响应DTO
 */
export class StatisticsResponseDto {
  total = 0;
  activeCount = 0;
  inactiveCount = 0;
  pendingCount = 0;
  avgPriority = 0;
  avgScore = 0;
}

/**
 * 事务操作步骤DTO
 */
export class TransactionOperationDto {
  step = '';
  action = '';
  recordId?: string;
  success = false;
}

/**
 * 事务测试响应DTO
 */
export class TransactionTestResponseDto {
  message = '';
  operations: TransactionOperationDto[] = [];
}

/**
 * 事务回滚操作步骤DTO
 */
export class TransactionRollbackOperationDto {
  step = '';
  action = '';
  recordId?: string;
  success = false;
  error?: string;
}

/**
 * 事务回滚测试响应DTO
 */
export class TransactionRollbackTestResponseDto {
  message = '';
  isRolledBack = false;
  operations: TransactionRollbackOperationDto[] = [];
  recordsBeforeTransaction = 0;
  recordsAfterTransaction = 0;
}
