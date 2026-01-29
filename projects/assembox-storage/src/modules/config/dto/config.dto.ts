import { IsString, IsEnum, IsOptional, IsObject, MaxLength } from 'class-validator';
import { ConfigScope } from '../entities';

/**
 * 保存配置草稿 DTO
 */
export class SaveConfigDraftDto {
  @IsString()
  componentId: string;

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
  @MaxLength(50)
  componentType: string;

  @IsEnum(ConfigScope)
  scope: ConfigScope;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  tenant?: string;

  @IsObject()
  content: Record<string, any>;
}

/**
 * 发布配置 DTO
 */
export class PublishConfigDto {
  @IsString()
  configId: string;
}

/**
 * 查询配置 DTO
 */
export class LoadConfigDto {
  @IsString()
  @MaxLength(100)
  moduleCode: string;

  @IsString()
  @MaxLength(20)
  versionCode: string;

  @IsString()
  @MaxLength(50)
  componentType: string;

  @IsString()
  @MaxLength(100)
  componentCode: string;

  @IsString()
  @MaxLength(64)
  tenant: string;
}
