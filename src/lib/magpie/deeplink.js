// magpie 导入链接。两种形态（见 https://usemagpie.ai/docs/zh/import）：
//   magpie://import?name=...&chat=...&key=...   应用协议，需已安装 magpie
//   https://usemagpie.ai/import#name=...&chat=...  网页链接，参数放 # 后，
//   密钥不经过 usemagpie.ai 服务器，未安装时会引导下载，因此作为默认方式。

const WEB_IMPORT_BASE = "https://usemagpie.ai/import";
const APP_IMPORT_BASE = "magpie://import";

export function getMagpieDownloadUrl() {
  return "https://usemagpie.ai/download";
}

export function getMagpieDocsUrl() {
  return "https://usemagpie.ai/docs/zh/import";
}

function buildQuery(params) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  return search.toString();
}

/** 网页导入链接：参数放在 # 片段里，密钥不会发往服务器。 */
export function generateWebImportLink(params) {
  const query = buildQuery(params);
  return query ? `${WEB_IMPORT_BASE}#${query}` : WEB_IMPORT_BASE;
}

/** 应用协议链接，交给本机 magpie 处理。 */
export function generateAppImportLink(params) {
  const query = buildQuery(params);
  return query ? `${APP_IMPORT_BASE}?${query}` : APP_IMPORT_BASE;
}

/**
 * 打开导入链接并判断是否被接管。
 * 网页链接总是能打开，因此不做 blur 探测；应用协议沿用 CC Switch 的探测方式。
 */
export async function tryOpenMagpie(link, { detect = false } = {}) {
  if (!detect) {
    window.open(link, "_blank");
    return true;
  }

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      window.removeEventListener("blur", onblur);
      resolve(false);
    }, 2000);

    const onblur = () => {
      clearTimeout(timeout);
      window.removeEventListener("blur", onblur);
      resolve(true);
    };

    window.addEventListener("blur", onblur);
    window.open(link, "_blank");
  });
}
