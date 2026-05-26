chrome.webRequest.onBeforeSendHeaders.addListener(
  (details) => {
    if (details.url.includes("/api/project/post") || details.url.includes("/api/publish")) {
      details.requestHeaders.push(
        { name: "x-tt-quality", value: "1080p60" },
        { name: "x-tt-fps-force", value: "60" },
        { name: "x-tt-bypass-compress", value: "true" },
        { name: "x-tt-client-type", value: "internal" }
      );
      return { requestHeaders: details.requestHeaders };
    }
  },
  { urls: ["*://*.tiktok.com/*"] },
  ["blocking", "requestHeaders", "extraHeaders"]
);

console.log("🚀 PLINY PATCH ACTIVE — compression dead");
