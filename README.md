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
- 三种 API 类型：**OpenAI 兼容** / **Anthropic (Claude)** / **Google Gemini**
- 在线获取模型列表、多模型管理
- 智能解析：粘贴环境变量或配置字符串自动填充地址、密钥、模型
- Base64 密钥自动检测与解码
- 连接健康检测：卡片边框 + 背景色反映状态（流畅 / 阻塞 / 失败）
- 自定义请求头 + 请求头预设

### 聊天测试
- 流式响应，实时输出
- 首字用时 / 完成用时显示
- Token 用量统计
- 系统提示词、消息复制、重新生成
- Markdown 渲染 + 代码高亮
- 切换历史会话时自动跟随供应商和模型

### CC Switch 导出
- V1 Deep Link 协议
- 目标工具选择：Claude Code / Claude Desktop / Codex / Gemini CLI / OpenCode / OpenClaw / Hermes
- 模型选择、批量导出、导出预览
- 未安装自动检测

### 数据管理
- JSON 格式导入 / 导出
- 导入冲突处理（跳过 / 覆盖）

## 快速开始

```bash
npm install
npm run dev        # 开发
npm run build      # 构建到 dist/
```

### 加载扩展

| 浏览器 | 操作 |
|--------|------|
| Chrome | `chrome://extensions/` → 开发者模式 → 加载已解压的扩展程序 → 选 `dist/` |
| Edge | `edge://extensions/` → 开发者模式 → 加载解压缩的扩展 → 选 `dist/` |

## 技术栈

| | 技术 |
|---|---|
| UI | Svelte 5 (runes) |
| 构建 | Vite 6 + @crxjs/vite-plugin |
| 样式 | Tailwind CSS 4 + CSS 变量 |
| 图标 | lucide-svelte |
| 存储 | chrome.storage.local |
| 请求头伪装 | declarativeNetRequest |

## 项目结构

```
src/
  manifest.json                  # MV3 扩展清单
  background/index.js            # Service Worker — API 代理、请求头规则
  sidepanel/
    App.svelte                   # 根组件 + 页面路由
    pages/                       # Home · ProviderForm · Chat · Settings · Export
    components/                  # ProviderCard · ChatInput · MessageBubble · ModelSelector …
    stores/                      # providers · sessions · settings · ui
  lib/
    api/                         # 请求头预设 · 模型工具
    ccswitch/                    # CC Switch 映射 · Deep Link
    storage/                     # chrome-storage 封装
    constants.js · tokens.js · uuid.js · highlight.js
rules/
  ua-override.json               # User-Agent 伪装规则
```

## 许可证

[Apache License 2.0](LICENSE)
