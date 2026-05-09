# kNi DSL

> **"只要有想讲故事的心，每个人都能成为剧本家。"**

为视觉小说而生的轻量脚本语言。

用简单的标记写出你的故事——角色、选项、分支、结局，一切尽在掌握。

自带编辑器、终端播放器和网页导出，写完就能跑。

---

## 开始冒险

```bash
pnpm install

# 在终端里体验 demo 剧本
pnpm --filter kni-cli start examples/deep-sea.kni

# 打开编辑器（带实时预览）
pnpm --filter kni-editor dev

# 跑一下测试确认一切正常
pnpm --filter kni-core test
```

---

## 语法指南

### 文件结构

一个 `.kni` 文件就是一部作品，由四种 **节** 组成：

```
@config   — 作品信息（标题、作者、入口场景）
@define   — 登场人物、道具、变量
@scene    — 剧情场景（舞台）
@logic    — 逻辑函数（幕后导演）
```

### @config — 作品信息

```ink
@config
  title: "深海遗迹"
  author: "XX"
  version: 1.0
  start: scene.intro        // 故事从这里开始
  lang: zh
```

### @define — 角色 · 道具 · 变量

**角色**

```ink
@define
  char Aria:
    name: "Aria"
    portrait: assets/aria.png
    color: #a3cfff            // 对话框的主题色
    voice: voice/aria/
    stats:
      trust: 0                // 好感度？信赖值？随你定义
      alive: true

  char Narrator:
    name: ""
    portrait: none
```

**道具**

```ink
  item keycard:
    name: "废旧门卡"
    desc: "门禁系统已经锈蚀，但这张卡或许还能用。"
    icon: assets/keycard.png
    stackable: false
    tags: [key, metal]
```

**变量**

```ink
  var chapter: 1
  var ending: none            // none | A | B | C
  var flags: []               // 事件标记，影响后续剧情走向
```

### @scene — 舞台开演

```ink
@scene intro
  bg: assets/bg_beach.jpg
  music: bgm/mysterious.ogg
  transition: fade 0.8

  // 旁白——叙述者的低语
  :: 海浪拍打着锈迹斑斑的金属舱门。

  // 角色登场
  Aria :: 这里……就是坐标所指的地方？

  ---

  Aria :: 感觉不对劲。
  Aria :: (whisper) 有什么东西在里面。

  ---

  // 命运的分岐点
  ? "你会怎么做？"
    > "推开舱门"    -> scene.enter_hatch
    > "先环顾四周"  -> scene.look_around
    > "原路返回"
        [if Aria.stats.trust >= 10]          // 信赖不够的话，这个选项不会出现
        -> scene.retreat
```

**演出效果** — 给台词加上情绪：

```ink
Aria :: (shake) 不……不可能！
Aria :: (flash, red) 你背叛了我！
Aria :: (whisper) 别出声。
:: (delay 1.5) 沉默笼罩着一切。
```

**内联指令** — 在剧情中穿插操作：

```ink
[give item.keycard]             // 获得道具！
[remove item.keycard]           // 道具消失了……
[set Aria.stats.trust += 5]     // 好感度 UP！
[set ending = "B"]              // 命运的齿轮开始转动
[add_flag "saw_mural"]          // 记住这件事
[sfx door_open]                 // 播放音效
[shake screen 0.4]              // 屏幕震动！
[call logic.check_endings]      // 呼叫幕后导演判断结局
```

### @logic — 幕后导演

用 if / elif / else 控制剧情走向：

```ink
@logic check_endings
  [if Aria.stats.trust >= 20 and has_flag "saw_mural"]
    [set ending = "A"]
    -> scene.ending_A
  [elif Aria.stats.alive = false]
    [set ending = "C"]
    -> scene.ending_C
  [else]
    [set ending = "B"]
    -> scene.ending_B
```

条件语法一览：

| 语法 | 含义 |
|------|------|
| `>=`, `>`, `<`, `<=`, `=`, `!=` | 比较 |
| `and`, `or` | 逻辑组合 |
| `has_flag "name"` | 检查标记 |

---

## 包一览

| 包 | 说明 |
|---|------|
| **kni-core** | 核心引擎——解析器 + 运行时 + 类型定义 |
| **kni-lang** | CodeMirror 语言扩展（语法高亮 · 自动补全 · 折叠） |
| **kni-cli** | 终端播放器，在命令行里跑剧本 |
| **kni-editor** | 桌面编辑器（SolidJS + Tauri），左边写代码右边看预览 |
| **kni-export** | 导出为单个 HTML 文件，发给朋友就能玩 |

### kni-core — 核心引擎

```ts
import { parse, createRuntime } from 'kni-core';

const ast = parse(sourceCode);       // .kni 文本 → AST
const runtime = createRuntime(ast);  // 创建运行时
const events = runtime.start();      // 开始！返回事件流
```

**运行时 API：**

| 方法 | 说明 |
|------|------|
| `start(sceneName?)` | 开始游戏 |
| `selectOption(index)` | 选择分支后继续 |
| `hasPendingChoice()` | 是否在等玩家选 |
| `getState()` | 查看当前状态 |
| `enterScene(name)` | 跳转场景 |
| `enterLogic(name)` | 执行逻辑 |

**事件类型：**

| kind | 说明 |
|------|------|
| `DIALOG` | 角色台词 |
| `NARRATION` | 旁白 |
| `CHOICE` | 分岐点 |
| `JUMP` | 场景跳转 |
| `ACTION` | 动作（道具 / 变量 / 标记 / 特效） |
| `WAIT` | 等待 |
| `END` | 散场 |
| `ERROR` | 出错了 |

### kni-cli — 命令行播放器

```bash
pnpm --filter kni-cli start examples/deep-sea.kni
```

### kni-editor — 桌面编辑器

```bash
pnpm --filter kni-editor dev
```

### kni-export — 网页导出

```ts
import { exportHTML } from 'kni-export';
await exportHTML([{ name: 'game.kni', content }], 'output.html');
```

---

## 运行原理

```
.kni 文件
  │
  ▼
Parser（解析器）
  │ 逐行读取，识别节、台词、动作、跳转
  ▼
AST（抽象语法树）
  │
  ▼
Runtime（运行时）
  │ 按顺序执行节点，维护状态
  ▼
RuntimeEvent[]（事件流）
  │
  ▼
Renderer（渲染器）
  CLI / Web / 自定义——订阅事件，负责显示
```

---

## Demo：深海遗迹

`examples/deep-sea.kni` — 一部完整的短篇：

- 2 位角色（Aria、旁白）
- 1 件道具（废旧门卡）
- 9 个场景、3 种结局
- 信赖值系统 + 事件标记影响走向

```bash
pnpm --filter kni-cli start examples/deep-sea.kni
```

---

## 项目结构

```
kNieNg/
├── examples/              # 剧本示例
├── packages/
│   ├── kni-core/          # 引擎核心
│   ├── kni-lang/          # 编辑器语言支持
│   ├── kni-export/        # HTML 导出
│   ├── kni-editor/        # 桌面编辑器
│   └── kni-cli/           # 终端播放器
├── package.json
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

---

## License

MIT
