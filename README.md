<p align="center">
  <img src="public/icons/icon128.png" width="80" alt="side-meow">
</p>

<h1 align="center">赛德喵 <code>side-meow</code></h1>

<p align="center">
  浏览器侧边栏 · 多模型 API 管理 · 聊天测试 · CC Switch 一键导入
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Chrome-114+-4285F4?logo=google-chrome&logoColor=white" alt="Chrome">
  <img src="https://img.shields.io/badge/Edge-114+-0078D7?logo=microsoft-edge&logoColor=white" alt="Edge">
  <img src="https://img.shields.io/badge/Svelte-5-FF3E00?logo=svelte&logoColor=white" alt="Svelte 5">
  <img src="https://img.shields.io/badge/Vite-6-646CFF?logo=vite&logoColor=white" alt="Vite 6">
</p>

---

## 功能

### API 管理

| 功能 | 说明 |
|------|------|
| 多协议支持 | OpenAI 兼容 / Anthropic (Claude) / Google Gemini |
| 智能解析 | 粘贴环境变量、配置字符串或 Base64 编码文本，自动提取地址、密钥、模型 |
| 兼容子路径 | 自动尝试 `/v1/models`、`/v3/chat/completions` 等候选端点（移植自 CC Switch） |
| Base64 解码 | 密钥和 URL 的 Base64 编码自动检测与解码 |
| 模型获取 | 支持 9 种已知兼容子路径的智能候选 URL 生成 |
| 连接检测 | 卡片边框 + 背景色反映状态（绿=流畅 / 黄=阻塞 / 红=失败） |
| 重名检查 | 保存时检测同名配置，防止重复 |
| 完整 URL 模式 | 不自动拼接 `/chat/completions`，适配特殊端点 |
| 自定义请求头 | 支持请求头预设、自定义 User-Agent |
| 请求头伪装 | declarativeNetRequest 替换 UA、移除浏览器特征头 |

### 聊天测试

| 功能 | 说明 |
|------|------|
| 流式响应 | 实时输出，支持停止生成 |
| 耗时统计 | 首字用时 / 完成用时显示（可关闭） |
| Token 统计 | 入 Token / 出 Token 计数 |
| 多轮对话 | 系统提示词、消息复制、重新生成 |
| Markdown | 渲染 + 代码高亮 |
| 会话切换 | 自动跟随供应商和模型 |

### CC Switch 导出

| 功能 | 说明 |
|------|------|
| V1 协议 | `ccswitch://v1/import` Deep Link |
| 目标工具 | Claude Code / Claude Desktop / Codex / Gemini CLI / OpenCode / OpenClaw / Hermes |
| 模型选择 | 每个接口独立选择目标模型 |
| 批量导出 | 多选接口逐个发送 |
| 未安装检测 | blur 事件检测，失败自动跳转下载页 |

### 数据管理

| 功能 | 说明 |
|------|------|
| JSON 导入/导出 | 配置、会话、设置 |
| 导入冲突 | 跳过 / 覆盖 |
| 存储管理 | 用量显示、会话过期清理（7/30/90 天可配） |
| 可调超时 | 请求超时 5/10/15/30/60 秒可选 |

## 快速开始

```bash
npm install
npm run dev          # 开发
npm run build        # 构建到 dist/
```

### 加载扩展

| 浏览器 | 操作 |
|--------|------|
| Chrome | `chrome://extensions/` → 开发者模式 → 加载已解压的扩展程序 → 选 `dist/` |
| Edge | `edge://extensions/` → 开发者模式 → 加载解压缩的扩展 → 选 `dist/` |

## 技术栈

| | 技术 |
|---|---|
| UI | Svelte 5 (runes: `$state`/`$derived`/`$effect`/`$props`) |
| 构建 | Vite 6 + @crxjs/vite-plugin 2.0.0-beta.28 |
| 样式 | Tailwind CSS 4 + CSS 变量（暗色主题） |
| 图标 | lucide-svelte |
| 存储 | chrome.storage.local |
| 请求头伪装 | declarativeNetRequest |

## 项目结构

```
src/
  manifest.json                  # MV3 扩展清单
  background/index.js            # Service Worker — API 代理、模型获取、请求头规则、兼容子路径
  sidepanel/
    App.svelte                   # 根组件 + 页面路由
    pages/                       # Home · ProviderForm · Chat · Settings · Export
    components/                  # ProviderCard · ChatInput · MessageBubble · AppSelector · ModelSelect …
    stores/                      # providers · sessions · settings · ui
  lib/
    api/                         # 请求头预设 · 模型工具
    ccswitch/                    # CC Switch 映射 · Deep Link (V1 协议)
    storage/                     # chrome-storage 封装（getStorage · setStorage · getStorageSize）
    constants.js · tokens.js · uuid.js · highlight.js
rules/
  ua-override.json               # User-Agent 伪装规则
```

## 许可证

[Apache License 2.0](LICENSE)
