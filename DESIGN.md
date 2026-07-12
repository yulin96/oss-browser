---
name: OSS Browser
description: A modern, secure, and Apple Silicon optimized desktop client for Alibaba Cloud OSS
colors:
  primary: "#1677ff"
  primary-dark: "#4c9aff"
  danger: "#e5484d"
  danger-dark: "#ff7377"
  text-light: "#182230"
  text-dark: "#e7edf6"
  muted-light: "#65758b"
  muted-dark: "#96a5b8"
  border-light: "#e5eaf0"
  border-dark: "#2c394a"
  bg-light: "#f6f8fb"
  bg-dark: "#0f1722"
  surface-light: "#ffffff"
  surface-dark: "#17212f"
typography:
  display:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif"
    fontSize: "15px"
    fontWeight: 650
  body:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif"
    fontSize: "13px"
    fontWeight: 500
  label:
    fontFamily: "'SFMono-Regular', Consolas, monospace"
    fontSize: "12px"
    fontWeight: 400
rounded:
  sm: "6px"
  md: "8px"
  lg: "10px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "14px"
  lg: "20px"
components:
  button-default:
    backgroundColor: "#ffffff"
    textColor: "#36465b"
    rounded: "{rounded.md}"
    padding: "0 14px"
    height: "36px"
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
    padding: "0 14px"
    height: "36px"
---

# Design System: OSS Browser

## 1. Overview

**Creative North Star: "The Precision Vault"**

OSS Browser 作为一个专业且安全的云存储客户端，其设计语言秉持“精密金库”的理念。这代表着工具感、坚固性、高安全度与精细的工业化质感。界面风格极致纯净、无任何多余装饰，避免渐变文本或过大圆角等花哨设计，让用户的注意力聚焦于数据管理与安全传输上。

整个系统的视觉呈现精致而克制。背景主要以淡雅低饱和度的灰色（浅色模式）或深邃纯正的暗灰蓝（深色模式）为主，交互容器通过细微的边框与柔和的色彩断层（Tonal Layering）区分层级，营造出专业、可靠、井然有序的生产力工具环境。

**Key Characteristics:**
- **极端克制 (Restrained)**：除了主蓝色（Aliyun Blue）作为操作强调外，界面其余区域由灰度及中性冷色调主导。
- **高密度 (High Density)**：提供直观紧凑的信息布局，方便开发与运维人员在大列表、多文件时获得高信息通量。
- **状态高保真 (High Fidelity States)**：所有组件都具有精准的悬停、聚焦、激活及禁用状态反馈。

## 2. Colors

整个调色板分为浅色（Light）与深色（Dark）两套主题，依据系统的 `data-theme` 属性动态切换。

### Primary
- **Aliyun Blue** (浅色: `#1677ff` / 深色: `#4c9aff`)：核心主动作色，用于主要按钮、进度条及选中高亮状态。

### Neutral
- **Background** (浅色: `#f6f8fb` / 深色: `#0f1722`)：全局底层背景色，带有微妙的蓝灰色相。
- **Surface** (浅色: `#ffffff` / 深色: `#17212f`)：容器、卡片及弹窗背景色。
- **Text** (浅色: `#182230` / 深色: `#e7edf6`)：主要正文、标题色，确保高对比度和极佳的可读性。
- **Muted** (浅色: `#65758b` / 深色: `#96a5b8`)：次要说明文本、占位符色。
- **Border** (浅色: `#e5eaf0` / 深色: `#2c394a`)：分隔线与边框色，轻薄而清晰。

### Named Rules
**The One Accent Rule.** 主蓝色调（Primary）在单个界面中的占比不得超过 10%。其稀缺性正是为了引导用户的核心视线。

## 3. Typography

**Display Font:** Inter, -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif
**Body Font:** Inter, -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif
**Label/Mono Font:** 'SFMono-Regular', Consolas, monospace

### Hierarchy
- **Display** (SemiBold (650), `15px`, `1.4`)：用于顶部标题栏、页头以及弹窗主标题。
- **Headline** (SemiBold (600), `14px`, `1.4`)：用于区域标题、表单分组标题。
- **Body** (Medium (500), `13px`, `1.4`)：用于默认正文、表格内容、文件详情等。最大行宽限制在 75ch 以内。
- **Label** (Regular (400), `12px`, `normal`)：用于路径导航、状态标签、次要说明。
- **Code/Mono** (Regular (400), `12px`, `normal`)：用于存储桶名称、OSS 路径、文件大小、AccessKey ID 等技术元数据。

## 4. Elevation

本系统遵循 **Flat-By-Default** 与 **Tonal Layering** 哲学，原则上不使用常驻的深重阴影，主要通过不同容器背景色（如 Surface 对比 Background）和细微边框来表达空间层级。

### Shadow Vocabulary
- **Interactive Shadow** (浅色: `0 16px 50px rgba(31, 47, 70, 0.12)` / 深色: `0 18px 55px rgba(0, 0, 0, 0.42)`)：仅在弹窗、Toast 或浮动菜单（More Menu）展开时使用，用以衬托浮空层级。

### Named Rules
**The Rested Flat Rule.** 所有卡片、容器、输入框在静止状态（Rest）下必须平贴于背景上，不得带有装饰性阴影。阴影仅在悬停（Hover）或处于浮空层（Modal/Dialog）时以状态反馈形式出现。

## 5. Components

### Buttons
- **Shape:** 中度圆角 (8px radius)
- **Primary:** 背景 `#1677ff`，文字 `#ffffff`，悬停时为 `#0869e8`。
- **Default:** 背景 `#ffffff`，边框 `#e5eaf0`，文字 `#36465b`，悬停时边框 `#b8c5d6`，背景 `#f8fafc`。
- **Danger:** 背景 `#fff8f8`，边框 `#ffd7d8`，文字 `#e5484d`，悬停时边框 `#ffd7d8`，背景 `#fff1f1`。
- **Ghost:** 背景透明，边框透明，悬停时背景带有微妙淡灰。
- **Interaction:** 所有按钮均由 `div` 元素构建，并包含高保真的 `:active`（点击微缩）和 `:focus-visible`（聚焦环）处理。

### Cards / Containers
- **Corner Style:** 容器大圆角 (10px radius)
- **Background:** 浅色主题使用 `#ffffff`，深色主题使用 `#17212f`。
- **Border:** 1px 实线，颜色为 var(--border)。

### Inputs / Fields
- **Style:** 输入框容器（wrapper div）具有 1px border (`#e5eaf0`/`#2c394a`)，圆角 8px，背景为 `#ffffff`/`#17212f`。内层原生的 `<input>` 移除默认边框、背景及轮廓。
- **Focus:** 当内层 input 获得焦点时，外层容器 border 变为主蓝色，并呈现 2px 蓝色的 Focus Ring 外圈。
- **Error:** 外层容器 border 变为红色 (`#e5484d`)，背景变为淡粉色相。

## 6. Do's and Don'ts

### Do:
- **Do** 仅通过 `ProfileStore` 和 Electron `safeStorage` 存储密钥，并在前端凭证展示区域进行脱敏处理。
- **Do** 强制实现按钮的 `div` 容器封装，并通过 `@keydown.enter` 处理键盘事件支持。
- **Do** 给所有仅含图标的动作按钮加上 `Icon Tooltips`。

### Don't:
- **Don't** 使用超过 1px 宽度的侧边单栏彩色高亮线（如 card 的 border-left 装饰线）。
- **Don't** 使用渐变文字（background-clip: text），所有标题和文字均应使用纯色。
- **Don't** 在卡片、输入框上同时使用 `border` 和大于 16px 模糊半径的 `box-shadow` 作为默认装饰（鬼影卡片模式）。
- **Don't** 对卡片、弹窗使用大于 12px (0.75rem) 的圆角，大圆角破坏“精密金库”的工具质感。
