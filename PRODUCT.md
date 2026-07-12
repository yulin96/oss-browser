# Product

## Register

product

## Platform

web

## Users
开发人员、运维工程师和云资源管理员，在桌面端高效、安全地管理阿里云 OSS 资源。

## Product Purpose
作为一个现代化的阿里云 OSS 桌面客户端，重构并升级旧版 oss-browser。它旨在通过现代前端技术（Electron, Vue 3, Tailwind CSS）提供更安全、更快速、体验更优秀的文件管理、权限管理、CDN 刷新、RAM 角色管理等全套 OSS 存储桶操作，且针对 macOS（特别是 Apple Silicon）进行首要优化，同时提供跨平台包支持。

## Positioning
一个针对苹果芯片（Apple Silicon）深度优化、凭证存储绝对安全、纯净无遗留负担的现代阿里云 OSS 桌面管理利器。

## Brand Personality
专业、克制、严谨、安全感十足。精致沉稳的深色/浅色主题、精准整洁的间距排版、直观明确的微交互，突出工具本身的安全感与高效率。

## Anti-references
- 官方旧版 oss-browser：界面陈旧、组件凌乱、存在各种历史兼容包袱以及不够安全的凭证明文/半明文存储行为。
- 过度设计的 SaaS 模板：花哨的多彩渐变文字、无意义的大图卡片堆砌、过大的无谓圆角。

## Design Principles
- **安全第一**：敏感凭证只通过 ProfileStore 和 Electron safeStorage 存储，绝不泄露在 LocalStorage 或日志中。
- **纯粹聚焦**：文件区域全屏展示，无常驻侧边栏；保证路径输入、历史导航及核心操作的直觉与高效。
- **高保真反馈**：使用 div 构建统一的按钮和输入框包裹层，不使用 native button，保证复杂状态下的定制样式不破裂。
- **平台契合**：首要适配 Apple Silicon macOS，图标、弹窗尺寸等均遵循现代 macOS 桌面软件的高级质感。

## Accessibility & Inclusion
- 遵循 WCAG AA 级色彩对比度，确保文本在不同主题下均有极佳的可读性。
- 原生支持系统的深色/浅色模式切换。
- 提供核心操作的键盘导航支持和 Icon Tooltips 提示。
