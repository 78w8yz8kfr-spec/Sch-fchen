(() => {
  const queryMode = new URLSearchParams(window.location.search).get("mode");
  const demoMode = queryMode === "demo" || (
    queryMode !== "live"
    && (window.location.hostname.endsWith("github.io") || window.location.port === "4173")
  );
  const footer = document.querySelector("#login-footer");
  if (footer) footer.textContent = `Einfach vor komplex · Version 0.19.1 ${demoMode ? "Demo" : "Online"}`;
})();
