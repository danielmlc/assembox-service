import { IsString, IsOptional, MaxLength } from 'class-validator';

/**
 * 创建模块 DTO
 */
export class CreateModuleDto {
  @IsString()
  @MaxLength(100)
  moduleCode: string;

  @IsString()
  @MaxLength(200)
  moduleName: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

/**
 * 更新模块 DTO
 */
export class UpdateModuleDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  moduleName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsString()
  activeVersionId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  activeVersionCode?: string;
}
