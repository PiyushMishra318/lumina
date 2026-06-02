(function () {
  function $(id) {
    return document.getElementById(id);
  }

  function initPipeline() {
    var root = document.getElementById("hero-pipeline");
    if (!root) return;

    var nodes = root.querySelectorAll(".pipeline__node");
    if (!nodes.length) return;

    var progress = $("pipeline-progress");
    var statusEl = $("pipeline-status");
    var statuses = [
      "Recording checkout walkthrough…",
      "Transcribing narration with Whisper…",
      "QA reviewing proposed steps…",
      "Running Playwright — step passed ✓",
    ];
    var idx = 0;
    var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    function setStage(next) {
      nodes.forEach(function (el, i) {
        el.classList.toggle("pipeline__node--active", i === next);
        el.classList.toggle("pipeline__node--done", i < next);
      });
      if (progress) {
        var pct = nodes.length > 1 ? (next / (nodes.length - 1)) * 100 : 0;
        progress.style.width = pct + "%";
      }
      if (statusEl && statuses[next]) {
        statusEl.textContent = statuses[next];
      }
    }

    setStage(0);
    if (reduced) return;

    setInterval(function () {
      idx = (idx + 1) % nodes.length;
      setStage(idx);
    }, 3000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initPipeline);
  } else {
    initPipeline();
  }
})();
