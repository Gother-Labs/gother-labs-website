(() => {
  const stage = document.querySelector("[data-rtl-evidence-stage]");
  if (!stage || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return;
  }

  stage.classList.add("is-motion-ready");

  if (!("IntersectionObserver" in window)) {
    stage.classList.add("is-visible");
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) {
        return;
      }

      stage.classList.add("is-visible");
      observer.disconnect();
    },
    { threshold: 0.3 },
  );

  observer.observe(stage);
})();
