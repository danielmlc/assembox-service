# PC端渲染器设计

> **状态**: 设计中
> **更新日期**: 2025-01-23

---

## 目录

1. [概述](#1-概述)
2. [渲染器架构](#2-渲染器架构)
3. [组件映射](#3-组件映射)
4. [布局系统](#4-布局系统)
5. [表单渲染](#5-表单渲染)
6. [表格渲染](#6-表格渲染)
7. [样式处理](#7-样式处理)
8. [与现有代码的关系](#8-与现有代码的关系)

---

## 1. 概述

### 1.1 PC端渲染器定位

PC 端渲染器（assembox-pc）基于 Element Plus 组件库，负责在桌面端渲染低代码配置。

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        PC端渲染器职责                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. 组件映射                                                                │
│     └── 将节点类型映射到 Element Plus 组件                                   │
│                                                                             │
│  2. 布局渲染                                                                │
│     └── 基于 Element Plus 的 Row/Col 实现响应式布局                          │
│                                                                             │
│  3. 表单处理                                                                │
│     └── 表单验证、提交、重置等表单相关逻辑                                    │
│                                                                             │
│  4. 表格处理                                                                │
│     └── 分页、排序、筛选、编辑等表格相关逻辑                                  │
│                                                                             │
│  5. 样式适配                                                                │
│     └── 处理配置中的样式，适配 Element Plus 样式体系                         │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 技术依赖

| 依赖 | 版本 | 用途 |
|-----|------|------|
| assembox-runtime | - | 核心运行时 |
| Vue | 3.4+ | 框架 |
| Element Plus | latest | UI 组件库 |
| @element-plus/icons-vue | latest | 图标库 |

---

## 2. 渲染器架构

### 2.1 整体架构

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        PC端渲染器架构                                        │
└─────────────────────────────────────────────────────────────────────────────┘

                    ┌─────────────────────┐
                    │   核心运行时         │
                    │ (assembox-runtime)  │
                    └──────────┬──────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        PCRenderer                                           │
│                                                                             │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐             │
│  │  组件注册中心    │  │  Props适配器    │  │  事件适配器      │             │
│  │ ComponentRegistry│  │  PropsAdapter  │  │  EventAdapter   │             │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘             │
│           │                    │                    │                       │
│           └────────────────────┼────────────────────┘                       │
│                                │                                            │
│                                ▼                                            │
│                    ┌─────────────────────┐                                  │
│                    │    渲染入口组件      │                                  │
│                    │   PCRenderView.vue  │                                  │
│                    └──────────┬──────────┘                                  │
│                               │                                             │
└───────────────────────────────┼─────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Element Plus 组件                                    │
│                                                                             │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐  │
│  │ ElForm  │ │ ElTable │ │ ElInput │ │ElSelect │ │ElButton │ │  ...    │  │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 渲染器接口

```typescript
/**
 * PC端渲染器接口
 */
interface IPCRenderer {
  /**
   * 初始化渲染器
   * @param options 配置选项
   */
  init(options: PCRendererOptions): void;

  /**
   * 注册组件
   * @param type 组件类型
   * @param component Vue组件
   */
  registerComponent(type: string, component: Component): void;

  /**
   * 批量注册组件
   * @param components 组件映射
   */
  registerComponents(components: Record<string, Component>): void;

  /**
   * 获取渲染入口组件
   */
  getRenderComponent(): Component;

  /**
   * 创建渲染上下文
   */
  createContext(config: PageConfig): RenderContext;
}

/**
 * 渲染器配置选项
 */
interface PCRendererOptions {
  // Element Plus 配置
  elementPlusConfig?: {
    size?: 'large' | 'default' | 'small';
    zIndex?: number;
    locale?: any;
  };

  // 自定义组件
  customComponents?: Record<string, Component>;

  // 全局 Props 默认值
  defaultProps?: Record<string, any>;

  // 主题配置
  theme?: ThemeConfig;
}
```

### 2.3 渲染入口组件

```vue
<!-- PCRenderView.vue -->
<template>
  <div class="ab-pc-render-view" :style="containerStyle">
    <component
      v-for="node in rootNodes"
      :key="node.nodeId"
      :is="resolveComponent(node)"
      v-bind="resolveProps(node)"
      v-on="resolveEvents(node)"
    >
      <template v-for="(slotNodes, slotName) in resolveSlots(node)" #[slotName]>
        <PCRenderView
          v-for="slotNode in slotNodes"
          :key="slotNode.nodeId"
          :node="slotNode"
          :context="context"
        />
      </template>
    </component>
  </div>
</template>

<script setup lang="ts">
import { computed, provide } from 'vue';
import { useRenderEngine } from '@assembox/runtime';

const props = defineProps<{
  node?: IBaseNode;
  nodes?: IBaseNode[];
  context: RenderContext;
}>();

const { resolveComponent, resolveProps, resolveEvents, resolveSlots } = useRenderEngine();

const rootNodes = computed(() => {
  if (props.node) return [props.node];
  return props.nodes || [];
});

// 提供上下文给子组件
provide('renderContext', props.context);
</script>
```

---

## 3. 组件映射

### 3.1 组件映射表

```typescript
/**
 * PC端组件映射表
 */
const pcComponentMap: Record<string, Component> = {
  // ========== 布局组件 ==========
  'layout-container': ABContainer,
  'layout-row': ABRow,
  'layout-col': ABCol,
  'layout-card': ABCard,
  'layout-tabs': ABTabs,
  'layout-collapse': ABCollapse,

  // ========== 表单组件 ==========
  'form': ABForm,
  'form-item': ABFormItem,
  'input': ABInput,
  'input-number': ABInputNumber,
  'select': ABSelect,
  'cascader': ABCascader,
  'date-picker': ABDatePicker,
  'time-picker': ABTimePicker,
  'date-range-picker': ABDateRangePicker,
  'switch': ABSwitch,
  'checkbox': ABCheckbox,
  'checkbox-group': ABCheckboxGroup,
  'radio': ABRadio,
  'radio-group': ABRadioGroup,
  'textarea': ABTextarea,
  'upload': ABUpload,

  // ========== 表格组件 ==========
  'table': ABTable,
  'table-column': ABTableColumn,
  'table-edit': ABTableEdit,
  'pagination': ABPagination,

  // ========== 展示组件 ==========
  'label': ABLabel,
  'text': ABText,
  'image': ABImage,
  'tag': ABTag,
  'badge': ABBadge,
  'statistic': ABStatistic,
  'descriptions': ABDescriptions,
  'tree': ABTree,

  // ========== 操作组件 ==========
  'button': ABButton,
  'button-group': ABButtonGroup,
  'dropdown': ABDropdown,
  'popconfirm': ABPopconfirm,

  // ========== 反馈组件 ==========
  'dialog': ABDialog,
  'drawer': ABDrawer,
  'popover': ABPopover,
  'tooltip': ABTooltip,

  // ========== 业务组件 ==========
  'dict-select': ABDictSelect,
  'dict-cascader': ABDictCascader,
  'org-tree': ABOrgTree,
  'user-select': ABUserSelect,
  'file-upload': ABFileUpload,
  'rich-editor': ABRichEditor,
  'signature': ABSignature,
};
```

### 3.2 组件包装器设计

为了统一处理低代码配置和 Element Plus 组件之间的差异，使用包装器模式。

```typescript
/**
 * 组件包装器基类
 */
abstract class BaseComponentWrapper {
  /**
   * 转换 Props
   */
  abstract transformProps(nodeProps: Record<string, any>): Record<string, any>;

  /**
   * 转换事件
   */
  abstract transformEvents(nodeEvents: Record<string, EventConfig>): Record<string, Function>;

  /**
   * 获取默认 Props
   */
  getDefaultProps(): Record<string, any> {
    return {};
  }
}
```

### 3.3 输入框组件示例

```vue
<!-- ABInput.vue -->
<template>
  <el-input
    v-model="modelValue"
    :placeholder="placeholder"
    :disabled="disabled"
    :readonly="readonly"
    :clearable="clearable"
    :show-password="showPassword"
    :maxlength="maxlength"
    :show-word-limit="showWordLimit"
    :prefix-icon="prefixIcon"
    :suffix-icon="suffixIcon"
    :size="size"
    :type="type"
    @input="handleInput"
    @change="handleChange"
    @focus="handleFocus"
    @blur="handleBlur"
    @clear="handleClear"
  >
    <template v-if="$slots.prefix" #prefix>
      <slot name="prefix" />
    </template>
    <template v-if="$slots.suffix" #suffix>
      <slot name="suffix" />
    </template>
    <template v-if="$slots.prepend" #prepend>
      <slot name="prepend" />
    </template>
    <template v-if="$slots.append" #append>
      <slot name="append" />
    </template>
  </el-input>
</template>

<script setup lang="ts">
import { computed, inject } from 'vue';
import { ElInput } from 'element-plus';
import type { RenderContext } from '@assembox/runtime';

const props = withDefaults(defineProps<{
  nodeId: string;
  value?: string | number;
  placeholder?: string;
  disabled?: boolean;
  readonly?: boolean;
  clearable?: boolean;
  showPassword?: boolean;
  maxlength?: number;
  showWordLimit?: boolean;
  prefixIcon?: string;
  suffixIcon?: string;
  size?: 'large' | 'default' | 'small';
  type?: string;
}>(), {
  placeholder: '请输入',
  clearable: true,
  type: 'text',
});

const emit = defineEmits<{
  (e: 'update:value', value: string | number): void;
  (e: 'input', value: string | number): void;
  (e: 'change', value: string | number): void;
  (e: 'focus', event: FocusEvent): void;
  (e: 'blur', event: FocusEvent): void;
  (e: 'clear'): void;
}>();

const context = inject<RenderContext>('renderContext');

const modelValue = computed({
  get: () => props.value,
  set: (val) => emit('update:value', val),
});

const handleInput = (value: string | number) => {
  emit('input', value);
  context?.eventBus.emit('onInput', { nodeId: props.nodeId, value });
};

const handleChange = (value: string | number) => {
  emit('change', value);
  context?.eventBus.emit('onChange', { nodeId: props.nodeId, value });
};

const handleFocus = (event: FocusEvent) => {
  emit('focus', event);
  context?.eventBus.emit('onFocus', { nodeId: props.nodeId });
};

const handleBlur = (event: FocusEvent) => {
  emit('blur', event);
  context?.eventBus.emit('onBlur', { nodeId: props.nodeId });
};

const handleClear = () => {
  emit('clear');
  context?.eventBus.emit('onClear', { nodeId: props.nodeId });
};
</script>
```

---

## 4. 布局系统

### 4.1 布局类型

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        PC端布局类型                                          │
└─────────────────────────────────────────────────────────────────────────────┘

1. 栅格布局 (Grid Layout)
   ┌──────────────────────────────────────────────────────────────┐
   │ Row                                                          │
   │ ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐ │
   │ │ Col (6)    │ │ Col (6)    │ │ Col (6)    │ │ Col (6)    │ │
   │ └────────────┘ └────────────┘ └────────────┘ └────────────┘ │
   └──────────────────────────────────────────────────────────────┘

2. 弹性布局 (Flex Layout)
   ┌──────────────────────────────────────────────────────────────┐
   │ Container (flex)                                             │
   │ ┌─────────────────────┐ ┌─────────────────────────────────┐ │
   │ │ Item (flex: 0)      │ │ Item (flex: 1)                  │ │
   │ └─────────────────────┘ └─────────────────────────────────┘ │
   └──────────────────────────────────────────────────────────────┘

3. 卡片布局 (Card Layout)
   ┌──────────────────────────────────────────────────────────────┐
   │ Card                                                         │
   │ ┌──────────────────────────────────────────────────────────┐ │
   │ │ Header                                                   │ │
   │ ├──────────────────────────────────────────────────────────┤ │
   │ │ Body                                                     │ │
   │ │                                                          │ │
   │ └──────────────────────────────────────────────────────────┘ │
   └──────────────────────────────────────────────────────────────┘

4. 标签页布局 (Tabs Layout)
   ┌──────────────────────────────────────────────────────────────┐
   │ ┌────────┐ ┌────────┐ ┌────────┐                            │
   │ │ Tab 1  │ │ Tab 2  │ │ Tab 3  │                            │
   │ └────────┴─┴────────┴─┴────────┘────────────────────────────┤
   │ │ Tab Content                                               │ │
   │ │                                                          │ │
   │ └──────────────────────────────────────────────────────────┘ │
   └──────────────────────────────────────────────────────────────┘
```

### 4.2 布局配置示例

```json
{
  "__nodeType": "layout",
  "componentType": "layout-row",
  "__nodeOptions": {
    "gutter": 20,
    "justify": "start",
    "align": "top"
  },
  "children": [
    {
      "__nodeType": "layout",
      "componentType": "layout-col",
      "__nodeOptions": {
        "span": 12,
        "xs": 24,
        "sm": 12,
        "md": 8
      },
      "children": [...]
    },
    {
      "__nodeType": "layout",
      "componentType": "layout-col",
      "__nodeOptions": {
        "span": 12,
        "xs": 24,
        "sm": 12,
        "md": 16
      },
      "children": [...]
    }
  ]
}
```

### 4.3 栅格组件实现

```vue
<!-- ABRow.vue -->
<template>
  <el-row
    :gutter="gutter"
    :justify="justify"
    :align="align"
    :tag="tag"
    :class="rowClass"
  >
    <slot />
  </el-row>
</template>

<script setup lang="ts">
import { ElRow } from 'element-plus';
import { computed } from 'vue';

const props = withDefaults(defineProps<{
  gutter?: number;
  justify?: 'start' | 'end' | 'center' | 'space-around' | 'space-between' | 'space-evenly';
  align?: 'top' | 'middle' | 'bottom';
  tag?: string;
  wrap?: boolean;
}>(), {
  gutter: 0,
  justify: 'start',
  align: 'top',
  tag: 'div',
  wrap: true,
});

const rowClass = computed(() => ({
  'ab-row': true,
  'ab-row--nowrap': !props.wrap,
}));
</script>

<!-- ABCol.vue -->
<template>
  <el-col
    :span="span"
    :offset="offset"
    :push="push"
    :pull="pull"
    :xs="xs"
    :sm="sm"
    :md="md"
    :lg="lg"
    :xl="xl"
    :tag="tag"
  >
    <slot />
  </el-col>
</template>

<script setup lang="ts">
import { ElCol } from 'element-plus';

type ColSize = number | { span?: number; offset?: number };

defineProps<{
  span?: number;
  offset?: number;
  push?: number;
  pull?: number;
  xs?: ColSize;
  sm?: ColSize;
  md?: ColSize;
  lg?: ColSize;
  xl?: ColSize;
  tag?: string;
}>();
</script>
```

---

## 5. 表单渲染

### 5.1 表单架构

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        表单渲染架构                                          │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                          ABForm                                             │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                      表单状态管理                                    │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                  │   │
│  │  │  表单数据    │  │  验证状态    │  │  提交状态    │                  │   │
│  │  │ formData    │  │ validation  │  │ submitting  │                  │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘                  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                      表单项渲染                                      │   │
│  │                                                                     │   │
│  │  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐           │   │
│  │  │  ABFormItem   │  │  ABFormItem   │  │  ABFormItem   │           │   │
│  │  │  ┌─────────┐  │  │  ┌─────────┐  │  │  ┌─────────┐  │           │   │
│  │  │  │ ABInput │  │  │  │ABSelect │  │  │  │ABDatePk │  │           │   │
│  │  │  └─────────┘  │  │  └─────────┘  │  │  └─────────┘  │           │   │
│  │  └───────────────┘  └───────────────┘  └───────────────┘           │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                      表单操作                                        │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                  │   │
│  │  │    提交     │  │    重置     │  │    取消     │                  │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘                  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 5.2 表单配置结构

```typescript
/**
 * 表单配置
 */
interface FormConfig {
  // 表单标识
  formId: string;

  // 表单布局
  layout: 'horizontal' | 'vertical' | 'inline';

  // 标签宽度
  labelWidth?: string | number;

  // 标签位置
  labelPosition?: 'left' | 'right' | 'top';

  // 尺寸
  size?: 'large' | 'default' | 'small';

  // 是否显示必填星号
  hideRequiredAsterisk?: boolean;

  // 是否显示验证错误信息
  showMessage?: boolean;

  // 是否在输入框中显示验证错误信息
  inlineMessage?: boolean;

  // 表单项配置
  items: FormItemConfig[];

  // 验证规则
  rules?: Record<string, ValidationRule[]>;

  // 数据绑定
  modelPath: string;
}

/**
 * 表单项配置
 */
interface FormItemConfig {
  // 字段名
  field: string;

  // 标签
  label: string;

  // 组件类型
  componentType: string;

  // 组件属性
  props?: Record<string, any>;

  // 栅格配置
  col?: ColConfig;

  // 是否必填
  required?: boolean;

  // 验证规则
  rules?: ValidationRule[];

  // 条件显示
  visible?: string | boolean;

  // 条件禁用
  disabled?: string | boolean;
}
```

### 5.3 表单组件实现

```vue
<!-- ABForm.vue -->
<template>
  <el-form
    ref="formRef"
    :model="formData"
    :rules="mergedRules"
    :label-width="labelWidth"
    :label-position="labelPosition"
    :size="size"
    :inline="layout === 'inline'"
    :hide-required-asterisk="hideRequiredAsterisk"
    :show-message="showMessage"
    :inline-message="inlineMessage"
    @submit.prevent="handleSubmit"
  >
    <el-row :gutter="gutter">
      <template v-for="item in visibleItems" :key="item.field">
        <el-col v-bind="item.col || defaultCol">
          <ABFormItem
            :config="item"
            :model-value="getFieldValue(item.field)"
            :disabled="isFieldDisabled(item)"
            @update:model-value="setFieldValue(item.field, $event)"
          />
        </el-col>
      </template>
    </el-row>

    <slot name="footer">
      <el-form-item v-if="showActions" class="ab-form-actions">
        <el-button type="primary" :loading="submitting" @click="handleSubmit">
          {{ submitText }}
        </el-button>
        <el-button @click="handleReset">
          {{ resetText }}
        </el-button>
        <el-button v-if="showCancel" @click="handleCancel">
          {{ cancelText }}
        </el-button>
      </el-form-item>
    </slot>
  </el-form>
</template>

<script setup lang="ts">
import { ref, computed, provide, inject, watch } from 'vue';
import { ElForm, ElRow, ElCol, ElFormItem, ElButton } from 'element-plus';
import type { FormInstance, FormRules } from 'element-plus';
import { useFormState } from '../composables/useForm';
import ABFormItem from './ABFormItem.vue';

const props = withDefaults(defineProps<{
  nodeId: string;
  config: FormConfig;
  modelPath?: string;
  layout?: 'horizontal' | 'vertical' | 'inline';
  labelWidth?: string | number;
  labelPosition?: 'left' | 'right' | 'top';
  size?: 'large' | 'default' | 'small';
  gutter?: number;
  showActions?: boolean;
  submitText?: string;
  resetText?: string;
  cancelText?: string;
  showCancel?: boolean;
}>(), {
  layout: 'horizontal',
  labelWidth: '100px',
  labelPosition: 'right',
  size: 'default',
  gutter: 20,
  showActions: true,
  submitText: '提交',
  resetText: '重置',
  cancelText: '取消',
  showCancel: false,
});

const emit = defineEmits<{
  (e: 'submit', data: any): void;
  (e: 'reset'): void;
  (e: 'cancel'): void;
  (e: 'validate', valid: boolean, fields?: any): void;
}>();

const context = inject('renderContext');
const formRef = ref<FormInstance>();

const {
  formData,
  submitting,
  getFieldValue,
  setFieldValue,
  validate,
  resetFields,
  clearValidate,
} = useFormState(props.config, context);

// 计算可见的表单项
const visibleItems = computed(() => {
  return props.config.items.filter(item => {
    if (typeof item.visible === 'boolean') return item.visible;
    if (typeof item.visible === 'string') {
      return context.exprEngine.evaluate(item.visible, { data: formData.value });
    }
    return true;
  });
});

// 合并验证规则
const mergedRules = computed<FormRules>(() => {
  const rules: FormRules = { ...props.config.rules };

  props.config.items.forEach(item => {
    if (item.required || item.rules) {
      const itemRules = [...(item.rules || [])];
      if (item.required) {
        itemRules.unshift({
          required: true,
          message: `${item.label}不能为空`,
          trigger: 'blur',
        });
      }
      rules[item.field] = itemRules;
    }
  });

  return rules;
});

// 判断字段是否禁用
const isFieldDisabled = (item: FormItemConfig): boolean => {
  if (typeof item.disabled === 'boolean') return item.disabled;
  if (typeof item.disabled === 'string') {
    return context.exprEngine.evaluate(item.disabled, { data: formData.value });
  }
  return false;
};

// 提交处理
const handleSubmit = async () => {
  const valid = await validate();
  emit('validate', valid);

  if (valid) {
    emit('submit', formData.value);
    context?.eventBus.emit('onFormSubmit', {
      nodeId: props.nodeId,
      data: formData.value,
    });
  }
};

// 重置处理
const handleReset = () => {
  resetFields();
  emit('reset');
  context?.eventBus.emit('onFormReset', { nodeId: props.nodeId });
};

// 取消处理
const handleCancel = () => {
  emit('cancel');
  context?.eventBus.emit('onFormCancel', { nodeId: props.nodeId });
};

// 暴露方法
defineExpose({
  validate,
  resetFields,
  clearValidate,
  getFormData: () => formData.value,
  setFormData: (data: any) => Object.assign(formData.value, data),
});

// 提供给子组件
provide('formContext', {
  formData,
  getFieldValue,
  setFieldValue,
  formRef,
});
</script>
```

### 5.4 表单项组件

```vue
<!-- ABFormItem.vue -->
<template>
  <el-form-item
    :label="config.label"
    :prop="config.field"
    :label-width="config.labelWidth"
    :required="config.required"
    :rules="config.rules"
  >
    <component
      :is="getComponent(config.componentType)"
      :node-id="`${parentNodeId}_${config.field}`"
      v-bind="config.props"
      :value="modelValue"
      :disabled="disabled"
      @update:value="$emit('update:modelValue', $event)"
    />
    <template v-if="config.tip" #tip>
      <span class="ab-form-item-tip">{{ config.tip }}</span>
    </template>
  </el-form-item>
</template>

<script setup lang="ts">
import { inject } from 'vue';
import { ElFormItem } from 'element-plus';
import { useComponentResolver } from '../composables/useComponentResolver';

const props = defineProps<{
  config: FormItemConfig;
  modelValue: any;
  disabled?: boolean;
}>();

defineEmits<{
  (e: 'update:modelValue', value: any): void;
}>();

const parentNodeId = inject('parentNodeId', 'form');
const { getComponent } = useComponentResolver();
</script>
```

---

## 6. 表格渲染

### 6.1 表格架构

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        表格渲染架构                                          │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                          ABTable                                            │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                      工具栏 (Toolbar)                                │   │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌───────────────────────────┐ │   │
│  │  │  新增   │ │  删除   │ │  导出   │ │        搜索框             │ │   │
│  │  └─────────┘ └─────────┘ └─────────┘ └───────────────────────────┘ │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                      表格主体 (Table Body)                           │   │
│  │  ┌─────┬─────────┬─────────┬─────────┬─────────┬─────────┐         │   │
│  │  │  □  │  列1    │  列2    │  列3    │  列4    │  操作   │         │   │
│  │  ├─────┼─────────┼─────────┼─────────┼─────────┼─────────┤         │   │
│  │  │  □  │  数据   │  数据   │  数据   │  数据   │ 编辑|删除│         │   │
│  │  ├─────┼─────────┼─────────┼─────────┼─────────┼─────────┤         │   │
│  │  │  □  │  数据   │  数据   │  数据   │  数据   │ 编辑|删除│         │   │
│  │  └─────┴─────────┴─────────┴─────────┴─────────┴─────────┘         │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                      分页器 (Pagination)                             │   │
│  │  共 100 条  ◀ 1 2 3 4 5 ... 10 ▶  每页 20 条                        │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 6.2 表格配置结构

```typescript
/**
 * 表格配置
 */
interface TableConfig {
  // 表格标识
  tableId: string;

  // 列配置
  columns: TableColumnConfig[];

  // 是否显示序号
  showIndex?: boolean;

  // 是否显示选择框
  showSelection?: boolean;

  // 是否显示边框
  border?: boolean;

  // 是否显示斑马纹
  stripe?: boolean;

  // 行唯一标识字段
  rowKey?: string;

  // 高度
  height?: string | number;

  // 最大高度
  maxHeight?: string | number;

  // 空数据文本
  emptyText?: string;

  // 是否显示工具栏
  showToolbar?: boolean;

  // 工具栏配置
  toolbar?: ToolbarConfig;

  // 分页配置
  pagination?: PaginationConfig;

  // 操作列配置
  actionColumn?: ActionColumnConfig;

  // 数据加载配置
  dataSource?: TableDataSourceConfig;
}

/**
 * 表格列配置
 */
interface TableColumnConfig {
  // 字段名
  field: string;

  // 列标题
  label: string;

  // 列宽度
  width?: string | number;

  // 最小宽度
  minWidth?: string | number;

  // 是否固定
  fixed?: 'left' | 'right' | boolean;

  // 对齐方式
  align?: 'left' | 'center' | 'right';

  // 是否可排序
  sortable?: boolean | 'custom';

  // 是否可筛选
  filterable?: boolean;

  // 格式化器
  formatter?: string | FormatterConfig;

  // 自定义渲染
  render?: string;

  // 是否显示溢出提示
  showOverflowTooltip?: boolean;

  // 是否可编辑
  editable?: boolean;

  // 编辑组件类型
  editComponent?: string;

  // 编辑组件属性
  editProps?: Record<string, any>;
}

/**
 * 分页配置
 */
interface PaginationConfig {
  // 是否显示
  show?: boolean;

  // 每页条数
  pageSize?: number;

  // 可选每页条数
  pageSizes?: number[];

  // 布局
  layout?: string;

  // 位置
  position?: 'left' | 'center' | 'right';
}
```

### 6.3 表格组件实现

```vue
<!-- ABTable.vue -->
<template>
  <div class="ab-table-container">
    <!-- 工具栏 -->
    <div v-if="showToolbar" class="ab-table-toolbar">
      <div class="ab-table-toolbar-left">
        <slot name="toolbar-left">
          <el-button
            v-if="toolbar?.showAdd"
            type="primary"
            :icon="Plus"
            @click="handleAdd"
          >
            新增
          </el-button>
          <el-button
            v-if="toolbar?.showDelete"
            type="danger"
            :icon="Delete"
            :disabled="!selectedRows.length"
            @click="handleBatchDelete"
          >
            删除
          </el-button>
          <el-button
            v-if="toolbar?.showExport"
            :icon="Download"
            @click="handleExport"
          >
            导出
          </el-button>
        </slot>
      </div>
      <div class="ab-table-toolbar-right">
        <slot name="toolbar-right">
          <el-input
            v-if="toolbar?.showSearch"
            v-model="searchKeyword"
            placeholder="搜索"
            clearable
            :prefix-icon="Search"
            style="width: 200px"
            @input="handleSearch"
          />
        </slot>
      </div>
    </div>

    <!-- 表格主体 -->
    <el-table
      ref="tableRef"
      v-loading="loading"
      :data="tableData"
      :border="border"
      :stripe="stripe"
      :row-key="rowKey"
      :height="height"
      :max-height="maxHeight"
      :empty-text="emptyText"
      :default-sort="defaultSort"
      @selection-change="handleSelectionChange"
      @sort-change="handleSortChange"
      @row-click="handleRowClick"
      @row-dblclick="handleRowDblClick"
    >
      <!-- 选择列 -->
      <el-table-column
        v-if="showSelection"
        type="selection"
        width="50"
        align="center"
        fixed="left"
      />

      <!-- 序号列 -->
      <el-table-column
        v-if="showIndex"
        type="index"
        label="序号"
        width="60"
        align="center"
        fixed="left"
      />

      <!-- 数据列 -->
      <template v-for="column in visibleColumns" :key="column.field">
        <ABTableColumn :config="column" :context="context" />
      </template>

      <!-- 操作列 -->
      <el-table-column
        v-if="actionColumn"
        label="操作"
        :width="actionColumn.width || 150"
        :fixed="actionColumn.fixed || 'right'"
        align="center"
      >
        <template #default="{ row, $index }">
          <template v-for="action in actionColumn.actions" :key="action.key">
            <el-button
              v-if="isActionVisible(action, row)"
              :type="action.type || 'primary'"
              link
              :disabled="isActionDisabled(action, row)"
              @click="handleAction(action, row, $index)"
            >
              {{ action.label }}
            </el-button>
          </template>
        </template>
      </el-table-column>
    </el-table>

    <!-- 分页器 -->
    <div v-if="pagination?.show !== false" class="ab-table-pagination">
      <el-pagination
        v-model:current-page="currentPage"
        v-model:page-size="pageSize"
        :page-sizes="pagination?.pageSizes || [10, 20, 50, 100]"
        :layout="pagination?.layout || 'total, sizes, prev, pager, next, jumper'"
        :total="total"
        @size-change="handleSizeChange"
        @current-change="handlePageChange"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, inject, watch, onMounted } from 'vue';
import { ElTable, ElTableColumn, ElPagination, ElButton, ElInput } from 'element-plus';
import { Plus, Delete, Download, Search } from '@element-plus/icons-vue';
import ABTableColumn from './ABTableColumn.vue';
import { useTableData } from '../composables/useTable';

const props = withDefaults(defineProps<{
  nodeId: string;
  config: TableConfig;
  data?: any[];
  loading?: boolean;
}>(), {
  border: true,
  stripe: true,
  showIndex: false,
  showSelection: false,
  showToolbar: true,
});

const emit = defineEmits<{
  (e: 'add'): void;
  (e: 'edit', row: any): void;
  (e: 'delete', row: any): void;
  (e: 'batch-delete', rows: any[]): void;
  (e: 'export'): void;
  (e: 'row-click', row: any): void;
  (e: 'selection-change', rows: any[]): void;
  (e: 'page-change', page: number, size: number): void;
  (e: 'sort-change', sort: { prop: string; order: string }): void;
}>();

const context = inject('renderContext');
const tableRef = ref();

const {
  tableData,
  total,
  loading: dataLoading,
  currentPage,
  pageSize,
  selectedRows,
  loadData,
  refresh,
} = useTableData(props.config, context);

// 计算可见列
const visibleColumns = computed(() => {
  return props.config.columns.filter(col => col.visible !== false);
});

// 选择变化
const handleSelectionChange = (rows: any[]) => {
  selectedRows.value = rows;
  emit('selection-change', rows);
  context?.eventBus.emit('onSelectionChange', {
    nodeId: props.nodeId,
    rows,
  });
};

// 排序变化
const handleSortChange = (sort: { prop: string; order: string }) => {
  emit('sort-change', sort);
  context?.eventBus.emit('onSortChange', {
    nodeId: props.nodeId,
    sort,
  });
};

// 分页变化
const handlePageChange = (page: number) => {
  emit('page-change', page, pageSize.value);
  loadData();
};

const handleSizeChange = (size: number) => {
  emit('page-change', currentPage.value, size);
  loadData();
};

// 操作处理
const handleAdd = () => {
  emit('add');
  context?.eventBus.emit('onTableAdd', { nodeId: props.nodeId });
};

const handleAction = (action: any, row: any, index: number) => {
  emit(action.event || action.key, row);
  context?.eventBus.emit(`onTableAction:${action.key}`, {
    nodeId: props.nodeId,
    row,
    index,
  });
};

// 暴露方法
defineExpose({
  refresh,
  getSelectedRows: () => selectedRows.value,
  clearSelection: () => tableRef.value?.clearSelection(),
});

onMounted(() => {
  if (props.config.dataSource?.autoLoad !== false) {
    loadData();
  }
});
</script>
```

---

## 7. 样式处理

### 7.1 样式转换

```typescript
/**
 * 节点样式到 CSS 样式的转换
 */
class StyleTransformer {
  /**
   * 转换节点样式为 CSS 对象
   */
  transform(nodeStyle: NodeStyle): CSSProperties {
    const cssStyle: CSSProperties = {};

    // 尺寸
    if (nodeStyle.width) cssStyle.width = this.normalizeSize(nodeStyle.width);
    if (nodeStyle.height) cssStyle.height = this.normalizeSize(nodeStyle.height);

    // 边距
    if (nodeStyle.marginTop) cssStyle.marginTop = nodeStyle.marginTop;
    if (nodeStyle.marginRight) cssStyle.marginRight = nodeStyle.marginRight;
    if (nodeStyle.marginBottom) cssStyle.marginBottom = nodeStyle.marginBottom;
    if (nodeStyle.marginLeft) cssStyle.marginLeft = nodeStyle.marginLeft;

    // 内边距
    if (nodeStyle.paddingTop) cssStyle.paddingTop = nodeStyle.paddingTop;
    if (nodeStyle.paddingRight) cssStyle.paddingRight = nodeStyle.paddingRight;
    if (nodeStyle.paddingBottom) cssStyle.paddingBottom = nodeStyle.paddingBottom;
    if (nodeStyle.paddingLeft) cssStyle.paddingLeft = nodeStyle.paddingLeft;

    // 字体
    if (nodeStyle.fontSize) cssStyle.fontSize = nodeStyle.fontSize;
    if (nodeStyle.fontWeight) cssStyle.fontWeight = nodeStyle.fontWeight;
    if (nodeStyle.fontFamily) cssStyle.fontFamily = nodeStyle.fontFamily;
    if (nodeStyle.lineHeight) cssStyle.lineHeight = nodeStyle.lineHeight;
    if (nodeStyle.color) cssStyle.color = nodeStyle.color;

    // 背景
    if (nodeStyle.backgroundColor) cssStyle.backgroundColor = nodeStyle.backgroundColor;

    // 边框
    if (nodeStyle.borderWidth) cssStyle.borderWidth = nodeStyle.borderWidth;
    if (nodeStyle.borderStyle) cssStyle.borderStyle = nodeStyle.borderStyle;
    if (nodeStyle.borderColor) cssStyle.borderColor = nodeStyle.borderColor;
    if (nodeStyle.borderRadius) cssStyle.borderRadius = nodeStyle.borderRadius;

    // 定位
    if (nodeStyle.position) cssStyle.position = nodeStyle.position;
    if (nodeStyle.top) cssStyle.top = nodeStyle.top;
    if (nodeStyle.right) cssStyle.right = `${nodeStyle.right}px`;
    if (nodeStyle.left) cssStyle.left = nodeStyle.left;
    if (nodeStyle.zIndex) cssStyle.zIndex = nodeStyle.zIndex;

    // 显示
    if (nodeStyle.display) cssStyle.display = nodeStyle.display;
    if (nodeStyle.float) cssStyle.float = nodeStyle.float;
    if (nodeStyle.clear) cssStyle.clear = nodeStyle.clear;

    return cssStyle;
  }

  private normalizeSize(value: string | number): string {
    if (typeof value === 'number') return `${value}px`;
    return value;
  }
}
```

### 7.2 主题配置

```typescript
/**
 * 主题配置
 */
interface ThemeConfig {
  // Element Plus 主题变量
  elementPlus?: {
    colorPrimary?: string;
    colorSuccess?: string;
    colorWarning?: string;
    colorDanger?: string;
    colorInfo?: string;
    borderRadius?: string;
    fontSize?: string;
  };

  // 自定义 CSS 变量
  cssVariables?: Record<string, string>;

  // 组件默认尺寸
  size?: 'large' | 'default' | 'small';
}

/**
 * 应用主题
 */
function applyTheme(theme: ThemeConfig): void {
  const root = document.documentElement;

  // 应用 Element Plus 主题变量
  if (theme.elementPlus) {
    const { colorPrimary, colorSuccess, colorWarning, colorDanger, colorInfo } = theme.elementPlus;

    if (colorPrimary) root.style.setProperty('--el-color-primary', colorPrimary);
    if (colorSuccess) root.style.setProperty('--el-color-success', colorSuccess);
    if (colorWarning) root.style.setProperty('--el-color-warning', colorWarning);
    if (colorDanger) root.style.setProperty('--el-color-danger', colorDanger);
    if (colorInfo) root.style.setProperty('--el-color-info', colorInfo);
  }

  // 应用自定义 CSS 变量
  if (theme.cssVariables) {
    Object.entries(theme.cssVariables).forEach(([key, value]) => {
      root.style.setProperty(key, value);
    });
  }
}
```

---

## 8. 与现有代码的关系

### 8.1 代码迁移映射

| 现有文件 | 新文件 | 说明 |
|---------|-------|------|
| assembox-desktop/src/ui-skeleton/index.ts | assembox-pc/src/index.ts | 入口重构 |
| assembox-desktop/src/ui-skeleton/render/ | assembox-pc/src/renderer/ | 渲染逻辑迁移 |
| assembox-desktop/src/props-type/element/ | assembox-pc/src/components/ | 组件迁移 |
| assembox-desktop/src/hook/ | assembox-pc/src/composables/ | Hook 迁移 |

### 8.2 组件复用计划

| 现有组件 | 复用策略 |
|---------|---------|
| 表单组件 (Input, Select 等) | 直接迁移，适配新接口 |
| 表格组件 (Table, TableEdit) | 重构渲染逻辑，保留核心功能 |
| 业务组件 (DictSelect, Upload 等) | 直接迁移 |
| 布局组件 | 重构，简化实现 |

### 8.3 接口适配

```typescript
/**
 * 旧接口到新接口的适配器
 */
class LegacyPropsAdapter {
  /**
   * 转换旧版组件配置到新版
   */
  adapt(legacyProps: LegacyComponentProps): ComponentProps {
    return {
      nodeId: legacyProps.__nodeId,
      nodeName: legacyProps.__nodeName,
      nodeType: this.mapNodeType(legacyProps.__nodeType),
      props: legacyProps.__nodeOptions,
      style: legacyProps.__nodeStyle,
      events: this.adaptEvents(legacyProps.__nodeEvent),
      bindings: this.extractBindings(legacyProps),
    };
  }

  private mapNodeType(legacyType: string): string {
    const typeMap: Record<string, string> = {
      'baseNode': 'display',
      'renderNode': 'form',
      'layoutNode': 'layout',
      'columnNode': 'table-column',
    };
    return typeMap[legacyType] || legacyType;
  }

  private adaptEvents(legacyEvents: Record<string, any>): Record<string, EventConfig> {
    const events: Record<string, EventConfig> = {};

    Object.entries(legacyEvents || {}).forEach(([eventName, config]) => {
      events[eventName] = {
        isOn: config.isOn,
        type: config.type === 'system' ? 'system' : 'custom',
        handler: config.fn,
      };
    });

    return events;
  }
}
```

---
