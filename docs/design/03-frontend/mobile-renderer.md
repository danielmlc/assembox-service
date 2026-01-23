# 移动端渲染器设计

> **状态**: 设计中
> **更新日期**: 2025-01-23

---

## 目录

1. [概述](#1-概述)
2. [渲染器架构](#2-渲染器架构)
3. [组件映射](#3-组件映射)
4. [移动端布局](#4-移动端布局)
5. [表单渲染](#5-表单渲染)
6. [列表渲染](#6-列表渲染)
7. [移动端适配](#7-移动端适配)
8. [与现有代码的关系](#8-与现有代码的关系)

---

## 1. 概述

### 1.1 移动端渲染器定位

移动端渲染器（assembox-mobile）基于 NutUI 组件库，负责在移动端（H5、小程序）渲染低代码配置。

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        移动端渲染器职责                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. 组件映射                                                                │
│     └── 将节点类型映射到 NutUI 移动端组件                                    │
│                                                                             │
│  2. 移动端布局                                                              │
│     └── 适配移动端的布局方式（单列、Cell布局）                                │
│                                                                             │
│  3. 表单处理                                                                │
│     └── 移动端表单交互（Picker、ActionSheet等）                              │
│                                                                             │
│  4. 列表处理                                                                │
│     └── 虚拟滚动、下拉刷新、上拉加载                                         │
│                                                                             │
│  5. 手势交互                                                                │
│     └── 滑动、长按等移动端特有交互                                           │
│                                                                             │
│  6. 适配处理                                                                │
│     └── 多端适配（H5、微信小程序、支付宝小程序等）                            │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 技术依赖

| 依赖 | 版本 | 用途 |
|-----|------|------|
| assembox-runtime | - | 核心运行时 |
| Vue | 3.4+ | 框架 |
| NutUI | 4.x | 移动端组件库 |
| @nutui/icons-vue | latest | 图标库 |

### 1.3 支持的端

| 端 | 支持方式 | 说明 |
|---|---------|------|
| H5 | 原生支持 | 直接运行在移动端浏览器 |
| 微信小程序 | Taro 转换 | 通过 Taro 框架转换 |
| 支付宝小程序 | Taro 转换 | 通过 Taro 框架转换 |
| App | WebView | 通过 WebView 嵌入 |

---

## 2. 渲染器架构

### 2.1 整体架构

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        移动端渲染器架构                                      │
└─────────────────────────────────────────────────────────────────────────────┘

                    ┌─────────────────────┐
                    │   核心运行时         │
                    │ (assembox-runtime)  │
                    └──────────┬──────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      MobileRenderer                                         │
│                                                                             │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐             │
│  │  组件注册中心    │  │  Props适配器    │  │  手势处理器      │             │
│  │ComponentRegistry│  │  PropsAdapter  │  │ GestureHandler  │             │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘             │
│           │                    │                    │                       │
│           └────────────────────┼────────────────────┘                       │
│                                │                                            │
│                                ▼                                            │
│                    ┌─────────────────────┐                                  │
│                    │    渲染入口组件      │                                  │
│                    │ MobileRenderView.vue│                                  │
│                    └──────────┬──────────┘                                  │
│                               │                                             │
└───────────────────────────────┼─────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         NutUI 组件                                          │
│                                                                             │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐  │
│  │  Form   │ │  Cell   │ │  Input  │ │ Picker  │ │ Button  │ │  ...    │  │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 渲染器接口

```typescript
/**
 * 移动端渲染器接口
 */
interface IMobileRenderer {
  /**
   * 初始化渲染器
   * @param options 配置选项
   */
  init(options: MobileRendererOptions): void;

  /**
   * 注册组件
   */
  registerComponent(type: string, component: Component): void;

  /**
   * 批量注册组件
   */
  registerComponents(components: Record<string, Component>): void;

  /**
   * 获取渲染入口组件
   */
  getRenderComponent(): Component;

  /**
   * 设置适配模式
   */
  setAdaptMode(mode: AdaptMode): void;
}

/**
 * 移动端渲染器配置
 */
interface MobileRendererOptions {
  // NutUI 配置
  nutUIConfig?: {
    theme?: 'default' | 'dark';
    locale?: any;
  };

  // 自定义组件
  customComponents?: Record<string, Component>;

  // 适配模式
  adaptMode?: AdaptMode;

  // 设计稿宽度（用于 rem 适配）
  designWidth?: number;

  // 主题配置
  theme?: MobileThemeConfig;
}

/**
 * 适配模式
 */
type AdaptMode = 'h5' | 'weapp' | 'alipay' | 'native';
```

### 2.3 渲染入口组件

```vue
<!-- MobileRenderView.vue -->
<template>
  <div class="ab-mobile-render-view">
    <component
      v-for="node in rootNodes"
      :key="node.nodeId"
      :is="resolveComponent(node)"
      v-bind="resolveProps(node)"
      v-on="resolveEvents(node)"
    >
      <template v-for="(slotNodes, slotName) in resolveSlots(node)" #[slotName]>
        <MobileRenderView
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

provide('renderContext', props.context);
provide('platform', 'mobile');
</script>

<style lang="scss">
.ab-mobile-render-view {
  min-height: 100vh;
  background-color: var(--ab-mobile-bg-color, #f5f5f5);
}
</style>
```

---

## 3. 组件映射

### 3.1 组件映射表

```typescript
/**
 * 移动端组件映射表
 */
const mobileComponentMap: Record<string, Component> = {
  // ========== 布局组件 ==========
  'layout-page': ABPage,
  'layout-cell': ABCell,
  'layout-cell-group': ABCellGroup,
  'layout-grid': ABGrid,
  'layout-grid-item': ABGridItem,
  'layout-divider': ABDivider,

  // ========== 表单组件 ==========
  'form': ABForm,
  'form-item': ABFormItem,
  'input': ABInput,
  'textarea': ABTextarea,
  'input-number': ABInputNumber,
  'picker': ABPicker,
  'date-picker': ABDatePicker,
  'calendar': ABCalendar,
  'cascader': ABCascader,
  'switch': ABSwitch,
  'checkbox': ABCheckbox,
  'checkbox-group': ABCheckboxGroup,
  'radio': ABRadio,
  'radio-group': ABRadioGroup,
  'rate': ABRate,
  'uploader': ABUploader,
  'signature': ABSignature,

  // ========== 列表组件 ==========
  'list': ABList,
  'list-item': ABListItem,
  'pull-refresh': ABPullRefresh,
  'infinite-loading': ABInfiniteLoading,
  'swipe': ABSwipe,

  // ========== 展示组件 ==========
  'text': ABText,
  'image': ABImage,
  'avatar': ABAvatar,
  'tag': ABTag,
  'badge': ABBadge,
  'ellipsis': ABEllipsis,
  'image-preview': ABImagePreview,
  'empty': ABEmpty,

  // ========== 操作组件 ==========
  'button': ABButton,
  'action-sheet': ABActionSheet,
  'popover': ABPopover,
  'menu': ABMenu,

  // ========== 反馈组件 ==========
  'dialog': ABDialog,
  'popup': ABPopup,
  'toast': ABToast,
  'notify': ABNotify,

  // ========== 导航组件 ==========
  'navbar': ABNavbar,
  'tabbar': ABTabbar,
  'tabs': ABTabs,
  'steps': ABSteps,

  // ========== 业务组件 ==========
  'dict-picker': ABDictPicker,
  'dict-cascader': ABDictCascader,
  'address-picker': ABAddressPicker,
  'team-picker': ABTeamPicker,
};
```

### 3.2 PC 到移动端组件映射

当同一配置需要在 PC 和移动端渲染时，需要进行组件映射。

```typescript
/**
 * PC组件到移动端组件的映射
 */
const pcToMobileMap: Record<string, string> = {
  // 表单组件
  'select': 'picker',
  'date-picker': 'date-picker',
  'date-range-picker': 'date-range-picker',
  'upload': 'uploader',

  // 布局组件
  'layout-container': 'layout-page',
  'layout-row': 'layout-cell-group',
  'layout-col': 'layout-cell',
  'layout-card': 'layout-cell-group',

  // 表格 -> 列表
  'table': 'list',
  'table-column': 'list-item',

  // 反馈组件
  'dialog': 'dialog',
  'drawer': 'popup',
  'dropdown': 'action-sheet',
};

/**
 * 组件类型转换器
 */
class ComponentTypeConverter {
  convert(pcType: string, platform: 'mobile' | 'pc'): string {
    if (platform === 'mobile' && pcToMobileMap[pcType]) {
      return pcToMobileMap[pcType];
    }
    return pcType;
  }
}
```

### 3.3 输入框组件示例

```vue
<!-- ABInput.vue (Mobile) -->
<template>
  <nut-input
    v-model="modelValue"
    :type="type"
    :placeholder="placeholder"
    :disabled="disabled"
    :readonly="readonly"
    :clearable="clearable"
    :show-word-limit="showWordLimit"
    :max-length="maxLength"
    :input-align="inputAlign"
    :left-icon="leftIcon"
    :right-icon="rightIcon"
    @input="handleInput"
    @focus="handleFocus"
    @blur="handleBlur"
    @clear="handleClear"
    @click-input="handleClick"
  >
    <template v-if="$slots.left" #left>
      <slot name="left" />
    </template>
    <template v-if="$slots.right" #right>
      <slot name="right" />
    </template>
  </nut-input>
</template>

<script setup lang="ts">
import { computed, inject } from 'vue';
import type { RenderContext } from '@assembox/runtime';

const props = withDefaults(defineProps<{
  nodeId: string;
  value?: string | number;
  type?: 'text' | 'password' | 'number' | 'digit' | 'tel';
  placeholder?: string;
  disabled?: boolean;
  readonly?: boolean;
  clearable?: boolean;
  showWordLimit?: boolean;
  maxLength?: number;
  inputAlign?: 'left' | 'center' | 'right';
  leftIcon?: string;
  rightIcon?: string;
}>(), {
  type: 'text',
  placeholder: '请输入',
  clearable: true,
  inputAlign: 'left',
});

const emit = defineEmits<{
  (e: 'update:value', value: string | number): void;
  (e: 'input', value: string | number): void;
  (e: 'focus', event: Event): void;
  (e: 'blur', event: Event): void;
  (e: 'clear'): void;
  (e: 'click'): void;
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

const handleFocus = (event: Event) => {
  emit('focus', event);
  context?.eventBus.emit('onFocus', { nodeId: props.nodeId });
};

const handleBlur = (event: Event) => {
  emit('blur', event);
  context?.eventBus.emit('onBlur', { nodeId: props.nodeId });
};

const handleClear = () => {
  emit('clear');
  context?.eventBus.emit('onClear', { nodeId: props.nodeId });
};

const handleClick = () => {
  emit('click');
  context?.eventBus.emit('onClick', { nodeId: props.nodeId });
};
</script>
```

---

## 4. 移动端布局

### 4.1 布局类型

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        移动端布局类型                                        │
└─────────────────────────────────────────────────────────────────────────────┘

1. 单元格布局 (Cell Layout) - 最常用
   ┌─────────────────────────────────────────┐
   │ Cell Group                              │
   │ ┌─────────────────────────────────────┐ │
   │ │ Cell: Label          Value        > │ │
   │ ├─────────────────────────────────────┤ │
   │ │ Cell: Label          Value        > │ │
   │ ├─────────────────────────────────────┤ │
   │ │ Cell: Label          Value        > │ │
   │ └─────────────────────────────────────┘ │
   └─────────────────────────────────────────┘

2. 宫格布局 (Grid Layout)
   ┌─────────────────────────────────────────┐
   │ ┌─────────┐ ┌─────────┐ ┌─────────┐   │
   │ │  图标1  │ │  图标2  │ │  图标3  │   │
   │ │  文字1  │ │  文字2  │ │  文字3  │   │
   │ └─────────┘ └─────────┘ └─────────┘   │
   │ ┌─────────┐ ┌─────────┐ ┌─────────┐   │
   │ │  图标4  │ │  图标5  │ │  图标6  │   │
   │ │  文字4  │ │  文字5  │ │  文字6  │   │
   │ └─────────┘ └─────────┘ └─────────┘   │
   └─────────────────────────────────────────┘

3. 卡片布局 (Card Layout)
   ┌─────────────────────────────────────────┐
   │ ┌─────────────────────────────────────┐ │
   │ │ Card Header                         │ │
   │ ├─────────────────────────────────────┤ │
   │ │ Card Body                           │ │
   │ │                                     │ │
   │ └─────────────────────────────────────┘ │
   │                                         │
   │ ┌─────────────────────────────────────┐ │
   │ │ Card Header                         │ │
   │ ├─────────────────────────────────────┤ │
   │ │ Card Body                           │ │
   │ └─────────────────────────────────────┘ │
   └─────────────────────────────────────────┘

4. 分组布局
   ┌─────────────────────────────────────────┐
   │ 分组标题 1                              │
   │ ┌─────────────────────────────────────┐ │
   │ │ Cell                                │ │
   │ │ Cell                                │ │
   │ └─────────────────────────────────────┘ │
   │                                         │
   │ 分组标题 2                              │
   │ ┌─────────────────────────────────────┐ │
   │ │ Cell                                │ │
   │ └─────────────────────────────────────┘ │
   └─────────────────────────────────────────┘
```

### 4.2 布局配置示例

```json
{
  "__nodeType": "layout",
  "componentType": "layout-page",
  "__nodeOptions": {
    "title": "订单详情",
    "showNavbar": true,
    "safeArea": true
  },
  "children": [
    {
      "__nodeType": "layout",
      "componentType": "layout-cell-group",
      "__nodeOptions": {
        "title": "基本信息",
        "inset": true
      },
      "children": [
        {
          "__nodeType": "form",
          "componentType": "form-item",
          "__nodeOptions": {
            "label": "订单号",
            "field": "orderNo"
          },
          "children": [
            {
              "__nodeType": "display",
              "componentType": "text",
              "__nodeOptions": {
                "binding": "${form.orderNo}"
              }
            }
          ]
        }
      ]
    }
  ]
}
```

### 4.3 页面布局组件

```vue
<!-- ABPage.vue -->
<template>
  <div class="ab-page" :class="{ 'ab-page--safe-area': safeArea }">
    <!-- 导航栏 -->
    <nut-navbar
      v-if="showNavbar"
      :title="title"
      :left-show="showBack"
      :safe-area-inset-top="safeAreaInsetTop"
      @on-click-back="handleBack"
    >
      <template v-if="$slots['navbar-left']" #left>
        <slot name="navbar-left" />
      </template>
      <template v-if="$slots['navbar-right']" #right>
        <slot name="navbar-right" />
      </template>
    </nut-navbar>

    <!-- 页面内容 -->
    <div class="ab-page-content" :style="contentStyle">
      <nut-pull-refresh
        v-if="pullRefresh"
        v-model="refreshing"
        @refresh="handleRefresh"
      >
        <slot />
      </nut-pull-refresh>
      <template v-else>
        <slot />
      </template>
    </div>

    <!-- 底部安全区 -->
    <div v-if="safeArea" class="ab-page-safe-bottom" />

    <!-- 底部操作栏 -->
    <div v-if="$slots.footer" class="ab-page-footer">
      <slot name="footer" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, inject } from 'vue';

const props = withDefaults(defineProps<{
  nodeId: string;
  title?: string;
  showNavbar?: boolean;
  showBack?: boolean;
  safeArea?: boolean;
  safeAreaInsetTop?: boolean;
  pullRefresh?: boolean;
  backgroundColor?: string;
}>(), {
  showNavbar: true,
  showBack: true,
  safeArea: true,
  safeAreaInsetTop: true,
  pullRefresh: false,
  backgroundColor: '#f5f5f5',
});

const emit = defineEmits<{
  (e: 'back'): void;
  (e: 'refresh'): void;
}>();

const context = inject('renderContext');
const refreshing = ref(false);

const contentStyle = computed(() => ({
  backgroundColor: props.backgroundColor,
}));

const handleBack = () => {
  emit('back');
  context?.eventBus.emit('onBack', { nodeId: props.nodeId });
};

const handleRefresh = () => {
  emit('refresh');
  context?.eventBus.emit('onRefresh', { nodeId: props.nodeId });
};
</script>

<style lang="scss">
.ab-page {
  display: flex;
  flex-direction: column;
  min-height: 100vh;

  &--safe-area {
    padding-bottom: constant(safe-area-inset-bottom);
    padding-bottom: env(safe-area-inset-bottom);
  }
}

.ab-page-content {
  flex: 1;
  overflow-y: auto;
}

.ab-page-footer {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: #fff;
  padding-bottom: constant(safe-area-inset-bottom);
  padding-bottom: env(safe-area-inset-bottom);
}
</style>
```

---

## 5. 表单渲染

### 5.1 移动端表单架构

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        移动端表单架构                                        │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                           ABForm (Mobile)                                   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                      Cell Group (表单分组)                           │   │
│  │                                                                     │   │
│  │  ┌─────────────────────────────────────────────────────────────┐   │   │
│  │  │ Cell (表单项)                                                │   │   │
│  │  │ ┌───────────┐                        ┌───────────────────┐  │   │   │
│  │  │ │   Label   │                        │   Input/Picker    │  │   │   │
│  │  │ └───────────┘                        └───────────────────┘  │   │   │
│  │  └─────────────────────────────────────────────────────────────┘   │   │
│  │                                                                     │   │
│  │  ┌─────────────────────────────────────────────────────────────┐   │   │
│  │  │ Cell (点击选择类)                                            │   │   │
│  │  │ ┌───────────┐         ┌─────────────────┐  ┌─────┐         │   │   │
│  │  │ │   Label   │         │   显示值         │  │  >  │         │   │   │
│  │  │ └───────────┘         └─────────────────┘  └─────┘         │   │   │
│  │  └─────────────────────────────────────────────────────────────┘   │   │
│  │                                                                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                      提交按钮 (Fixed Bottom)                         │   │
│  │  ┌─────────────────────────────────────────────────────────────┐   │   │
│  │  │                        提  交                                │   │   │
│  │  └─────────────────────────────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 5.2 移动端表单组件

```vue
<!-- ABForm.vue (Mobile) -->
<template>
  <nut-form
    ref="formRef"
    :model-value="formData"
    @submit="handleSubmit"
  >
    <template v-for="group in formGroups" :key="group.title">
      <nut-cell-group :title="group.title" :inset="inset">
        <template v-for="item in group.items" :key="item.field">
          <ABFormItem
            v-if="isItemVisible(item)"
            :config="item"
            :model-value="getFieldValue(item.field)"
            :disabled="isFieldDisabled(item)"
            @update:model-value="setFieldValue(item.field, $event)"
            @click="handleItemClick(item)"
          />
        </template>
      </nut-cell-group>
    </template>

    <!-- 底部按钮 -->
    <div v-if="showActions" class="ab-form-actions">
      <nut-button
        type="primary"
        block
        :loading="submitting"
        @click="handleSubmit"
      >
        {{ submitText }}
      </nut-button>
    </div>
  </nut-form>

  <!-- Picker 弹出层 -->
  <nut-popup
    v-model:visible="pickerVisible"
    position="bottom"
    round
  >
    <component
      :is="currentPickerComponent"
      v-if="currentPickerConfig"
      v-bind="currentPickerConfig.props"
      @confirm="handlePickerConfirm"
      @cancel="pickerVisible = false"
    />
  </nut-popup>
</template>

<script setup lang="ts">
import { ref, computed, inject, provide } from 'vue';
import { useFormState } from '../composables/useForm';
import ABFormItem from './ABFormItem.vue';

const props = withDefaults(defineProps<{
  nodeId: string;
  config: MobileFormConfig;
  inset?: boolean;
  showActions?: boolean;
  submitText?: string;
}>(), {
  inset: true,
  showActions: true,
  submitText: '提交',
});

const emit = defineEmits<{
  (e: 'submit', data: any): void;
}>();

const context = inject('renderContext');
const formRef = ref();

const {
  formData,
  submitting,
  getFieldValue,
  setFieldValue,
  validate,
} = useFormState(props.config, context);

// Picker 状态
const pickerVisible = ref(false);
const currentPickerConfig = ref<FormItemConfig | null>(null);
const currentPickerComponent = computed(() => {
  if (!currentPickerConfig.value) return null;
  const type = currentPickerConfig.value.componentType;
  return getPickerComponent(type);
});

// 表单分组
const formGroups = computed(() => {
  const groups: FormGroup[] = [];
  let currentGroup: FormGroup = { title: '', items: [] };

  props.config.items.forEach(item => {
    if (item.groupTitle && item.groupTitle !== currentGroup.title) {
      if (currentGroup.items.length > 0) {
        groups.push(currentGroup);
      }
      currentGroup = { title: item.groupTitle, items: [] };
    }
    currentGroup.items.push(item);
  });

  if (currentGroup.items.length > 0) {
    groups.push(currentGroup);
  }

  return groups;
});

// 处理需要弹出 Picker 的表单项点击
const handleItemClick = (item: FormItemConfig) => {
  const pickerTypes = ['picker', 'date-picker', 'cascader', 'dict-picker'];
  if (pickerTypes.includes(item.componentType)) {
    currentPickerConfig.value = item;
    pickerVisible.value = true;
  }
};

// Picker 确认
const handlePickerConfirm = (value: any) => {
  if (currentPickerConfig.value) {
    setFieldValue(currentPickerConfig.value.field, value);
  }
  pickerVisible.value = false;
};

// 提交
const handleSubmit = async () => {
  const valid = await validate();
  if (valid) {
    emit('submit', formData.value);
    context?.eventBus.emit('onFormSubmit', {
      nodeId: props.nodeId,
      data: formData.value,
    });
  }
};

// 提供给子组件
provide('formContext', {
  formData,
  getFieldValue,
  setFieldValue,
});
</script>

<style lang="scss">
.ab-form-actions {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 12px 16px;
  background: #fff;
  padding-bottom: calc(12px + constant(safe-area-inset-bottom));
  padding-bottom: calc(12px + env(safe-area-inset-bottom));
}
</style>
```

### 5.3 移动端表单项

```vue
<!-- ABFormItem.vue (Mobile) -->
<template>
  <nut-cell
    :title="config.label"
    :is-link="isLinkType"
    :center="true"
    @click="handleClick"
  >
    <template #desc>
      <span v-if="config.required" class="ab-form-item-required">*</span>
    </template>

    <!-- 输入类组件直接渲染 -->
    <template v-if="isInputType">
      <component
        :is="getComponent(config.componentType)"
        v-bind="config.props"
        :value="modelValue"
        :disabled="disabled"
        :placeholder="config.placeholder || `请输入${config.label}`"
        @update:value="$emit('update:modelValue', $event)"
      />
    </template>

    <!-- 选择类组件显示值 -->
    <template v-else-if="isLinkType">
      <span :class="['ab-form-item-value', { 'is-placeholder': !displayValue }]">
        {{ displayValue || config.placeholder || `请选择${config.label}` }}
      </span>
    </template>

    <!-- 开关类组件 -->
    <template v-else-if="isSwitchType">
      <nut-switch
        v-model="switchValue"
        :disabled="disabled"
      />
    </template>
  </nut-cell>
</template>

<script setup lang="ts">
import { computed, inject } from 'vue';

const props = defineProps<{
  config: FormItemConfig;
  modelValue: any;
  disabled?: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: any): void;
  (e: 'click'): void;
}>();

// 判断组件类型
const inputTypes = ['input', 'textarea', 'input-number'];
const linkTypes = ['picker', 'date-picker', 'cascader', 'dict-picker', 'address-picker'];
const switchTypes = ['switch'];

const isInputType = computed(() => inputTypes.includes(props.config.componentType));
const isLinkType = computed(() => linkTypes.includes(props.config.componentType));
const isSwitchType = computed(() => switchTypes.includes(props.config.componentType));

// 显示值
const displayValue = computed(() => {
  if (!props.modelValue) return '';

  // 根据组件类型格式化显示值
  const { componentType, props: componentProps } = props.config;

  if (componentType === 'date-picker') {
    return formatDate(props.modelValue, componentProps?.format || 'YYYY-MM-DD');
  }

  if (componentType === 'picker' || componentType === 'dict-picker') {
    // 从选项中查找显示文本
    const options = componentProps?.options || [];
    const option = options.find((opt: any) => opt.value === props.modelValue);
    return option?.label || props.modelValue;
  }

  return String(props.modelValue);
});

// Switch 值
const switchValue = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val),
});

const handleClick = () => {
  if (!props.disabled && isLinkType.value) {
    emit('click');
  }
};
</script>

<style lang="scss">
.ab-form-item-required {
  color: #fa2c19;
  margin-left: 4px;
}

.ab-form-item-value {
  color: #333;

  &.is-placeholder {
    color: #c0c4cc;
  }
}
</style>
```

---

## 6. 列表渲染

### 6.1 列表架构

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        移动端列表架构                                        │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                          ABList                                             │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                      下拉刷新区域                                    │   │
│  │                  ↓ 下拉刷新                                         │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  ┌─────────────────────────────────────────────────────────────┐   │   │
│  │  │ List Item                                                   │   │   │
│  │  │ ┌─────────┐ ┌─────────────────────────────┐ ┌─────────────┐│   │   │
│  │  │ │  头像   │ │ 标题                        │ │   右侧内容  ││   │   │
│  │  │ │         │ │ 描述                        │ │             ││   │   │
│  │  │ └─────────┘ └─────────────────────────────┘ └─────────────┘│   │   │
│  │  └─────────────────────────────────────────────────────────────┘   │   │
│  │  ┌─────────────────────────────────────────────────────────────┐   │   │
│  │  │ List Item (可滑动操作)                              ◀──────│   │   │
│  │  │                                                 [编辑][删除]│   │   │
│  │  └─────────────────────────────────────────────────────────────┘   │   │
│  │                                                                     │   │
│  │  ...                                                               │   │
│  │                                                                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                      上拉加载更多                                    │   │
│  │                  加载更多...                                        │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 6.2 列表组件实现

```vue
<!-- ABList.vue -->
<template>
  <div class="ab-list">
    <!-- 下拉刷新 -->
    <nut-pull-refresh
      v-model="refreshing"
      @refresh="handleRefresh"
    >
      <!-- 列表内容 -->
      <div v-if="listData.length > 0" class="ab-list-content">
        <template v-for="(item, index) in listData" :key="getItemKey(item, index)">
          <!-- 带滑动操作的列表项 -->
          <nut-swipe v-if="swipeActions" class="ab-list-item-swipe">
            <ABListItem
              :data="item"
              :config="itemConfig"
              :index="index"
              @click="handleItemClick(item, index)"
            />
            <template #right>
              <div class="ab-list-item-actions">
                <nut-button
                  v-for="action in swipeActions"
                  :key="action.key"
                  :type="action.type || 'primary'"
                  shape="square"
                  @click="handleAction(action, item, index)"
                >
                  {{ action.label }}
                </nut-button>
              </div>
            </template>
          </nut-swipe>

          <!-- 普通列表项 -->
          <ABListItem
            v-else
            :data="item"
            :config="itemConfig"
            :index="index"
            @click="handleItemClick(item, index)"
          />
        </template>
      </div>

      <!-- 空状态 -->
      <nut-empty v-else :description="emptyText" />

      <!-- 上拉加载更多 -->
      <nut-infiniteloading
        v-if="listData.length > 0"
        v-model="loading"
        :has-more="hasMore"
        :load-more-txt="loadMoreText"
        :load-txt="loadingText"
        :load-icon="loadingIcon"
        @load-more="handleLoadMore"
      />
    </nut-pull-refresh>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, inject, onMounted } from 'vue';
import ABListItem from './ABListItem.vue';
import { useListData } from '../composables/useList';

const props = withDefaults(defineProps<{
  nodeId: string;
  config: ListConfig;
  data?: any[];
}>(), {
  emptyText: '暂无数据',
  loadMoreText: '没有更多了',
  loadingText: '加载中...',
});

const emit = defineEmits<{
  (e: 'item-click', item: any, index: number): void;
  (e: 'action', action: any, item: any, index: number): void;
  (e: 'refresh'): void;
  (e: 'load-more'): void;
}>();

const context = inject('renderContext');

const {
  listData,
  loading,
  refreshing,
  hasMore,
  loadData,
  refresh,
  loadMore,
} = useListData(props.config, context);

// 获取列表项 key
const getItemKey = (item: any, index: number) => {
  const keyField = props.config.rowKey || 'id';
  return item[keyField] || index;
};

// 处理刷新
const handleRefresh = async () => {
  await refresh();
  emit('refresh');
  context?.eventBus.emit('onListRefresh', { nodeId: props.nodeId });
};

// 处理加载更多
const handleLoadMore = async () => {
  await loadMore();
  emit('load-more');
  context?.eventBus.emit('onListLoadMore', { nodeId: props.nodeId });
};

// 处理列表项点击
const handleItemClick = (item: any, index: number) => {
  emit('item-click', item, index);
  context?.eventBus.emit('onListItemClick', {
    nodeId: props.nodeId,
    item,
    index,
  });
};

// 处理操作
const handleAction = (action: any, item: any, index: number) => {
  emit('action', action, item, index);
  context?.eventBus.emit(`onListAction:${action.key}`, {
    nodeId: props.nodeId,
    item,
    index,
  });
};

onMounted(() => {
  if (props.config.dataSource?.autoLoad !== false) {
    loadData();
  }
});

defineExpose({
  refresh,
  loadData,
});
</script>

<style lang="scss">
.ab-list {
  min-height: 100%;
}

.ab-list-item-swipe {
  .ab-list-item-actions {
    display: flex;
    height: 100%;

    .nut-button {
      height: 100%;
      border-radius: 0;
    }
  }
}
</style>
```

---

## 7. 移动端适配

### 7.1 多端适配策略

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        多端适配策略                                          │
└─────────────────────────────────────────────────────────────────────────────┘

                    ┌─────────────────────┐
                    │   统一配置 (JSON)    │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │   核心运行时         │
                    │ (assembox-runtime)  │
                    └──────────┬──────────┘
                               │
         ┌─────────────────────┼─────────────────────┐
         │                     │                     │
         ▼                     ▼                     ▼
┌────────────────┐   ┌────────────────┐   ┌────────────────┐
│   H5 渲染器     │   │  小程序渲染器   │   │  App 渲染器    │
│  (Vue + NutUI) │   │ (Taro + NutUI) │   │  (WebView)    │
└────────────────┘   └────────────────┘   └────────────────┘
         │                     │                     │
         ▼                     ▼                     ▼
┌────────────────┐   ┌────────────────┐   ┌────────────────┐
│   H5 浏览器     │   │   微信/支付宝   │   │   原生 App    │
│                │   │   小程序容器    │   │   WebView     │
└────────────────┘   └────────────────┘   └────────────────┘
```

### 7.2 平台差异处理

```typescript
/**
 * 平台适配器
 */
class PlatformAdapter {
  private platform: AdaptMode;

  constructor(platform: AdaptMode) {
    this.platform = platform;
  }

  /**
   * 获取存储适配器
   */
  getStorage(): IStorage {
    switch (this.platform) {
      case 'weapp':
        return new WxStorage();
      case 'alipay':
        return new AlipayStorage();
      default:
        return new WebStorage();
    }
  }

  /**
   * 获取路由适配器
   */
  getRouter(): IRouter {
    switch (this.platform) {
      case 'weapp':
      case 'alipay':
        return new MiniProgramRouter();
      default:
        return new H5Router();
    }
  }

  /**
   * 获取请求适配器
   */
  getRequest(): IRequest {
    switch (this.platform) {
      case 'weapp':
        return new WxRequest();
      case 'alipay':
        return new AlipayRequest();
      default:
        return new AxiosRequest();
    }
  }

  /**
   * 适配 API 调用
   */
  adaptAPI(api: string, params: any): Promise<any> {
    const apiMap: Record<AdaptMode, Record<string, Function>> = {
      h5: {
        scanCode: () => import('html5-qrcode').then(m => m.Html5QrcodeScanner),
        getLocation: () => navigator.geolocation.getCurrentPosition,
      },
      weapp: {
        scanCode: () => wx.scanCode,
        getLocation: () => wx.getLocation,
      },
      alipay: {
        scanCode: () => my.scan,
        getLocation: () => my.getLocation,
      },
    };

    const platformAPIs = apiMap[this.platform];
    if (platformAPIs && platformAPIs[api]) {
      return platformAPIs[api](params);
    }

    throw new Error(`API ${api} not supported on platform ${this.platform}`);
  }
}
```

### 7.3 响应式适配

```typescript
/**
 * 移动端响应式适配
 */
class MobileResponsive {
  private designWidth: number;

  constructor(designWidth: number = 375) {
    this.designWidth = designWidth;
  }

  /**
   * 初始化 rem 适配
   */
  initRemAdapt(): void {
    const setRem = () => {
      const clientWidth = document.documentElement.clientWidth;
      const rem = (clientWidth / this.designWidth) * 16;
      document.documentElement.style.fontSize = `${rem}px`;
    };

    setRem();
    window.addEventListener('resize', setRem);
  }

  /**
   * px 转 rem
   */
  pxToRem(px: number): string {
    return `${px / 16}rem`;
  }

  /**
   * px 转 vw
   */
  pxToVw(px: number): string {
    return `${(px / this.designWidth) * 100}vw`;
  }

  /**
   * 适配样式值
   */
  adaptStyle(value: string | number): string {
    if (typeof value === 'number') {
      return this.pxToRem(value);
    }
    return value;
  }
}
```

---

## 8. 与现有代码的关系

### 8.1 代码迁移映射

| 现有文件 | 新文件 | 说明 |
|---------|-------|------|
| assembox-mobile/src/ui-skeleton/index.ts | assembox-mobile/src/index.ts | 入口重构 |
| assembox-mobile/src/ui-skeleton/render/ | assembox-mobile/src/renderer/ | 渲染逻辑迁移 |
| assembox-mobile/src/props-type/element/ | assembox-mobile/src/components/ | 组件迁移 |
| assembox-mobile/src/hook/ | assembox-mobile/src/composables/ | Hook 迁移 |

### 8.2 组件复用计划

| 现有组件 | 复用策略 |
|---------|---------|
| 表单组件 (Input, Picker 等) | 直接迁移，适配新接口 |
| 列表组件 (List, Swipe) | 重构渲染逻辑 |
| 业务组件 (DictPicker, Signature 等) | 直接迁移 |
| 布局组件 | 重构，简化实现 |

### 8.3 与 PC 端共享逻辑

```typescript
/**
 * PC/移动端共享的组合式函数
 */

// 表单逻辑共享
export { useFormState } from '@assembox/runtime';

// 数据加载共享
export { useDataLoader } from '@assembox/runtime';

// 验证逻辑共享
export { useValidation } from '@assembox/runtime';

// 事件处理共享
export { useEventHandler } from '@assembox/runtime';
```

---
