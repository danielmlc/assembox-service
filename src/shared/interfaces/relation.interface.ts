import { RelationType, JoinType } from '../constants/aseembox.constants';

/**
 * JOIN 配置接口
 */
export interface JoinConfig {
  sourceField: string;
  targetField: string;
  joinType: JoinType;
}

/**
 * 关联定义接口
 */
export interface IRelationDefinition {
  id: string;
  code: string;
  name: string;
  description?: string;

  sourceModelId: string;
  sourceModelCode: string;
  targetModelId: string;
  targetModelCode: string;

  type: RelationType;
  joinConfig: JoinConfig;

  includeFields?: string[];
  fieldAliases?: Record<string, string>;

  createdAt: Date;
  updatedAt: Date;
}

/**
 * 创建关联 DTO
 */
export interface CreateRelationDto {
  code: string;
  name: string;
  description?: string;
  targetModelCode: string;
  type: RelationType;
  joinConfig: JoinConfig;
  includeFields?: string[];
  fieldAliases?: Record<string, string>;
}

/**
 * 更新关联 DTO
 */
export interface UpdateRelationDto extends Partial<CreateRelationDto> {}
