import { IsString, IsBoolean, IsEnum, IsOptional, MaxLength } from 'class-validator';
import { ComponentCategory } from '../entities';

/**
 * 创建组件 DTO
 */
export class CreateComponentDto {
  @IsString()
  versionId: string;

  @IsString()
  @MaxLength(100)
  moduleCode: string;

  @IsString()
  @MaxLength(20)
  versionCode: string;

  @IsString()
  @MaxLength(100)
  componentCode: string;

  @IsString()
  @MaxLength(200)
  componentName: string;

  @IsString()
  @MaxLength(50)
  componentType: string;

  @IsEnum(ComponentCategory)
  category: ComponentCategory;

  @IsOptional()
  @IsBoolean()
  isInheritable?: boolean;

  @IsOptional()
  @IsBoolean()
  isCacheable?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

/**
 * 更新组件 DTO
 */
export class UpdateComponentDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  componentName?: string;

  @IsOptional()
  @IsBoolean()
  isInheritable?: boolean;

  @IsOptional()
  @IsBoolean()
  isCacheable?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}
