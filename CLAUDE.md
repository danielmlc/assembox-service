# Assembox 项目规范

> 本文件定义项目级开发规范，Claude 在协助开发时需遵循这些规范。

---

## 1. 数据库设计规范

### 1.1 公共字段规范

所有表都继承云阙平台的基础实体规范：

```sql
-- 主键 (HasPrimaryEntity)
id              BIGINT NOT NULL COMMENT '主键',

-- 审计字段 (BaseEntity)
created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
creator_id      BIGINT,
creator_name    VARCHAR(50),
modifier_at     DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
modifier_id     BIGINT,
modifier_name   VARCHAR(50),
is_removed      TINYINT(1) DEFAULT 0,
version         BIGINT DEFAULT 0,

-- 启用/排序 (HasEnableEntity)
sort_code       INT,
is_enable       TINYINT(1) DEFAULT 1
```

**字段说明：**

| 字段 | 类型 | 说明 |
|-----|------|------|
| id | BIGINT | 主键，雪花算法生成 |
| created_at | DATETIME | 创建时间，自动填充 |
| creator_id | BIGINT | 创建人ID |
| creator_name | VARCHAR(50) | 创建人姓名（冗余） |
| modifier_at | DATETIME | 修改时间，自动更新 |
| modifier_id | BIGINT | 修改人ID |
| modifier_name | VARCHAR(50) | 修改人姓名（冗余） |
| is_removed | TINYINT(1) | 逻辑删除标记，0=正常，1=已删除 |
| version | BIGINT | 乐观锁版本号 |
| sort_code | INT | 排序码 |
| is_enable | TINYINT(1) | 启用状态，0=禁用，1=启用 |

**实体继承层次：**

```
HasPrimaryEntity        ← 仅主键
    │
    └── BaseEntity      ← + 审计字段
            │
            └── HasEnableEntity  ← + 启用/排序
```

### 1.2 命名规范

**表名：**

| 规则 | 示例 |
|-----|------|
| 使用小写字母和下划线 | `ab_module`, `ab_config` |
| 以模块前缀开头 | `ab_` (Assembox) |
| 使用单数形式 | `ab_module` 而非 `ab_modules` |

**字段名：**

| 规则 | 示例 |
|-----|------|
| 使用小写字母和下划线 | `module_code`, `version_id` |
| 外键字段以 `_id` 结尾 | `module_id`, `component_id` |
| 布尔字段以 `is_` 开头 | `is_enable`, `is_removed` |
| 时间字段以 `_at` 结尾 | `created_at`, `published_at` |

### 1.3 约束规范

**主键：**
- 所有表必须有主键
- 使用 `BIGINT` 类型，雪花算法生成
- 只定义 `PRIMARY KEY (id)`

**外键：**
- **不使用数据库外键约束**
- 通过应用层保证数据一致性
- 逻辑关联通过 `_id` 字段表达

**索引：**
- **初始不定义索引**（除主键外）
- 根据实际查询需求逐步添加
- 索引添加需评估写入性能影响

### 1.4 数据类型规范

| 类型 | 使用场景 | 说明 |
|-----|---------|------|
| BIGINT | 主键、外键、大数值 | 8字节整数 |
| INT | 普通整数、状态码 | 4字节整数 |
| VARCHAR(N) | 变长字符串 | N 根据实际需要设定 |
| TEXT | 大文本 | 不建议使用，大内容存 OSS |
| DATETIME | 时间 | 精确到秒 |
| TINYINT(1) | 布尔值 | 0/1 |
| DECIMAL(M,N) | 金额、精确小数 | M=总位数，N=小数位 |
