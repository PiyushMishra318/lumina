(function () {
  function $(id) {
    return document.getElementById(id);
  }

  function initHeroPreview() {
    var stepsRoot = $("hero-preview-steps");
    if (!stepsRoot) return;
    var steps = stepsRoot.querySelectorAll(".hero-preview__step");
    if (!steps.length) return;

    var times = ["0:08", "0:16", "0:22", "0:31"];
    var statuses = [
      "Transcribing narration…",
      "Generating test steps…",
      "Running in browser…",
      "Step passed ✓",
    ];
    var idx = 0;
    var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    function setActive(next) {
      steps.forEach(function (el, i) {
        el.classList.toggle("hero-preview__step--active", i === next);
      });
      var timeEl = $("hero-preview-time");
      var statusEl = $("hero-preview-status");
      if (timeEl) timeEl.textContent = times[next] || times[times.length - 1];
      if (statusEl) statusEl.textContent = statuses[next] || statuses[statuses.length - 1];
    }

    if (reduced) return;

    setInterval(function () {
      idx = (idx + 1) % steps.length;
      setActive(idx);
    }, 2800);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initHeroPreview);
  } else {
    initHeroPreview();
  }
})();
