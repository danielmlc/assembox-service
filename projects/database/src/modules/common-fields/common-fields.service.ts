import { Injectable, NotFoundException } from '@nestjs/common';
import { Repository, Like } from 'typeorm';
import { LoggerService } from '@cs/nest-common';
import { InjectRepository } from '@cs/nest-typeorm';
import { CommonFieldsDemo } from './common-fields.entity';
import {
  CreateCommonFieldsDto,
  UpdateCommonFieldsDto,
  QueryCommonFieldsDto,
  CompositeKeyDto,
} from './common-fields.dto';

/**
 * 常用字段服务 - 跨库操作示例
 * 直接使用 TypeORM Repository 的基础方法
 */
@Injectable()
export class CommonFieldsService {
  constructor(
    @InjectRepository({
      entity: CommonFieldsDemo,
      connectionName: 'common', // 指定使用 common 数据源
    })
    private readonly commonFieldsRepository: Repository<CommonFieldsDemo>,
    private readonly logger: LoggerService,
  ) {}

  /**
   * 创建记录
   */
  async create(createDto: CreateCommonFieldsDto): Promise<CommonFieldsDemo> {
    this.logger.debug('创建常用字段记录');

    const entity = this.commonFieldsRepository.create({
      ...createDto,
      sortCode: createDto.sortCode ?? 0,
      isEnable: createDto.isEnable ?? 1,
    });

    return await this.commonFieldsRepository.save(entity);
  }

  /**
   * 根据复合主键查询单条记录
   */
  async findOne(compositeKey: CompositeKeyDto): Promise<CommonFieldsDemo> {
    this.logger.debug(
      `查询常用字段记录: id=${compositeKey.id}, tenant=${compositeKey.tenant}, orderId=${compositeKey.orderId}`,
    );

    // BaseRepository.findOne 直接传入条件对象，不需要 where 包装
    const record = await this.commonFieldsRepository.findOne({
      id: compositeKey.id,
      tenant: compositeKey.tenant,
      orderId: compositeKey.orderId,
    });

    if (!record) {
      throw new NotFoundException(
        `记录不存在: id=${compositeKey.id}, tenant=${compositeKey.tenant}, orderId=${compositeKey.orderId}`,
      );
    }

    return record;
  }

  /**
   * 根据条件查询多条记录
   */
  async findMany(queryDto: QueryCommonFieldsDto): Promise<CommonFieldsDemo[]> {
    this.logger.debug('查询常用字段记录列表');

    const where: any = {};

    if (queryDto.id) {
      where.id = queryDto.id;
    }
    if (queryDto.tenant) {
      where.tenant = queryDto.tenant;
    }
    if (queryDto.orderId) {
      where.orderId = queryDto.orderId;
    }
    if (queryDto.code) {
      where.code = queryDto.code;
    }
    if (queryDto.name) {
      // 模糊查询
      where.name = Like(`%${queryDto.name}%`);
    }
    if (queryDto.isEnable !== undefined) {
      where.isEnable = queryDto.isEnable;
    }
    if (queryDto.orgId) {
      where.orgId = queryDto.orgId;
    }

    return await this.commonFieldsRepository.find({ where });
  }

  /**
   * 查询所有记录
   */
  async findAll(): Promise<CommonFieldsDemo[]> {
    this.logger.debug('查询所有常用字段记录');
    return await this.commonFieldsRepository.find();
  }

  /**
   * 根据复合主键更新记录
   */
  async update(
    compositeKey: CompositeKeyDto,
    updateDto: UpdateCommonFieldsDto,
  ): Promise<CommonFieldsDemo> {
    this.logger.debug(
      `更新常用字段记录: id=${compositeKey.id}, tenant=${compositeKey.tenant}, orderId=${compositeKey.orderId}`,
    );

    // 先查询记录是否存在
    await this.findOne(compositeKey);

    // 执行更新
    await this.commonFieldsRepository.update(
      {
        id: compositeKey.id,
        tenant: compositeKey.tenant,
        orderId: compositeKey.orderId,
      },
      updateDto,
    );

    // 返回更新后的记录
    return await this.findOne(compositeKey);
  }

  /**
   * 根据复合主键删除记录
   */
  async remove(compositeKey: CompositeKeyDto): Promise<void> {
    this.logger.debug(
      `删除常用字段记录: id=${compositeKey.id}, tenant=${compositeKey.tenant}, orderId=${compositeKey.orderId}`,
    );

    // 先查询记录是否存在
    await this.findOne(compositeKey);

    // 执行删除
    await this.commonFieldsRepository.delete({
      id: compositeKey.id,
      tenant: compositeKey.tenant,
      orderId: compositeKey.orderId,
    });
  }

  /**
   * 统计记录数量
   */
  async count(queryDto?: QueryCommonFieldsDto): Promise<number> {
    this.logger.debug('统计常用字段记录数量');

    if (!queryDto) {
      return await this.commonFieldsRepository.count();
    }

    const where: any = {};
    if (queryDto.id) where.id = queryDto.id;
    if (queryDto.tenant) where.tenant = queryDto.tenant;
    if (queryDto.orderId) where.orderId = queryDto.orderId;
    if (queryDto.code) where.code = queryDto.code;
    if (queryDto.name) where.name = Like(`%${queryDto.name}%`);
    if (queryDto.isEnable !== undefined) where.isEnable = queryDto.isEnable;
    if (queryDto.orgId) where.orgId = queryDto.orgId;

    return await this.commonFieldsRepository.count({ where });
  }
}
