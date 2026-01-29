import { Injectable } from '@nestjs/common';
import { BaseRepository } from '@cs/nest-typeorm';
import { AbComponent, ComponentCategory } from '../entities';

/**
 * 组件仓储
 */
@Injectable()
export class ComponentRepository extends BaseRepository<AbComponent> {
  /**
   * 根据版本ID和组件代码查找组件
   */
  async findByVersionAndCode(
    versionId: string,
    componentCode: string,
  ): Promise<AbComponent> {
    return this.findOne({
      versionId,
      componentCode,
      isRemoved: false,
    } as Partial<AbComponent>);
  }

  /**
   * 根据模块、版本、组件类型、组件代码查找组件
   */
  async findByFullKey(
    moduleCode: string,
    versionCode: string,
    componentType: string,
    componentCode: string,
  ): Promise<AbComponent> {
    return this.findOne({
      moduleCode,
      versionCode,
      componentType,
      componentCode,
      isRemoved: false,
    } as Partial<AbComponent>);
  }

  /**
   * 查询版本下所有组件
   */
  async findByVersion(versionId: string): Promise<AbComponent[]> {
    return this.findMany({
      versionId,
      isRemoved: false,
    } as Partial<AbComponent>);
  }

  /**
   * 查询版本下指定分类的所有组件
   */
  async findByVersionAndCategory(
    versionId: string,
    category: ComponentCategory,
  ): Promise<AbComponent[]> {
    return this.findMany({
      versionId,
      category,
      isRemoved: false,
    } as Partial<AbComponent>);
  }

  /**
   * 查询版本下指定类型的所有组件
   */
  async findByVersionAndType(
    versionId: string,
    componentType: string,
  ): Promise<AbComponent[]> {
    return this.findMany({
      versionId,
      componentType,
      isRemoved: false,
    } as Partial<AbComponent>);
  }
}
