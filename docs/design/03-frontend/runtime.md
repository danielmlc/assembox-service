# 核心运行时设计

> **状态**: 设计中
> **更新日期**: 2025-01-23

---

## 目录

1. [概述](#1-概述)
2. [配置解析](#2-配置解析)
3. [渲染引擎](#3-渲染引擎)
4. [状态管理](#4-状态管理)
5. [事件系统](#5-事件系统)
6. [表达式引擎](#6-表达式引擎)
7. [数据绑定](#7-数据绑定)
8. [生命周期管理](#8-生命周期管理)

---

## 1. 概述

### 1.1 核心运行时定位

核心运行时（assembox-runtime）是前端层的核心包，提供与具体 UI 框架无关的核心能力。

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          核心运行时职责                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────┐                                                        │
│  │   配置解析       │  将 JSON 配置解析为内部节点树结构                        │
│  └─────────────────┘                                                        │
│                                                                             │
│  ┌─────────────────┐                                                        │
│  │   渲染引擎       │  协调组件解析、渲染、更新                                │
│  └─────────────────┘                                                        │
│                                                                             │
│  ┌─────────────────┐                                                        │
│  │   状态管理       │  管理页面级数据状态和组件状态                            │
│  └─────────────────┘                                                        │
│                                                                             │
│  ┌─────────────────┐                                                        │
│  │   事件系统       │  统一事件注册、分发、处理                                │
│  └─────────────────┘                                                        │
│                                                                             │
│  ┌─────────────────┐                                                        │
│  │   表达式引擎     │  解析和执行配置中的动态表达式                            │
│  └─────────────────┘                                                        │
│                                                                             │
│  ┌─────────────────┐                                                        │
│  │   数据绑定       │  实现配置中的数据绑定逻辑                                │
│  └─────────────────┘                                                        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 设计原则

| 原则 | 说明 |
|-----|------|
| 框架无关 | 核心逻辑不依赖具体 UI 框架 |
| 可扩展 | 支持自定义解析器、处理器 |
| 类型安全 | 完整的 TypeScript 类型支持 |
| 高性能 | 最小化不必要的计算和更新 |

---

## 2. 配置解析

### 2.1 配置解析器

配置解析器负责将服务端返回的 JSON 配置解析为内部节点树结构。

```typescript
/**
 * 配置解析器接口
 */
interface IConfigParser {
  /**
   * 解析页面配置
   * @param config 原始配置 JSON
   * @returns 解析后的节点树
   */
  parse(config: RawPageConfig): ParsedNodeTree;

  /**
   * 验证配置结构
   * @param config 原始配置
   * @returns 验证结果
   */
  validate(config: RawPageConfig): ValidationResult;

  /**
   * 注册自定义解析器
   * @param type 组件类型
   * @param parser 解析函数
   */
  registerParser(type: string, parser: NodeParser): void;
}
```

### 2.2 节点结构定义

```typescript
/**
 * 基础节点接口
 */
interface IBaseNode {
  // 节点唯一标识
  nodeId: string;

  // 节点名称（显示用）
  nodeName: string;

  // 节点类型
  nodeType: NodeType;

  // 组件类型（对应渲染组件）
  componentType: string;

  // 节点属性
  props: Record<string, any>;

  // 节点样式
  style?: NodeStyle;

  // 子节点
  children?: IBaseNode[];

  // 事件配置
  events?: Record<string, EventConfig>;

  // 数据绑定配置
  bindings?: Record<string, BindingConfig>;

  // 条件渲染
  condition?: ConditionConfig;

  // 循环渲染
  loop?: LoopConfig;
}

/**
 * 节点类型枚举
 */
type NodeType =
  | 'layout'      // 布局节点
  | 'container'   // 容器节点
  | 'form'        // 表单节点
  | 'display'     // 展示节点
  | 'action'      // 操作节点
  | 'business';   // 业务节点
```

### 2.3 解析流程

```
┌──────────────────────────────────────────────────────────────────────────┐
│                           配置解析流程                                    │
└──────────────────────────────────────────────────────────────────────────┘

┌─────────────────┐
│  原始 JSON 配置  │
└────────┬────────┘
         │ ① Schema 验证
         ▼
┌─────────────────┐
│  Schema 验证器   │ ─────▶ 验证失败 ─────▶ 抛出错误
└────────┬────────┘
         │ ② 验证通过
         ▼
┌─────────────────┐
│   预处理器       │  处理变量替换、默认值填充
└────────┬────────┘
         │ ③ 递归解析
         ▼
┌─────────────────┐
│  节点解析器      │  为每个配置项创建节点
│                 │
│  ┌───────────┐  │
│  │ 布局解析器 │  │
│  ├───────────┤  │
│  │ 表单解析器 │  │
│  ├───────────┤  │
│  │ 表格解析器 │  │
│  ├───────────┤  │
│  │ ...       │  │
│  └───────────┘  │
└────────┬────────┘
         │ ④ 后处理
         ▼
┌─────────────────┐
│   后处理器       │  建立父子关系、处理引用
└────────┬────────┘
         │ ⑤ 输出
         ▼
┌─────────────────┐
│   节点树         │
└─────────────────┘
```

### 2.4 解析器实现示例

```typescript
class ConfigParser implements IConfigParser {
  private parsers: Map<string, NodeParser> = new Map();

  constructor() {
    // 注册内置解析器
    this.registerBuiltinParsers();
  }

  parse(config: RawPageConfig): ParsedNodeTree {
    // 1. 验证配置
    const validationResult = this.validate(config);
    if (!validationResult.valid) {
      throw new ConfigValidationError(validationResult.errors);
    }

    // 2. 预处理
    const preprocessed = this.preprocess(config);

    // 3. 递归解析节点
    const rootNode = this.parseNode(preprocessed.skeleton);

    // 4. 后处理
    this.postprocess(rootNode);

    return {
      root: rootNode,
      dataSource: preprocessed.dataSource,
      routerConfig: preprocessed.routerConfig,
    };
  }

  private parseNode(nodeConfig: any): IBaseNode {
    const parser = this.parsers.get(nodeConfig.__nodeType);
    if (!parser) {
      // 使用默认解析器
      return this.defaultParser(nodeConfig);
    }
    return parser(nodeConfig, this.parseNode.bind(this));
  }

  registerParser(type: string, parser: NodeParser): void {
    this.parsers.set(type, parser);
  }
}
```

---

## 3. 渲染引擎

### 3.1 渲染引擎架构

渲染引擎负责将节点树转换为实际的 Vue 组件树。

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           渲染引擎架构                                       │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────┐
│    节点树        │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           渲染引擎 (RenderEngine)                            │
│                                                                             │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐             │
│  │  组件解析器      │  │  Props 处理器    │  │  插槽管理器      │             │
│  │ ComponentResolver│  │  PropsHandler   │  │  SlotManager    │             │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘             │
│           │                    │                    │                       │
│           └────────────────────┼────────────────────┘                       │
│                                │                                            │
│                                ▼                                            │
│                    ┌─────────────────────┐                                  │
│                    │    VNode 生成器      │                                  │
│                    │   VNodeGenerator    │                                  │
│                    └──────────┬──────────┘                                  │
│                               │                                             │
└───────────────────────────────┼─────────────────────────────────────────────┘
                                │
                                ▼
                    ┌─────────────────────┐
                    │    Vue 组件树        │
                    └─────────────────────┘
```

### 3.2 渲染引擎接口

```typescript
/**
 * 渲染引擎接口
 */
interface IRenderEngine {
  /**
   * 渲染节点树
   * @param tree 节点树
   * @param context 渲染上下文
   * @returns Vue 渲染函数
   */
  render(tree: ParsedNodeTree, context: RenderContext): VNode;

  /**
   * 注册组件
   * @param type 组件类型
   * @param component Vue 组件
   */
  registerComponent(type: string, component: Component): void;

  /**
   * 获取组件
   * @param type 组件类型
   */
  getComponent(type: string): Component | undefined;

  /**
   * 更新节点
   * @param nodeId 节点ID
   * @param updates 更新内容
   */
  updateNode(nodeId: string, updates: Partial<IBaseNode>): void;
}
```

### 3.3 组件解析器

```typescript
/**
 * 组件解析器
 * 负责将节点类型映射到实际的 Vue 组件
 */
class ComponentResolver {
  private componentMap: Map<string, Component> = new Map();
  private fallbackComponent: Component;

  /**
   * 解析组件
   * @param node 节点
   * @returns Vue 组件
   */
  resolve(node: IBaseNode): Component {
    const component = this.componentMap.get(node.componentType);
    if (!component) {
      console.warn(`Component not found: ${node.componentType}, using fallback`);
      return this.fallbackComponent;
    }
    return component;
  }

  /**
   * 注册组件映射
   */
  register(type: string, component: Component): void {
    this.componentMap.set(type, component);
  }

  /**
   * 批量注册
   */
  registerAll(components: Record<string, Component>): void {
    Object.entries(components).forEach(([type, component]) => {
      this.register(type, component);
    });
  }
}
```

### 3.4 渲染流程

```typescript
/**
 * 渲染引擎核心实现
 */
class RenderEngine implements IRenderEngine {
  private componentResolver: ComponentResolver;
  private propsHandler: PropsHandler;
  private slotManager: SlotManager;
  private stateManager: StateManager;
  private eventBus: EventBus;

  render(tree: ParsedNodeTree, context: RenderContext): VNode {
    return this.renderNode(tree.root, context);
  }

  private renderNode(node: IBaseNode, context: RenderContext): VNode {
    // 1. 条件渲染判断
    if (node.condition && !this.evaluateCondition(node.condition, context)) {
      return null;
    }

    // 2. 循环渲染处理
    if (node.loop) {
      return this.renderLoop(node, context);
    }

    // 3. 解析组件
    const Component = this.componentResolver.resolve(node);

    // 4. 处理 Props
    const props = this.propsHandler.process(node.props, context);

    // 5. 处理事件
    const events = this.processEvents(node.events, context);

    // 6. 渲染子节点
    const children = node.children?.map(child =>
      this.renderNode(child, context)
    );

    // 7. 处理插槽
    const slots = this.slotManager.processSlots(node, children, context);

    // 8. 生成 VNode
    return h(Component, { ...props, ...events }, slots);
  }

  private renderLoop(node: IBaseNode, context: RenderContext): VNode[] {
    const { dataPath, itemName, indexName } = node.loop;
    const dataList = this.getValueByPath(context.data, dataPath);

    return dataList.map((item: any, index: number) => {
      const loopContext = {
        ...context,
        [itemName]: item,
        [indexName || 'index']: index,
      };
      return this.renderNode({ ...node, loop: undefined }, loopContext);
    });
  }
}
```

---

## 4. 状态管理

### 4.1 状态管理架构

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           状态管理架构                                       │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                        StateManager                                         │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                        页面状态 (PageState)                          │   │
│  │                                                                     │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌───────────┐  │   │
│  │  │  数据模型    │  │  组件状态    │  │  加载状态    │  │  上下文   │  │   │
│  │  │ dataModel   │  │ components  │  │  loading    │  │  context  │  │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └───────────┘  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌──────────────────────┐  ┌──────────────────────┐                        │
│  │    状态读取           │  │    状态更新           │                        │
│  │                      │  │                      │                        │
│  │  getValue(path)      │  │  setValue(path, val) │                        │
│  │  getComponentState() │  │  updateComponent()   │                        │
│  │  getContext()        │  │  setLoading()        │                        │
│  └──────────────────────┘  └──────────────────────┘                        │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                      响应式系统 (Vue Reactivity)                      │  │
│  │                                                                      │  │
│  │  reactive() / ref() / computed() / watch()                          │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 状态管理器接口

```typescript
/**
 * 状态管理器接口
 */
interface IStateManager {
  // ========== 数据模型操作 ==========

  /**
   * 获取数据值
   * @param path 数据路径，如 "user.name" 或 "items[0].id"
   */
  getValue<T = any>(path: string): T;

  /**
   * 设置数据值
   * @param path 数据路径
   * @param value 值
   */
  setValue(path: string, value: any): void;

  /**
   * 批量设置数据
   * @param data 数据对象
   */
  setData(data: Record<string, any>): void;

  /**
   * 获取整个数据模型
   */
  getData(): Record<string, any>;

  // ========== 组件状态操作 ==========

  /**
   * 获取组件状态
   * @param nodeId 节点ID
   */
  getComponentState(nodeId: string): ComponentState;

  /**
   * 更新组件状态
   * @param nodeId 节点ID
   * @param state 状态更新
   */
  updateComponentState(nodeId: string, state: Partial<ComponentState>): void;

  /**
   * 设置组件值
   * @param nodeId 节点ID
   * @param value 值
   */
  setComponentValue(nodeId: string, value: any): void;

  // ========== 加载状态 ==========

  /**
   * 设置加载状态
   * @param key 加载标识
   * @param loading 是否加载中
   */
  setLoading(key: string, loading: boolean): void;

  /**
   * 获取加载状态
   * @param key 加载标识
   */
  isLoading(key: string): boolean;

  // ========== 上下文 ==========

  /**
   * 获取上下文
   */
  getContext(): GlobalContext;

  /**
   * 更新上下文
   */
  updateContext(context: Partial<GlobalContext>): void;

  // ========== 监听 ==========

  /**
   * 监听数据变化
   * @param path 数据路径
   * @param callback 回调函数
   */
  watch(path: string, callback: WatchCallback): () => void;
}
```

### 4.3 状态管理器实现

```typescript
class StateManager implements IStateManager {
  private state: PageState;

  constructor(initialState?: Partial<PageState>) {
    this.state = reactive({
      dataModel: {},
      componentStates: {},
      loading: {},
      context: {
        permissions: [],
        tenantId: '',
        tenantCode: '',
        userId: '',
        userName: '',
      },
      ...initialState,
    });
  }

  getValue<T = any>(path: string): T {
    return get(this.state.dataModel, path);
  }

  setValue(path: string, value: any): void {
    set(this.state.dataModel, path, value);
  }

  getComponentState(nodeId: string): ComponentState {
    if (!this.state.componentStates[nodeId]) {
      this.state.componentStates[nodeId] = reactive({
        value: undefined,
        visible: true,
        disabled: false,
        validation: { valid: true, message: '' },
      });
    }
    return this.state.componentStates[nodeId];
  }

  updateComponentState(nodeId: string, state: Partial<ComponentState>): void {
    const currentState = this.getComponentState(nodeId);
    Object.assign(currentState, state);
  }

  watch(path: string, callback: WatchCallback): () => void {
    return watch(
      () => this.getValue(path),
      (newVal, oldVal) => callback(newVal, oldVal),
      { deep: true }
    );
  }
}
```

### 4.4 数据模型定义

```typescript
/**
 * 页面状态
 */
interface PageState {
  // 数据模型 - 页面的业务数据
  dataModel: Record<string, any>;

  // 组件状态 - 各组件的运行时状态
  componentStates: Record<string, ComponentState>;

  // 加载状态
  loading: Record<string, boolean>;

  // 全局上下文
  context: GlobalContext;
}

/**
 * 组件状态
 */
interface ComponentState {
  // 组件当前值
  value: any;

  // 可见性
  visible: boolean;

  // 禁用状态
  disabled: boolean;

  // 只读状态
  readonly?: boolean;

  // 验证状态
  validation: ValidationState;

  // 自定义状态
  custom?: Record<string, any>;
}

/**
 * 全局上下文
 */
interface GlobalContext {
  // 权限列表
  permissions: string[];

  // 租户信息
  tenantId: string;
  tenantCode: string;

  // 用户信息
  userId: string;
  userName: string;

  // 组织信息
  orgId?: string;
  orgName?: string;

  // 应用信息
  applicationId?: string;

  // 路由参数
  routeParams?: Record<string, any>;
  queryParams?: Record<string, any>;

  // 自定义上下文
  custom?: Record<string, any>;
}
```

---

## 5. 事件系统

### 5.1 事件系统架构

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           事件系统架构                                       │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   组件事件       │ ──▶ │   事件总线       │ ──▶ │   事件处理器    │
│  (Component)    │     │   (EventBus)    │     │  (Handler)      │
└─────────────────┘     └────────┬────────┘     └────────┬────────┘
                                 │                       │
                                 ▼                       ▼
                        ┌─────────────────┐     ┌─────────────────┐
                        │   事件注册表     │     │  执行引擎        │
                        │  (Registry)     │     │ (Executor)      │
                        └─────────────────┘     └─────────────────┘

事件类型:

┌──────────────────────────────────────────────────────────────────────────────┐
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐              │
│  │   交互事件       │  │   数据事件       │  │   生命周期事件   │              │
│  │                 │  │                 │  │                 │              │
│  │  onClick        │  │  onChange       │  │  onMounted      │              │
│  │  onFocus        │  │  onLoadData     │  │  onUnmounted    │              │
│  │  onBlur         │  │  onDataLoaded   │  │  onBeforeMount  │              │
│  │  onInput        │  │  onSaveData     │  │  onUpdated      │              │
│  │  onSelect       │  │  onValidate     │  │                 │              │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘              │
│                                                                              │
│  ┌─────────────────┐  ┌─────────────────┐                                   │
│  │   系统事件       │  │   自定义事件     │                                   │
│  │                 │  │                 │                                   │
│  │  onRouteChange  │  │  custom:xxx     │                                   │
│  │  onResize       │  │                 │                                   │
│  │  onError        │  │                 │                                   │
│  └─────────────────┘  └─────────────────┘                                   │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 5.2 事件总线接口

```typescript
/**
 * 事件总线接口
 */
interface IEventBus {
  /**
   * 触发事件
   * @param event 事件名称
   * @param payload 事件负载
   * @param source 事件来源（节点ID）
   */
  emit(event: string, payload?: any, source?: string): void;

  /**
   * 监听事件
   * @param event 事件名称
   * @param handler 处理函数
   * @returns 取消监听函数
   */
  on(event: string, handler: EventHandler): () => void;

  /**
   * 监听一次
   * @param event 事件名称
   * @param handler 处理函数
   */
  once(event: string, handler: EventHandler): void;

  /**
   * 移除监听
   * @param event 事件名称
   * @param handler 处理函数
   */
  off(event: string, handler?: EventHandler): void;

  /**
   * 清空所有监听
   */
  clear(): void;
}

/**
 * 事件处理器类型
 */
type EventHandler = (payload: any, context: EventContext) => void | Promise<void>;

/**
 * 事件上下文
 */
interface EventContext {
  // 事件名称
  event: string;

  // 事件来源节点
  source?: string;

  // 状态管理器
  stateManager: IStateManager;

  // API 服务
  apiService: IApiService;

  // 阻止默认行为
  preventDefault(): void;

  // 停止传播
  stopPropagation(): void;
}
```

### 5.3 事件处理器

```typescript
/**
 * 事件处理器管理
 */
class EventHandlerRegistry {
  private handlers: Map<string, EventHandlerConfig[]> = new Map();
  private systemHandlers: Map<string, SystemEventHandler> = new Map();

  /**
   * 注册系统事件处理器
   */
  registerSystemHandler(event: string, handler: SystemEventHandler): void {
    this.systemHandlers.set(event, handler);
  }

  /**
   * 注册配置中的事件处理器
   */
  registerFromConfig(nodeId: string, events: Record<string, EventConfig>): void {
    Object.entries(events).forEach(([eventName, config]) => {
      if (!config.isOn) return;

      const handlerConfig: EventHandlerConfig = {
        nodeId,
        type: config.type,
        handler: this.createHandler(config),
      };

      const handlers = this.handlers.get(eventName) || [];
      handlers.push(handlerConfig);
      this.handlers.set(eventName, handlers);
    });
  }

  /**
   * 创建处理器
   */
  private createHandler(config: EventConfig): EventHandler {
    switch (config.type) {
      case 'system':
        // 系统内置处理器
        return this.systemHandlers.get(config.handlerName);

      case 'expression':
        // 表达式处理器
        return (payload, context) => {
          const exprEngine = context.exprEngine;
          return exprEngine.evaluate(config.expression, { payload, ...context });
        };

      case 'custom':
        // 自定义函数
        return config.fn;

      default:
        return () => {};
    }
  }
}
```

### 5.4 事件配置示例

```json
{
  "__nodeEvent": {
    "onClick": {
      "isOn": true,
      "type": "system",
      "handlerName": "submitForm",
      "params": {
        "formId": "orderForm",
        "successMessage": "保存成功"
      }
    },
    "onChange": {
      "isOn": true,
      "type": "expression",
      "expression": "$setState('total', $getValue('price') * $getValue('quantity'))"
    },
    "onMounted": {
      "isOn": true,
      "type": "system",
      "handlerName": "loadData",
      "params": {
        "apiName": "getOrderDetail",
        "targetModel": "orderDetail"
      }
    }
  }
}
```

---

## 6. 表达式引擎

### 6.1 表达式引擎概述

表达式引擎用于解析和执行配置中的动态表达式，支持数据访问、计算、条件判断等。

### 6.2 表达式语法

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           表达式语法                                         │
└─────────────────────────────────────────────────────────────────────────────┘

1. 数据访问表达式:
   ${user.name}              → 访问 dataModel 中的 user.name
   ${items[0].id}            → 访问数组元素
   ${$context.tenantId}      → 访问上下文

2. 函数调用表达式:
   $getValue('user.name')    → 获取值
   $setValue('total', 100)   → 设置值
   $formatDate(date, 'YYYY-MM-DD')  → 日期格式化
   $sum(items, 'amount')     → 求和

3. 条件表达式:
   ${status === 'active'}    → 条件判断
   ${amount > 1000 ? 'VIP' : 'Normal'}  → 三元表达式

4. 复合表达式:
   ${user.name + ' - ' + user.department}  → 字符串拼接
   ${price * quantity * (1 - discount)}    → 数学计算
```

### 6.3 表达式引擎接口

```typescript
/**
 * 表达式引擎接口
 */
interface IExpressionEngine {
  /**
   * 解析表达式
   * @param expression 表达式字符串
   * @returns 解析结果
   */
  parse(expression: string): ParsedExpression;

  /**
   * 执行表达式
   * @param expression 表达式
   * @param context 执行上下文
   * @returns 执行结果
   */
  evaluate(expression: string | ParsedExpression, context: ExprContext): any;

  /**
   * 注册函数
   * @param name 函数名
   * @param fn 函数实现
   */
  registerFunction(name: string, fn: ExprFunction): void;

  /**
   * 检查表达式是否有效
   * @param expression 表达式
   */
  validate(expression: string): ValidationResult;
}

/**
 * 表达式上下文
 */
interface ExprContext {
  // 数据模型
  data: Record<string, any>;

  // 全局上下文
  $context: GlobalContext;

  // 当前项（循环中使用）
  $item?: any;

  // 当前索引
  $index?: number;

  // 事件负载
  $payload?: any;

  // 状态管理器引用
  $state: IStateManager;
}
```

### 6.4 内置函数

```typescript
/**
 * 内置函数注册
 */
const builtinFunctions: Record<string, ExprFunction> = {
  // ========== 数据操作 ==========
  $getValue: (ctx, path: string) => ctx.$state.getValue(path),
  $setValue: (ctx, path: string, value: any) => ctx.$state.setValue(path, value),
  $getData: (ctx) => ctx.$state.getData(),

  // ========== 组件操作 ==========
  $setVisible: (ctx, nodeId: string, visible: boolean) =>
    ctx.$state.updateComponentState(nodeId, { visible }),
  $setDisabled: (ctx, nodeId: string, disabled: boolean) =>
    ctx.$state.updateComponentState(nodeId, { disabled }),
  $getComponentValue: (ctx, nodeId: string) =>
    ctx.$state.getComponentState(nodeId).value,

  // ========== 格式化 ==========
  $formatDate: (ctx, date: any, format: string) =>
    dayjs(date).format(format),
  $formatNumber: (ctx, num: number, decimals: number = 2) =>
    num.toFixed(decimals),
  $formatCurrency: (ctx, amount: number) =>
    new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY' }).format(amount),

  // ========== 数组操作 ==========
  $sum: (ctx, array: any[], field?: string) =>
    array.reduce((sum, item) => sum + (field ? item[field] : item), 0),
  $filter: (ctx, array: any[], predicate: string) =>
    array.filter(item => evaluateInContext(predicate, { ...ctx, $item: item })),
  $find: (ctx, array: any[], predicate: string) =>
    array.find(item => evaluateInContext(predicate, { ...ctx, $item: item })),

  // ========== 条件 ==========
  $if: (ctx, condition: boolean, trueValue: any, falseValue: any) =>
    condition ? trueValue : falseValue,
  $isEmpty: (ctx, value: any) =>
    value === null || value === undefined || value === '' ||
    (Array.isArray(value) && value.length === 0),

  // ========== 权限 ==========
  $hasPermission: (ctx, permission: string) =>
    ctx.$context.permissions.includes(permission),
  $hasAnyPermission: (ctx, ...permissions: string[]) =>
    permissions.some(p => ctx.$context.permissions.includes(p)),
};
```

---

## 7. 数据绑定

### 7.1 数据绑定类型

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           数据绑定类型                                       │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────┐     单向绑定      ┌─────────────────┐
│    数据模型      │ ──────────────▶ │     组件        │
│   (DataModel)   │                  │  (Component)    │
└─────────────────┘                  └─────────────────┘

┌─────────────────┐     双向绑定      ┌─────────────────┐
│    数据模型      │ ◀─────────────▶ │     组件        │
│   (DataModel)   │                  │  (Component)    │
└─────────────────┘                  └─────────────────┘

┌─────────────────┐    计算绑定       ┌─────────────────┐
│  多个数据源      │ ──(表达式)────▶ │     组件        │
│                 │                  │  (Component)    │
└─────────────────┘                  └─────────────────┘
```

### 7.2 绑定配置

```typescript
/**
 * 绑定配置
 */
interface BindingConfig {
  // 绑定类型
  type: 'path' | 'expression' | 'computed';

  // 数据路径（type='path'时使用）
  path?: string;

  // 表达式（type='expression'或'computed'时使用）
  expression?: string;

  // 是否双向绑定
  twoWay?: boolean;

  // 格式化器
  formatter?: string;

  // 转换器
  transformer?: {
    get?: string;  // 读取时转换
    set?: string;  // 写入时转换
  };
}

/**
 * 绑定配置示例
 */
const bindingExamples = {
  // 简单路径绑定
  value: {
    type: 'path',
    path: 'form.username',
    twoWay: true,
  },

  // 表达式绑定
  disabled: {
    type: 'expression',
    expression: '${form.status === "readonly"}',
  },

  // 计算绑定
  total: {
    type: 'computed',
    expression: '${form.price} * ${form.quantity}',
  },

  // 带格式化的绑定
  displayDate: {
    type: 'path',
    path: 'form.createTime',
    formatter: 'date:YYYY-MM-DD',
  },

  // 带转换器的绑定
  amount: {
    type: 'path',
    path: 'form.amount',
    twoWay: true,
    transformer: {
      get: 'value / 100',  // 分转元
      set: 'value * 100',  // 元转分
    },
  },
};
```

### 7.3 数据绑定处理器

```typescript
/**
 * 数据绑定处理器
 */
class DataBindingHandler {
  private stateManager: IStateManager;
  private exprEngine: IExpressionEngine;

  /**
   * 处理组件的数据绑定
   */
  processBindings(
    nodeId: string,
    bindings: Record<string, BindingConfig>,
    context: RenderContext
  ): ComputedBindings {
    const result: ComputedBindings = {};

    Object.entries(bindings).forEach(([propName, config]) => {
      result[propName] = this.createBinding(nodeId, propName, config, context);
    });

    return result;
  }

  /**
   * 创建绑定
   */
  private createBinding(
    nodeId: string,
    propName: string,
    config: BindingConfig,
    context: RenderContext
  ): ComputedRef | Ref {
    switch (config.type) {
      case 'path':
        return this.createPathBinding(nodeId, propName, config);

      case 'expression':
        return this.createExpressionBinding(config, context);

      case 'computed':
        return this.createComputedBinding(config, context);

      default:
        throw new Error(`Unknown binding type: ${config.type}`);
    }
  }

  /**
   * 创建路径绑定
   */
  private createPathBinding(
    nodeId: string,
    propName: string,
    config: BindingConfig
  ): ComputedRef {
    const { path, twoWay, transformer } = config;

    return computed({
      get: () => {
        let value = this.stateManager.getValue(path);
        if (transformer?.get) {
          value = this.exprEngine.evaluate(transformer.get, { value });
        }
        return value;
      },
      set: twoWay
        ? (newValue) => {
            let value = newValue;
            if (transformer?.set) {
              value = this.exprEngine.evaluate(transformer.set, { value: newValue });
            }
            this.stateManager.setValue(path, value);
          }
        : undefined,
    });
  }

  /**
   * 创建表达式绑定
   */
  private createExpressionBinding(
    config: BindingConfig,
    context: RenderContext
  ): ComputedRef {
    return computed(() => {
      return this.exprEngine.evaluate(config.expression, {
        data: this.stateManager.getData(),
        $context: this.stateManager.getContext(),
      });
    });
  }
}
```

---

## 8. 生命周期管理

### 8.1 生命周期阶段

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           页面生命周期                                       │
└─────────────────────────────────────────────────────────────────────────────┘

    ┌───────────────┐
    │   创建阶段     │
    │ (Creation)    │
    └───────┬───────┘
            │
            ▼
    ┌───────────────┐     ┌─────────────────────────────────────┐
    │  beforeCreate │ ──▶ │ 初始化状态管理器、事件系统           │
    └───────┬───────┘     └─────────────────────────────────────┘
            │
            ▼
    ┌───────────────┐     ┌─────────────────────────────────────┐
    │    created    │ ──▶ │ 配置解析完成、数据模型初始化         │
    └───────┬───────┘     └─────────────────────────────────────┘
            │
            ▼
    ┌───────────────┐
    │   挂载阶段     │
    │ (Mounting)    │
    └───────┬───────┘
            │
            ▼
    ┌───────────────┐     ┌─────────────────────────────────────┐
    │  beforeMount  │ ──▶ │ 渲染引擎准备就绪                     │
    └───────┬───────┘     └─────────────────────────────────────┘
            │
            ▼
    ┌───────────────┐     ┌─────────────────────────────────────┐
    │    mounted    │ ──▶ │ DOM 渲染完成、可执行初始化数据加载    │
    └───────┬───────┘     └─────────────────────────────────────┘
            │
            ▼
    ┌───────────────┐
    │   更新阶段     │
    │ (Updating)    │
    └───────┬───────┘
            │
    ┌───────┴───────┐     ┌─────────────────────────────────────┐
    │ beforeUpdate  │ ──▶ │ 数据变更前                          │
    └───────┬───────┘     └─────────────────────────────────────┘
            │
            ▼
    ┌───────────────┐     ┌─────────────────────────────────────┐
    │    updated    │ ──▶ │ 数据变更后、DOM 更新完成             │
    └───────┬───────┘     └─────────────────────────────────────┘
            │
            ▼
    ┌───────────────┐
    │   销毁阶段     │
    │ (Unmounting)  │
    └───────┬───────┘
            │
            ▼
    ┌───────────────┐     ┌─────────────────────────────────────┐
    │ beforeUnmount │ ──▶ │ 清理前、可保存状态                   │
    └───────┬───────┘     └─────────────────────────────────────┘
            │
            ▼
    ┌───────────────┐     ┌─────────────────────────────────────┐
    │   unmounted   │ ──▶ │ 清理事件监听、释放资源               │
    └───────────────┘     └─────────────────────────────────────┘
```

### 8.2 生命周期管理器

```typescript
/**
 * 生命周期管理器接口
 */
interface ILifecycleManager {
  /**
   * 注册生命周期钩子
   */
  registerHook(phase: LifecyclePhase, hook: LifecycleHook): void;

  /**
   * 触发生命周期
   */
  trigger(phase: LifecyclePhase, context: LifecycleContext): Promise<void>;

  /**
   * 注册组件生命周期
   */
  registerComponentLifecycle(nodeId: string, hooks: ComponentLifecycleHooks): void;
}

/**
 * 生命周期阶段
 */
type LifecyclePhase =
  | 'beforeCreate'
  | 'created'
  | 'beforeMount'
  | 'mounted'
  | 'beforeUpdate'
  | 'updated'
  | 'beforeUnmount'
  | 'unmounted';

/**
 * 生命周期钩子
 */
type LifecycleHook = (context: LifecycleContext) => void | Promise<void>;

/**
 * 生命周期上下文
 */
interface LifecycleContext {
  // 页面配置
  config: PageConfig;

  // 状态管理器
  stateManager: IStateManager;

  // 事件总线
  eventBus: IEventBus;

  // API 服务
  apiService: IApiService;
}
```

### 8.3 生命周期实现

```typescript
class LifecycleManager implements ILifecycleManager {
  private hooks: Map<LifecyclePhase, LifecycleHook[]> = new Map();
  private componentHooks: Map<string, ComponentLifecycleHooks> = new Map();

  registerHook(phase: LifecyclePhase, hook: LifecycleHook): void {
    const phaseHooks = this.hooks.get(phase) || [];
    phaseHooks.push(hook);
    this.hooks.set(phase, phaseHooks);
  }

  async trigger(phase: LifecyclePhase, context: LifecycleContext): Promise<void> {
    const phaseHooks = this.hooks.get(phase) || [];

    // 按顺序执行页面级钩子
    for (const hook of phaseHooks) {
      await hook(context);
    }

    // 触发组件级生命周期
    if (phase === 'mounted' || phase === 'unmounted') {
      await this.triggerComponentLifecycle(phase, context);
    }
  }

  private async triggerComponentLifecycle(
    phase: LifecyclePhase,
    context: LifecycleContext
  ): Promise<void> {
    const hookName = `on${phase.charAt(0).toUpperCase() + phase.slice(1)}` as keyof ComponentLifecycleHooks;

    for (const [nodeId, hooks] of this.componentHooks) {
      const hook = hooks[hookName];
      if (hook) {
        await hook({ ...context, nodeId });
      }
    }
  }
}
```

---
