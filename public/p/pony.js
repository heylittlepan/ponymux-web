// Cloudflare serves this path through the analytics proxy. This small fallback
// keeps static-only previews functional if the Worker runtime is unavailable.
(() => {
  const current = document.currentScript;
  if (!(current instanceof HTMLScriptElement)) return;

  const fallback = document.createElement("script");
  fallback.defer = true;
  fallback.src = "https://cloud.umami.is/script.js";

  for (const { name, value } of current.attributes) {
    if (name.startsWith("data-")) fallback.setAttribute(name, value);
  }

  fallback.dataset.hostUrl = "https://gateway.umami.is";
  current.after(fallback);
})();
