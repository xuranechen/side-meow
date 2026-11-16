import { sanitizeApiKey } from "../api/api-key.js";

// magpie 导入链接的协议约定（见 https://usemagpie.ai/docs/zh/import）：
//   chat       OpenAI Chat Completions 的 base URL，必须以 /v1 结尾
//   responses  OpenAI Responses 的 base URL，必须以 /v1 结尾
//   anthropic  Anthropic Messages 的 base URL，根地址，不带 /v1
//   gemini     Gemini API 的 base URL，必须以 /v1beta 结尾
// magpie 会自己拼接 /chat/completions 等后缀，所以这里的地址必须只到版本段为止。

const ENDPOINT_SUFFIXES = [
  "/chat/completions",
  "/completions",
  "/responses",
  "/v1/messages",
  "/messages",
  "/streamGenerateContent",
  "/models",
];

/** 去掉末尾斜杠和已知的端点后缀，得到只到版本段的地址。 */
function stripEndpointSuffix(baseUrl) {
  let url = String(baseUrl || "").trim();
  // 去掉查询串与片段：magpie 明确拒绝带查询参数的地址
  url = url.replace(/[?#].*$/, "");
  for (const suffix of ENDPOINT_SUFFIXES) {
    if (url.endsWith(suffix)) {
      url = url.slice(0, -suffix.length);
      break;
    }
  }
  return url.replace(/\/+$/, "");
}

/** 末尾是否已经是版本段（/v1、/v3、/v1beta 等）。 */
function endsWithVersionSegment(url) {
  const last = url.split("/").pop() || "";
  return /^v\d+(beta|alpha)?\d*$/i.test(last);
}

function withVersionSegment(url, segment) {
  if (endsWithVersionSegment(url)) return url;
  return `${url}/${segment}`;
}

/**
 * magpie 只接受 https，仅本机/局域网允许 http。
 * 返回规范化后的 URL，不合格则返回 null。
 */
export function sanitizeBaseUrl(baseUrl) {
  const stripped = stripEndpointSuffix(baseUrl);
  if (!stripped) return null;

  let parsed;
  try {
    parsed = new URL(stripped);
  } catch {
    return null;
  }

  // 带账号密码的地址会被 magpie 直接拒绝
  if (parsed.username || parsed.password) return null;

  if (parsed.protocol === "https:") return stripped;
  if (parsed.protocol !== "http:") return null;

  const host = parsed.hostname;
  const isLocal =
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "[::1]" ||
    host === "::1" ||
    host.endsWith(".local") ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host);

  return isLocal ? stripped : null;
}

/** 名称取 magpie 的上限 80 字符。 */
function clampName(name) {
  const trimmed = String(name || "").trim().slice(0, 80);
  return trimmed || "side-meow";
}

/**
 * 默认 id 取名称的小写连字符形式（Acme Relay -> acme-relay）。
 * 名称里没有 ASCII 字母数字时返回空串，交给 magpie 自己派生，
 * 否则所有中文名 provider 都会退化成同一个 id 而互相冲突。
 */
export function deriveProviderId(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export class MagpieMapper {
  /**
   * 把一个 side-meow provider 映射成 magpie 导入参数。
   * 只输出该 provider 类型对应的那一个 base URL 参数。
   */
  static mapProvider(provider) {
    const params = {
      name: clampName(provider.name),
      key: sanitizeApiKey(provider.apiKey),
    };

    // 名称为纯中文等无法派生合法 id 时省略该参数，让 magpie 自行生成
    const id = deriveProviderId(provider.name);
    if (id) params.id = id;

    const baseUrl = sanitizeBaseUrl(provider.baseUrl);

    if (baseUrl) {
      switch (provider.type) {
        case "anthropic":
          // anthropic 要根地址，不带 /v1
          params.anthropic = baseUrl.replace(/\/v1$/i, "");
          break;
        case "gemini":
          params.gemini = withVersionSegment(baseUrl, "v1beta");
          break;
        case "openai":
        default:
          params.chat = withVersionSegment(baseUrl, "v1");
          break;
      }
    }

    const modelIds = (provider.models || [])
      .map((model) => model?.id)
      .filter((id) => typeof id === "string" && id.trim());
    if (modelIds.length > 0) {
      params.models = [...new Set(modelIds)].join(",");
    }

    return params;
  }

  /**
   * 是否具备导出条件：至少一个 base URL 通过 https 校验。
   */
  static isExportable(provider) {
    return Boolean(sanitizeBaseUrl(provider.baseUrl));
  }

  /** 按 provider 类型给出 magpie 使用哪个参数名，用于预览展示。 */
  static baseUrlParamName(type) {
    const mapping = { openai: "chat", anthropic: "anthropic", gemini: "gemini" };
    return mapping[type] || "chat";
  }
}
