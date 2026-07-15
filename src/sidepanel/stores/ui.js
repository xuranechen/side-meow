import { get, writable } from "svelte/store";

export const currentPage = writable("home");
export const previousPage = writable(null);
export const toast = writable(null);
export const modal = writable(null);

export function navigateTo(page, params = {}) {
  currentPage.update((current) => {
    previousPage.set(current);
    return page;
  });
  
  if (params && Object.keys(params).length > 0) {
    pageParams.set(params);
  }
}

export function goBack(fallback = "home") {
  const target = get(previousPage) || fallback;
  currentPage.set(target);
  previousPage.set(null);
  pageParams.set({});
}

export const pageParams = writable({});

export function showToast(message, type = "success", duration = 3000) {
  toast.set({ message, type, id: Date.now() });
  
  if (duration > 0) {
    setTimeout(() => {
      toast.set(null);
    }, duration);
  }
}

export function showModal(type, data = {}) {
  modal.set({ type, data, id: Date.now() });
}

export function hideModal() {
  modal.set(null);
}
