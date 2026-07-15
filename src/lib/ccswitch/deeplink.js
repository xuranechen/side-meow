export function generateDeepLink(v1Params) {
  const params = new URLSearchParams();

  const entries = Object.entries(v1Params).filter(
    ([, v]) => v !== undefined && v !== null && v !== ""
  );
  for (const [key, value] of entries) {
    params.set(key, String(value));
  }

  return `ccswitch://v1/import?${params.toString()}`;
}

export function isDeepLinkTooLong(link, limit = 2000) {
  return link.length > limit;
}

export async function tryOpenCCSwitch(link) {
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

export async function tryOpenCCSwitchBatch(links) {
  if (links.length === 0) return 0;

  const opened = await tryOpenCCSwitch(links[0]);
  if (!opened) return 0;

  for (let i = 1; i < links.length; i++) {
    window.open(links[i], "_blank");
  }

  return links.length;
}

export function getCCSwitchDownloadUrl() {
  return "https://github.com/farion1231/cc-switch/releases/latest";
}
