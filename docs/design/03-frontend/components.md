# 组件库设计

> **状态**: 设计中
> **更新日期**: 2025-01-23

---

## 目录

1. [概述](#1-概述)
2. [组件分类](#2-组件分类)
3. [组件接口规范](#3-组件接口规范)
4. [PC端组件](#4-pc端组件)
5. [移动端组件](#5-移动端组件)
6. [业务组件](#6-业务组件)
7. [组件扩展机制](#7-组件扩展机制)
8. [组件开发规范](#8-组件开发规范)

---

## 1. 概述

### 1.1 组件库定位

组件库是 Assembox 前端层的基础构建单元，提供统一的组件接口和实现规范。

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          组件库架构                                          │
└─────────────────────────────────────────────────────────────────────────────┘

                    ┌─────────────────────┐
                    │    组件接口规范      │
                    │  (Component Interface)│
                    └──────────┬──────────┘
                               │
         ┌─────────────────────┼─────────────────────┐
         │                     │                     │
         ▼                     ▼                     ▼
┌────────────────┐   ┌────────────────┐   ┌────────────────┐
│   基础组件      │   │   业务组件      │   │   自定义组件    │
│  Base Components│   │Business Comps  │   │ Custom Comps   │
└────────┬───────┘   └────────┬───────┘   └────────┬───────┘
         │                     │                     │
         └─────────────────────┼─────────────────────┘
                               │
         ┌─────────────────────┼─────────────────────┐
         │                     │                     │
         ▼                     ▼                     ▼
┌────────────────┐   ┌────────────────┐   ┌────────────────┐
│  PC端实现       │   │  移动端实现     │   │  跨端通用实现   │
│ (Element Plus) │   │   (NutUI)      │   │   (Abstract)   │
└────────────────┘   └────────────────┘   └────────────────┘
```

### 1.2 设计原则

| 原则 | 说明 |
|-----|------|
| 接口统一 | PC 和移动端组件遵循相同的属性接口 |
| 配置驱动 | 组件行为由配置决定，减少硬编码 |
| 易于扩展 | 支持自定义组件和组件覆盖 |
| 类型安全 | 完整的 TypeScript 类型定义 |
| 开箱即用 | 提供丰富的内置组件 |

---

## 2. 组件分类

### 2.1 组件分类体系

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          组件分类体系                                        │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  布局组件 (Layout)                                                          │
│  用于页面结构和布局管理                                                       │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐              │
│  │Container│ │   Row   │ │   Col   │ │  Card   │ │  Tabs   │ ...          │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘              │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  表单组件 (Form)                                                            │
│  用于数据录入和表单交互                                                       │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐              │
│  │  Input  │ │ Select  │ │DatePick │ │ Switch  │ │Checkbox │ ...          │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘              │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  数据组件 (Data)                                                            │
│  用于数据展示和列表管理                                                       │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐              │
│  │  Table  │ │  List   │ │  Tree   │ │ Desc    │ │Timeline │ ...          │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘              │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  展示组件 (Display)                                                         │
│  用于信息展示和状态呈现                                                       │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐              │
│  │  Text   │ │  Image  │ │   Tag   │ │  Badge  │ │Statistic│ ...          │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘              │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  操作组件 (Action)                                                          │
│  用于触发操作和交互                                                          │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐              │
│  │ Button  │ │Dropdown │ │Popconfirm│ │  Link   │ │  Menu   │ ...          │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘              │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  反馈组件 (Feedback)                                                        │
│  用于用户反馈和状态提示                                                       │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐              │
│  │ Dialog  │ │ Drawer  │ │ Tooltip │ │Popover  │ │ Toast   │ ...          │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘              │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  业务组件 (Business)                                                        │
│  面向特定业务场景的复合组件                                                   │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐              │
│  │DictSelect│ │OrgTree  │ │UserSelect│ │Upload   │ │Signature│ ...          │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 组件清单

| 分类 | PC端组件 | 移动端组件 | 说明 |
|-----|---------|----------|------|
| **布局** | Container, Row, Col, Card, Tabs, Collapse | Page, Cell, CellGroup, Grid | 页面布局结构 |
| **表单** | Input, Select, DatePicker, Switch, Checkbox, Radio, Upload | Input, Picker, DatePicker, Switch, Checkbox, Radio, Uploader | 数据录入 |
| **数据** | Table, Tree, Descriptions, Pagination | List, Tree, InfiniteLoading, PullRefresh | 数据展示 |
| **展示** | Label, Text, Image, Tag, Badge, Statistic | Text, Image, Tag, Badge, Avatar | 信息展示 |
| **操作** | Button, Dropdown, Popconfirm | Button, ActionSheet, Popover | 操作触发 |
| **反馈** | Dialog, Drawer, Tooltip, Popover | Dialog, Popup, Toast, Notify | 用户反馈 |
| **业务** | DictSelect, OrgTree, UserSelect, FileUpload, RichEditor | DictPicker, AddressPicker, Signature | 业务场景 |

---

## 3. 组件接口规范

### 3.1 基础组件接口

```typescript
/**
 * 基础组件 Props 接口
 * 所有组件都应继承此接口
 */
interface BaseComponentProps {
  // 节点唯一标识
  nodeId: string;

  // 组件值（双向绑定）
  value?: any;

  // 禁用状态
  disabled?: boolean;

  // 只读状态
  readonly?: boolean;

  // 尺寸
  size?: ComponentSize;

  // 自定义样式
  style?: CSSProperties;

  // 自定义类名
  class?: string | string[] | Record<string, boolean>;
}

/**
 * 组件尺寸类型
 */
type ComponentSize = 'large' | 'default' | 'small';

/**
 * 基础组件事件接口
 */
interface BaseComponentEmits {
  // 值变更
  (e: 'update:value', value: any): void;

  // 变更事件
  (e: 'change', value: any): void;

  // 点击事件
  (e: 'click', event: Event): void;

  // 获得焦点
  (e: 'focus', event: FocusEvent): void;

  // 失去焦点
  (e: 'blur', event: FocusEvent): void;
}
```

### 3.2 表单组件接口

```typescript
/**
 * 表单组件 Props 接口
 */
interface FormComponentProps extends BaseComponentProps {
  // 占位文本
  placeholder?: string;

  // 是否必填
  required?: boolean;

  // 是否可清空
  clearable?: boolean;

  // 验证规则
  rules?: ValidationRule[];

  // 错误信息
  error?: string;

  // 是否显示错误信息
  showError?: boolean;
}

/**
 * 表单组件事件接口
 */
interface FormComponentEmits extends BaseComponentEmits {
  // 输入事件
  (e: 'input', value: any): void;

  // 清空事件
  (e: 'clear'): void;

  // 验证事件
  (e: 'validate', valid: boolean, message?: string): void;
}

/**
 * 验证规则
 */
interface ValidationRule {
  // 是否必填
  required?: boolean;

  // 错误消息
  message?: string;

  // 触发方式
  trigger?: 'blur' | 'change' | 'submit';

  // 最小长度
  min?: number;

  // 最大长度
  max?: number;

  // 正则表达式
  pattern?: RegExp;

  // 自定义验证函数
  validator?: (value: any, rule: ValidationRule) => boolean | Promise<boolean>;
}
```

### 3.3 数据组件接口

```typescript
/**
 * 数据组件 Props 接口
 */
interface DataComponentProps extends BaseComponentProps {
  // 数据源
  data?: any[];

  // 加载状态
  loading?: boolean;

  // 空数据文本
  emptyText?: string;

  // 行唯一标识字段
  rowKey?: string | ((row: any) => string);
}

/**
 * 数据组件事件接口
 */
interface DataComponentEmits extends BaseComponentEmits {
  // 行点击
  (e: 'row-click', row: any, index: number): void;

  // 选择变更
  (e: 'selection-change', rows: any[]): void;

  // 加载数据
  (e: 'load-data', params: any): void;

  // 刷新
  (e: 'refresh'): void;
}
```

### 3.4 组件配置 Schema

```typescript
/**
 * 组件配置 Schema
 * 用于设计器中生成属性面板
 */
interface ComponentSchema {
  // 组件类型
  type: string;

  // 组件名称
  name: string;

  // 组件分类
  category: ComponentCategory;

  // 组件图标
  icon: string;

  // 组件描述
  description?: string;

  // 属性配置
  props: PropSchema[];

  // 事件配置
  events: EventSchema[];

  // 插槽配置
  slots?: SlotSchema[];

  // 默认值
  defaultProps?: Record<string, any>;

  // 支持的平台
  platforms: ('pc' | 'mobile')[];
}

/**
 * 属性 Schema
 */
interface PropSchema {
  // 属性名
  name: string;

  // 显示标题
  title: string;

  // 属性类型
  type: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'function';

  // 默认值
  default?: any;

  // 是否必填
  required?: boolean;

  // 属性描述
  description?: string;

  // 编辑器类型
  editor?: EditorType;

  // 编辑器配置
  editorConfig?: Record<string, any>;

  // 显示条件
  visible?: string | boolean;

  // 分组
  group?: string;
}

/**
 * 编辑器类型
 */
type EditorType =
  | 'input'        // 输入框
  | 'textarea'     // 多行文本
  | 'number'       // 数字
  | 'select'       // 下拉选择
  | 'switch'       // 开关
  | 'color'        // 颜色选择
  | 'icon'         // 图标选择
  | 'expression'   // 表达式编辑
  | 'json'         // JSON 编辑
  | 'code'         // 代码编辑
  | 'slot'         // 插槽配置
  | 'event';       // 事件配置
```

---

## 4. PC端组件

### 4.1 输入框组件

```typescript
/**
 * 输入框 Props
 */
interface InputProps extends FormComponentProps {
  // 输入类型
  type?: 'text' | 'password' | 'number' | 'email' | 'tel' | 'url';

  // 最大长度
  maxlength?: number;

  // 是否显示字数统计
  showWordLimit?: boolean;

  // 是否显示密码切换
  showPassword?: boolean;

  // 前置图标
  prefixIcon?: string;

  // 后置图标
  suffixIcon?: string;

  // 输入框行数（textarea）
  rows?: number;

  // 是否自动调整高度
  autosize?: boolean | { minRows?: number; maxRows?: number };
}

/**
 * 输入框组件 Schema
 */
const InputSchema: ComponentSchema = {
  type: 'input',
  name: '输入框',
  category: 'form',
  icon: 'edit',
  description: '文本输入组件',
  platforms: ['pc', 'mobile'],
  props: [
    {
      name: 'type',
      title: '输入类型',
      type: 'string',
      default: 'text',
      editor: 'select',
      editorConfig: {
        options: [
          { label: '文本', value: 'text' },
          { label: '密码', value: 'password' },
          { label: '数字', value: 'number' },
          { label: '邮箱', value: 'email' },
        ],
      },
    },
    {
      name: 'placeholder',
      title: '占位文本',
      type: 'string',
      default: '请输入',
      editor: 'input',
    },
    {
      name: 'maxlength',
      title: '最大长度',
      type: 'number',
      editor: 'number',
    },
    {
      name: 'clearable',
      title: '可清空',
      type: 'boolean',
      default: true,
      editor: 'switch',
    },
    {
      name: 'disabled',
      title: '禁用',
      type: 'boolean',
      default: false,
      editor: 'switch',
    },
  ],
  events: [
    { name: 'onChange', title: '值变更', description: '输入值变更时触发' },
    { name: 'onInput', title: '输入', description: '输入时触发' },
    { name: 'onFocus', title: '获得焦点', description: '获得焦点时触发' },
    { name: 'onBlur', title: '失去焦点', description: '失去焦点时触发' },
    { name: 'onClear', title: '清空', description: '点击清空时触发' },
  ],
  defaultProps: {
    type: 'text',
    placeholder: '请输入',
    clearable: true,
  },
};
```

### 4.2 表格组件

```typescript
/**
 * 表格 Props
 */
interface TableProps extends DataComponentProps {
  // 列配置
  columns: TableColumn[];

  // 是否显示边框
  border?: boolean;

  // 是否显示斑马纹
  stripe?: boolean;

  // 表格高度
  height?: string | number;

  // 最大高度
  maxHeight?: string | number;

  // 是否显示序号列
  showIndex?: boolean;

  // 是否显示选择列
  showSelection?: boolean;

  // 是否高亮当前行
  highlightCurrentRow?: boolean;

  // 默认排序
  defaultSort?: { prop: string; order: 'ascending' | 'descending' };

  // 合并单元格方法
  spanMethod?: (params: SpanMethodParams) => [number, number] | { rowspan: number; colspan: number };
}

/**
 * 表格列配置
 */
interface TableColumn {
  // 字段名
  field: string;

  // 列标题
  label: string;

  // 列宽度
  width?: string | number;

  // 最小宽度
  minWidth?: string | number;

  // 对齐方式
  align?: 'left' | 'center' | 'right';

  // 是否固定
  fixed?: 'left' | 'right' | boolean;

  // 是否可排序
  sortable?: boolean | 'custom';

  // 是否可筛选
  filterable?: boolean;

  // 格式化
  formatter?: string | ((row: any, column: TableColumn, value: any, index: number) => any);

  // 自定义渲染
  render?: string;

  // 子列
  children?: TableColumn[];

  // 是否显示溢出提示
  showOverflowTooltip?: boolean;
}

/**
 * 表格组件 Schema
 */
const TableSchema: ComponentSchema = {
  type: 'table',
  name: '表格',
  category: 'data',
  icon: 'table',
  description: '数据表格组件',
  platforms: ['pc'],
  props: [
    {
      name: 'columns',
      title: '列配置',
      type: 'array',
      required: true,
      editor: 'json',
      group: '数据配置',
    },
    {
      name: 'border',
      title: '显示边框',
      type: 'boolean',
      default: true,
      editor: 'switch',
      group: '外观',
    },
    {
      name: 'stripe',
      title: '斑马纹',
      type: 'boolean',
      default: true,
      editor: 'switch',
      group: '外观',
    },
    {
      name: 'showIndex',
      title: '显示序号',
      type: 'boolean',
      default: false,
      editor: 'switch',
      group: '功能',
    },
    {
      name: 'showSelection',
      title: '显示选择框',
      type: 'boolean',
      default: false,
      editor: 'switch',
      group: '功能',
    },
  ],
  events: [
    { name: 'onRowClick', title: '行点击', description: '点击表格行时触发' },
    { name: 'onSelectionChange', title: '选择变更', description: '选择项变更时触发' },
    { name: 'onSortChange', title: '排序变更', description: '排序变更时触发' },
    { name: 'onCurrentChange', title: '当前行变更', description: '当前行变更时触发' },
  ],
  slots: [
    { name: 'empty', title: '空状态', description: '无数据时显示的内容' },
    { name: 'append', title: '追加内容', description: '表格最后一行之后的内容' },
  ],
  defaultProps: {
    border: true,
    stripe: true,
    rowKey: 'id',
  },
};
```

---

## 5. 移动端组件

### 5.1 选择器组件

```typescript
/**
 * 选择器 Props (移动端)
 */
interface PickerProps extends FormComponentProps {
  // 选项数据
  options: PickerOption[];

  // 是否多列
  columns?: number;

  // 标题
  title?: string;

  // 确认按钮文字
  confirmText?: string;

  // 取消按钮文字
  cancelText?: string;

  // 是否显示工具栏
  showToolbar?: boolean;

  // 是否联动
  cascade?: boolean;

  // 显示的字段
  labelField?: string;

  // 值字段
  valueField?: string;

  // 子级字段
  childrenField?: string;
}

/**
 * 选择器选项
 */
interface PickerOption {
  // 显示文本
  label: string;

  // 值
  value: any;

  // 是否禁用
  disabled?: boolean;

  // 子选项
  children?: PickerOption[];
}

/**
 * 选择器组件 Schema
 */
const PickerSchema: ComponentSchema = {
  type: 'picker',
  name: '选择器',
  category: 'form',
  icon: 'picker',
  description: '移动端选择器组件',
  platforms: ['mobile'],
  props: [
    {
      name: 'options',
      title: '选项数据',
      type: 'array',
      required: true,
      editor: 'json',
    },
    {
      name: 'title',
      title: '标题',
      type: 'string',
      editor: 'input',
    },
    {
      name: 'cascade',
      title: '是否联动',
      type: 'boolean',
      default: false,
      editor: 'switch',
    },
    {
      name: 'placeholder',
      title: '占位文本',
      type: 'string',
      default: '请选择',
      editor: 'input',
    },
  ],
  events: [
    { name: 'onChange', title: '值变更', description: '选择值变更时触发' },
    { name: 'onConfirm', title: '确认', description: '点击确认时触发' },
    { name: 'onCancel', title: '取消', description: '点击取消时触发' },
  ],
  defaultProps: {
    showToolbar: true,
    confirmText: '确认',
    cancelText: '取消',
  },
};
```

### 5.2 列表组件

```typescript
/**
 * 列表 Props (移动端)
 */
interface ListProps extends DataComponentProps {
  // 列表项配置
  itemConfig: ListItemConfig;

  // 是否开启下拉刷新
  pullRefresh?: boolean;

  // 是否开启上拉加载
  infiniteLoading?: boolean;

  // 是否还有更多数据
  hasMore?: boolean;

  // 下拉刷新文字
  refreshText?: string;

  // 加载中文字
  loadingText?: string;

  // 加载完成文字
  finishedText?: string;

  // 滑动操作
  swipeActions?: SwipeAction[];
}

/**
 * 列表项配置
 */
interface ListItemConfig {
  // 标题字段
  titleField?: string;

  // 描述字段
  descField?: string;

  // 头像字段
  avatarField?: string;

  // 右侧内容字段
  extraField?: string;

  // 是否显示箭头
  isLink?: boolean;

  // 自定义渲染
  render?: string;
}

/**
 * 滑动操作
 */
interface SwipeAction {
  // 操作标识
  key: string;

  // 操作文字
  label: string;

  // 按钮类型
  type?: 'primary' | 'danger' | 'warning' | 'default';

  // 背景色
  background?: string;
}

/**
 * 列表组件 Schema
 */
const ListSchema: ComponentSchema = {
  type: 'list',
  name: '列表',
  category: 'data',
  icon: 'list',
  description: '移动端列表组件',
  platforms: ['mobile'],
  props: [
    {
      name: 'pullRefresh',
      title: '下拉刷新',
      type: 'boolean',
      default: true,
      editor: 'switch',
    },
    {
      name: 'infiniteLoading',
      title: '上拉加载',
      type: 'boolean',
      default: true,
      editor: 'switch',
    },
    {
      name: 'itemConfig',
      title: '列表项配置',
      type: 'object',
      editor: 'json',
    },
    {
      name: 'swipeActions',
      title: '滑动操作',
      type: 'array',
      editor: 'json',
    },
  ],
  events: [
    { name: 'onItemClick', title: '项点击', description: '点击列表项时触发' },
    { name: 'onRefresh', title: '刷新', description: '下拉刷新时触发' },
    { name: 'onLoadMore', title: '加载更多', description: '上拉加载时触发' },
    { name: 'onAction', title: '操作', description: '滑动操作时触发' },
  ],
  defaultProps: {
    pullRefresh: true,
    infiniteLoading: true,
    emptyText: '暂无数据',
  },
};
```

---

## 6. 业务组件

### 6.1 字典选择组件

```typescript
/**
 * 字典选择 Props
 */
interface DictSelectProps extends FormComponentProps {
  // 字典编码
  dictCode: string;

  // 是否多选
  multiple?: boolean;

  // 是否可搜索
  filterable?: boolean;

  // 是否远程搜索
  remote?: boolean;

  // 显示模式 (PC: select, 移动端: picker)
  mode?: 'select' | 'picker';

  // 是否允许创建新选项
  allowCreate?: boolean;

  // 选项最大显示数
  maxTagCount?: number;
}

/**
 * 字典选择组件实现
 */
const DictSelect = defineComponent({
  name: 'ABDictSelect',

  props: {
    nodeId: { type: String, required: true },
    dictCode: { type: String, required: true },
    value: { type: [String, Number, Array] },
    multiple: { type: Boolean, default: false },
    filterable: { type: Boolean, default: true },
    disabled: { type: Boolean, default: false },
    placeholder: { type: String, default: '请选择' },
  },

  setup(props, { emit }) {
    const context = inject('renderContext');
    const platform = inject('platform', 'pc');

    // 字典数据
    const dictOptions = ref<DictOption[]>([]);
    const loading = ref(false);

    // 加载字典数据
    const loadDictData = async () => {
      loading.value = true;
      try {
        const data = await context.apiService.getDictByCode(props.dictCode);
        dictOptions.value = data.map((item: any) => ({
          label: item.label,
          value: item.value,
          disabled: item.disabled,
        }));
      } finally {
        loading.value = false;
      }
    };

    onMounted(() => {
      loadDictData();
    });

    // 根据平台选择渲染方式
    const renderComponent = () => {
      if (platform === 'mobile') {
        return h(MobileDictPicker, {
          value: props.value,
          options: dictOptions.value,
          loading: loading.value,
          disabled: props.disabled,
          placeholder: props.placeholder,
          'onUpdate:value': (val: any) => emit('update:value', val),
        });
      }

      return h(ElSelect, {
        modelValue: props.value,
        multiple: props.multiple,
        filterable: props.filterable,
        disabled: props.disabled,
        loading: loading.value,
        placeholder: props.placeholder,
        clearable: true,
        'onUpdate:modelValue': (val: any) => emit('update:value', val),
      }, {
        default: () => dictOptions.value.map(opt =>
          h(ElOption, {
            key: opt.value,
            label: opt.label,
            value: opt.value,
            disabled: opt.disabled,
          })
        ),
      });
    };

    return () => renderComponent();
  },
});
```

### 6.2 文件上传组件

```typescript
/**
 * 文件上传 Props
 */
interface FileUploadProps extends FormComponentProps {
  // 上传地址
  action?: string;

  // 请求头
  headers?: Record<string, string>;

  // 文件类型限制
  accept?: string;

  // 文件大小限制 (MB)
  maxSize?: number;

  // 最大文件数
  maxCount?: number;

  // 是否多选
  multiple?: boolean;

  // 列表类型
  listType?: 'text' | 'picture' | 'picture-card';

  // 是否显示文件列表
  showFileList?: boolean;

  // 是否拖拽上传
  drag?: boolean;

  // 是否自动上传
  autoUpload?: boolean;

  // 提示文字
  tip?: string;
}

/**
 * 文件上传组件 Schema
 */
const FileUploadSchema: ComponentSchema = {
  type: 'file-upload',
  name: '文件上传',
  category: 'business',
  icon: 'upload',
  description: '文件上传组件',
  platforms: ['pc', 'mobile'],
  props: [
    {
      name: 'action',
      title: '上传地址',
      type: 'string',
      editor: 'input',
      group: '上传配置',
    },
    {
      name: 'accept',
      title: '文件类型',
      type: 'string',
      editor: 'input',
      description: '例如: .jpg,.png,.pdf',
      group: '上传配置',
    },
    {
      name: 'maxSize',
      title: '最大文件大小(MB)',
      type: 'number',
      default: 10,
      editor: 'number',
      group: '上传配置',
    },
    {
      name: 'maxCount',
      title: '最大文件数',
      type: 'number',
      default: 5,
      editor: 'number',
      group: '上传配置',
    },
    {
      name: 'listType',
      title: '列表类型',
      type: 'string',
      default: 'text',
      editor: 'select',
      editorConfig: {
        options: [
          { label: '文本', value: 'text' },
          { label: '图片', value: 'picture' },
          { label: '卡片', value: 'picture-card' },
        ],
      },
      group: '外观',
    },
    {
      name: 'drag',
      title: '拖拽上传',
      type: 'boolean',
      default: false,
      editor: 'switch',
      visible: "platform === 'pc'",
      group: '功能',
    },
  ],
  events: [
    { name: 'onChange', title: '文件变更', description: '文件列表变更时触发' },
    { name: 'onSuccess', title: '上传成功', description: '文件上传成功时触发' },
    { name: 'onError', title: '上传失败', description: '文件上传失败时触发' },
    { name: 'onPreview', title: '预览', description: '点击预览时触发' },
    { name: 'onRemove', title: '移除', description: '移除文件时触发' },
  ],
  defaultProps: {
    maxSize: 10,
    maxCount: 5,
    listType: 'text',
    autoUpload: true,
    showFileList: true,
  },
};
```

### 6.3 组织树组件

```typescript
/**
 * 组织树 Props
 */
interface OrgTreeProps extends FormComponentProps {
  // 是否多选
  multiple?: boolean;

  // 是否显示复选框
  showCheckbox?: boolean;

  // 是否默认展开所有
  defaultExpandAll?: boolean;

  // 默认展开层级
  defaultExpandedLevel?: number;

  // 是否可搜索
  filterable?: boolean;

  // 根节点ID
  rootId?: string | number;

  // 是否只能选择叶子节点
  leafOnly?: boolean;

  // 节点点击行为
  checkOnClickNode?: boolean;

  // 数据加载方式
  loadMode?: 'all' | 'lazy';
}

/**
 * 组织树组件 Schema
 */
const OrgTreeSchema: ComponentSchema = {
  type: 'org-tree',
  name: '组织树',
  category: 'business',
  icon: 'org-tree',
  description: '组织架构选择组件',
  platforms: ['pc', 'mobile'],
  props: [
    {
      name: 'multiple',
      title: '多选',
      type: 'boolean',
      default: false,
      editor: 'switch',
    },
    {
      name: 'showCheckbox',
      title: '显示复选框',
      type: 'boolean',
      default: false,
      editor: 'switch',
    },
    {
      name: 'defaultExpandAll',
      title: '默认展开全部',
      type: 'boolean',
      default: false,
      editor: 'switch',
    },
    {
      name: 'filterable',
      title: '可搜索',
      type: 'boolean',
      default: true,
      editor: 'switch',
    },
    {
      name: 'leafOnly',
      title: '仅选叶子节点',
      type: 'boolean',
      default: false,
      editor: 'switch',
    },
  ],
  events: [
    { name: 'onChange', title: '选择变更', description: '选择值变更时触发' },
    { name: 'onNodeClick', title: '节点点击', description: '点击节点时触发' },
    { name: 'onNodeExpand', title: '节点展开', description: '展开节点时触发' },
  ],
  defaultProps: {
    filterable: true,
    loadMode: 'lazy',
    checkOnClickNode: false,
  },
};
```

---

## 7. 组件扩展机制

### 7.1 自定义组件注册

```typescript
/**
 * 组件注册器
 */
class ComponentRegistry {
  private components: Map<string, RegisteredComponent> = new Map();
  private schemas: Map<string, ComponentSchema> = new Map();

  /**
   * 注册组件
   */
  register(
    type: string,
    component: Component,
    schema?: ComponentSchema
  ): void {
    this.components.set(type, {
      component,
      schema,
      registered: new Date(),
    });

    if (schema) {
      this.schemas.set(type, schema);
    }
  }

  /**
   * 批量注册
   */
  registerAll(
    components: Record<string, Component>,
    schemas?: Record<string, ComponentSchema>
  ): void {
    Object.entries(components).forEach(([type, component]) => {
      this.register(type, component, schemas?.[type]);
    });
  }

  /**
   * 获取组件
   */
  get(type: string): Component | undefined {
    return this.components.get(type)?.component;
  }

  /**
   * 获取 Schema
   */
  getSchema(type: string): ComponentSchema | undefined {
    return this.schemas.get(type);
  }

  /**
   * 获取所有组件
   */
  getAll(): Map<string, RegisteredComponent> {
    return new Map(this.components);
  }

  /**
   * 按分类获取组件
   */
  getByCategory(category: ComponentCategory): RegisteredComponent[] {
    return Array.from(this.components.values()).filter(
      comp => comp.schema?.category === category
    );
  }

  /**
   * 覆盖组件
   */
  override(type: string, component: Component): void {
    const existing = this.components.get(type);
    if (existing) {
      existing.component = component;
      existing.overridden = true;
    } else {
      this.register(type, component);
    }
  }

  /**
   * 取消注册
   */
  unregister(type: string): boolean {
    return this.components.delete(type);
  }
}

/**
 * 已注册组件
 */
interface RegisteredComponent {
  component: Component;
  schema?: ComponentSchema;
  registered: Date;
  overridden?: boolean;
}
```

### 7.2 组件扩展示例

```typescript
/**
 * 自定义业务组件示例
 */

// 1. 定义组件
const CustomApprovalFlow = defineComponent({
  name: 'CustomApprovalFlow',
  props: {
    nodeId: { type: String, required: true },
    value: { type: Object },
    steps: { type: Array as PropType<ApprovalStep[]>, default: () => [] },
    currentStep: { type: Number, default: 0 },
  },
  setup(props, { emit }) {
    // 组件逻辑
    return () => h('div', { class: 'approval-flow' }, [
      // 渲染审批流程
    ]);
  },
});

// 2. 定义 Schema
const CustomApprovalFlowSchema: ComponentSchema = {
  type: 'approval-flow',
  name: '审批流程',
  category: 'business',
  icon: 'flow',
  description: '审批流程展示组件',
  platforms: ['pc', 'mobile'],
  props: [
    {
      name: 'steps',
      title: '审批步骤',
      type: 'array',
      editor: 'json',
    },
    {
      name: 'currentStep',
      title: '当前步骤',
      type: 'number',
      editor: 'number',
    },
  ],
  events: [
    { name: 'onStepClick', title: '步骤点击', description: '点击步骤时触发' },
  ],
};

// 3. 注册组件
const registry = new ComponentRegistry();
registry.register('approval-flow', CustomApprovalFlow, CustomApprovalFlowSchema);
```

### 7.3 组件继承扩展

```typescript
/**
 * 通过继承扩展现有组件
 */

// 扩展 Input 组件，添加手机号验证
const PhoneInput = defineComponent({
  name: 'ABPhoneInput',
  extends: ABInput,
  props: {
    ...ABInput.props,
    // 新增属性
    countryCode: { type: String, default: '+86' },
    showCountryCode: { type: Boolean, default: true },
  },
  setup(props, ctx) {
    // 调用父组件 setup
    const parentSetup = ABInput.setup?.(props, ctx);

    // 添加手机号验证
    const validatePhone = (value: string) => {
      const phoneRegex = /^1[3-9]\d{9}$/;
      return phoneRegex.test(value);
    };

    // 扩展 onChange 事件
    const handleChange = (value: string) => {
      if (value && !validatePhone(value)) {
        // 显示错误提示
      }
      parentSetup?.handleChange?.(value);
    };

    return {
      ...parentSetup,
      handleChange,
      validatePhone,
    };
  },
});
```

---

## 8. 组件开发规范

### 8.1 目录结构规范

```
components/
├── form/                           # 表单组件
│   ├── Input/
│   │   ├── index.ts               # 导出入口
│   │   ├── Input.vue              # 组件实现
│   │   ├── Input.schema.ts        # 组件 Schema
│   │   ├── types.ts               # 类型定义
│   │   └── __tests__/             # 测试文件
│   │       └── Input.spec.ts
│   ├── Select/
│   └── ...
│
├── data/                           # 数据组件
│   ├── Table/
│   └── ...
│
├── display/                        # 展示组件
├── action/                         # 操作组件
├── feedback/                       # 反馈组件
├── business/                       # 业务组件
│
└── index.ts                        # 统一导出
```

### 8.2 命名规范

| 类型 | 规范 | 示例 |
|-----|------|------|
| 组件名 | PascalCase，AB 前缀 | ABInput, ABTable |
| 文件名 | PascalCase | Input.vue, Table.vue |
| Props | camelCase | modelValue, placeholder |
| Events | on + PascalCase | onChange, onSelect |
| CSS 类名 | BEM 规范，ab- 前缀 | ab-input, ab-input__inner |

### 8.3 组件模板

```vue
<!-- 组件模板 -->
<template>
  <div :class="rootClass" :style="style">
    <!-- 组件内容 -->
    <slot />
  </div>
</template>

<script lang="ts">
import { defineComponent, computed, inject } from 'vue';
import type { PropType } from 'vue';
import type { RenderContext } from '@assembox/runtime';

export default defineComponent({
  name: 'ABComponentName',

  props: {
    // 必须的 nodeId
    nodeId: {
      type: String,
      required: true,
    },
    // 组件值
    value: {
      type: [String, Number, Object, Array] as PropType<any>,
      default: undefined,
    },
    // 禁用状态
    disabled: {
      type: Boolean,
      default: false,
    },
    // 尺寸
    size: {
      type: String as PropType<'large' | 'default' | 'small'>,
      default: 'default',
    },
    // 其他属性...
  },

  emits: ['update:value', 'change', 'click', 'focus', 'blur'],

  setup(props, { emit, slots }) {
    // 注入渲染上下文
    const context = inject<RenderContext>('renderContext');

    // 计算根类名
    const rootClass = computed(() => [
      'ab-component-name',
      `ab-component-name--${props.size}`,
      {
        'is-disabled': props.disabled,
      },
    ]);

    // 事件处理
    const handleChange = (value: any) => {
      emit('update:value', value);
      emit('change', value);
      context?.eventBus.emit('onChange', {
        nodeId: props.nodeId,
        value,
      });
    };

    return {
      rootClass,
      handleChange,
    };
  },
});
</script>

<style lang="scss">
.ab-component-name {
  // 样式定义

  &--large {
    // 大尺寸样式
  }

  &--small {
    // 小尺寸样式
  }

  &.is-disabled {
    // 禁用样式
  }
}
</style>
```

### 8.4 测试规范

```typescript
// Input.spec.ts
import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import ABInput from '../Input.vue';

describe('ABInput', () => {
  it('renders correctly', () => {
    const wrapper = mount(ABInput, {
      props: {
        nodeId: 'test-input',
        value: 'hello',
      },
    });
    expect(wrapper.find('.ab-input').exists()).toBe(true);
  });

  it('emits update:value on input', async () => {
    const wrapper = mount(ABInput, {
      props: {
        nodeId: 'test-input',
      },
    });

    await wrapper.find('input').setValue('test');
    expect(wrapper.emitted('update:value')).toBeTruthy();
    expect(wrapper.emitted('update:value')[0]).toEqual(['test']);
  });

  it('respects disabled prop', () => {
    const wrapper = mount(ABInput, {
      props: {
        nodeId: 'test-input',
        disabled: true,
      },
    });

    expect(wrapper.find('input').attributes('disabled')).toBeDefined();
  });

  it('shows placeholder', () => {
    const wrapper = mount(ABInput, {
      props: {
        nodeId: 'test-input',
        placeholder: '请输入',
      },
    });

    expect(wrapper.find('input').attributes('placeholder')).toBe('请输入');
  });
});
```

---
