import {
  IsString,
  IsOptional,
  IsInt,
  Min,
  Max,
  MaxLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * 创建常用字段记录 DTO
 */
export class CreateCommonFieldsDto {
  @ApiProperty({ description: '主键', example: '1234567890' })
  @IsString()
  id!: string;

  @ApiProperty({ description: '租户编码', example: 'tenant001' })
  @IsString()
  @MaxLength(50)
  tenant!: string;

  @ApiProperty({ description: '单据主键', example: '9876543210' })
  @IsString()
  orderId!: string;

  @ApiProperty({ description: '编码', example: 'CODE001' })
  @IsString()
  @MaxLength(50)
  code!: string;

  @ApiProperty({ description: '名称', example: '示例名称' })
  @IsString()
  @MaxLength(100)
  name!: string;

  @ApiProperty({ description: '排序码', example: 0, required: false })
  @IsOptional()
  @IsInt()
  sortCode?: number;

  @ApiProperty({
    description: '启用状态：0-禁用，1-启用',
    example: 1,
    required: false,
  })
  @IsOptional()
  isEnable?: number;

  @ApiProperty({ description: '组织机构ID', example: '100', required: false })
  @IsOptional()
  @IsString()
  orgId?: string;

  @ApiProperty({
    description: '备注',
    example: '这是一条备注',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  remark?: string;
}

/**
 * 更新常用字段记录 DTO
 */
export class UpdateCommonFieldsDto {
  @ApiProperty({ description: '编码', example: 'CODE001', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  code?: string;

  @ApiProperty({ description: '名称', example: '示例名称', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @ApiProperty({ description: '排序码', example: 0, required: false })
  @IsOptional()
  @IsInt()
  sortCode?: number;

  @ApiProperty({
    description: '启用状态：0-禁用，1-启用',
    example: 1,
    required: false,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1)
  isEnable?: number;

  @ApiProperty({ description: '组织机构ID', example: '100', required: false })
  @IsOptional()
  @IsString()
  orgId?: string;

  @ApiProperty({
    description: '备注',
    example: '这是一条备注',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  remark?: string;
}

/**
 * 查询常用字段记录 DTO
 */
export class QueryCommonFieldsDto {
  @ApiProperty({ description: '主键', example: '1234567890', required: false })
  @IsOptional()
  @IsString()
  id?: string;

  @ApiProperty({
    description: '租户编码',
    example: 'tenant001',
    required: false,
  })
  @IsOptional()
  @IsString()
  tenant?: string;

  @ApiProperty({
    description: '单据主键',
    example: '9876543210',
    required: false,
  })
  @IsOptional()
  @IsString()
  orderId?: string;

  @ApiProperty({ description: '编码', example: 'CODE001', required: false })
  @IsOptional()
  @IsString()
  code?: string;

  @ApiProperty({
    description: '名称（模糊查询）',
    example: '示例',
    required: false,
  })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({
    description: '启用状态：0-禁用，1-启用',
    example: 1,
    required: false,
  })
  @IsOptional()
  @IsInt()
  isEnable?: number;

  @ApiProperty({ description: '组织机构ID', example: '100', required: false })
  @IsOptional()
  @IsString()
  orgId?: string;
}

/**
 * 复合主键查询 DTO
 */
export class CompositeKeyDto {
  @ApiProperty({ description: '主键', example: '1234567890' })
  @IsString()
  id!: string;

  @ApiProperty({ description: '租户编码', example: 'tenant001' })
  @IsString()
  tenant!: string;

  @ApiProperty({ description: '单据主键', example: '9876543210' })
  @IsString()
  orderId!: string;
}
