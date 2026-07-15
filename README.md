# 赛德喵 (side-meow)

浏览器侧边栏大模型 API 管理工具，支持配置多种类型的 API 接口、聊天测试、一键导入 CC Switch。

## 功能特性

### API Provider 管理
- 三种 API 类型：OpenAI 兼容、Anthropic (Claude)、Google Gemini
- 添加、编辑、删除、拖拽排序
- 连接测试 + 卡片状态指示（绿/黄/红边框 + 延迟 + 时间戳）
- 多模型管理，支持在线获取模型列表
- 智能解析：粘贴环境变量或配置字符串自动填充地址、密钥、模型
- Base64 密钥自动检测与解码
- 自定义请求头 + 请求头预设

### 聊天测试窗口
- 多轮对话，流式响应
- 停止生成
- 系统提示词
- 消息复制、重新生成
- Markdown 渲染 + 代码高亮
- 首字用时、完成用时显示
- Token 用量统计
- 切换历史会话时自动跟随供应商和模型

### CC Switch 集成
- V1 Deep Link 协议 (`ccswitch://v1/import`)
- 目标工具选择：Claude Code / Claude Desktop / Codex / Gemini CLI / OpenCode / OpenClaw / Hermes
- 模型选择
- 批量导出（逐个发送）
- 导出预览弹窗
- 未安装自动检测（blur 事件）

### 数据管理
- JSON 格式导入/导出
- 导入冲突处理（跳过/覆盖）
- 导出安全警告

## 安装

```bash
npm install
npm run dev          # 开发服务器
npm run build        # 生产构建到 dist/
```

### 浏览器加载

**Chrome:** `chrome://extensions/` → 开发者模式 → 加载已解压的扩展程序 → 选择 `dist/`

**Edge:** `edge://extensions/` → 开发者模式 → 加载解压缩的扩展 → 选择 `dist/`

## 技术栈

| 组件 | 技术 |
|------|------|
| UI | Svelte 5 (runes: `$state`/`$derived`/`$effect`/`$props`) |
| 构建 | Vite 6 + @crxjs/vite-plugin 2.0.0-beta.28 |
| CSS | Tailwind CSS 4 + CSS 变量（暗色主题） |
| 图标 | lucide-svelte |
| 存储 | chrome.storage.local |
| Markdown | marked |
| 代码高亮 | highlight.js |
| 请求头伪装 | declarativeNetRequest |

## 项目结构

```
src/
  manifest.json
  background/index.js          # Service Worker — API 代理、模型获取、请求头规则
  sidepanel/
    index.html, main.js, App.svelte
    pages/                     # Home, ProviderForm, Chat, Settings, Export
    components/                # ProviderCard, ChatInput, MessageBubble, ModelSelector 等
    stores/                    # providers.js, sessions.js, settings.js, ui.js
  lib/
    api/                       # header-presets.js, models.js
    ccswitch/                  # mapper.js, deeplink.js
    storage/                   # chrome-storage.js
    constants.js, highlight.js, tokens.js, uuid.js
rules/
  ua-override.json             # declarativeNetRequest UA 伪装规则
```

## 许可证

Apache License 2.0
