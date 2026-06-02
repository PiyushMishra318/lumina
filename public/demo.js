(function () {
  "use strict";

  var ACTION_TYPES = [
    { value: "click", label: "Click", icon: "◎" },
    { value: "fill", label: "Fill in", icon: "✎" },
    { value: "navigate", label: "Go to page", icon: "↗" },
    { value: "assert", label: "Check for", icon: "✓" },
    { value: "wait", label: "Wait", icon: "⏱" },
  ];

  var SAMPLE_VIDEO_SRC = "sample-walkthrough.mp4";
  var SAMPLE_CLIP_DISPLAY_NAME = "Recording 2026-06-02 232143.mp4";
  var DEFAULT_SITE_URL = "https://example.com";

  var SAMPLE_TRANSCRIPT = [
    {
      t: "—",
      text:
        "This static demo does not run Whisper on your clip. The lines below are a preset checkout illustration — edit them freely; self-host Lumina for real transcription.",
    },
    { t: "0:04", text: "I'll walk through applying a promo on checkout." },
    { t: "0:12", text: "Open the checkout page and enter the customer email." },
    { t: "0:22", text: "Type SAVE10 in the promo field, then hit Apply discount." },
    { t: "0:31", text: "We should see confirmation that the total updated." },
  ];

  var DEFAULT_STEPS = [
    { id: "s1", action: "fill", target: "Email field", value: "qa@lumina.dev", selector: "#email" },
    { id: "s2", action: "fill", target: "Promo code field", value: "SAVE10", selector: "#promo" },
    { id: "s3", action: "click", target: "Apply discount button", value: "", selector: "#apply-btn" },
    { id: "s4", action: "assert", target: "Confirmation message", value: "visible", selector: "#status" },
  ];

  var FALLBACK_FRAME = "demo-target.html";
  var SAMPLE_FRAME_LABEL = "sample checkout";

  var TARGET_SELECTOR_MAP = {
    email: "#email",
    "email field": "#email",
    promo: "#promo",
    "promo code": "#promo",
    "promo code field": "#promo",
    "promo field": "#promo",
    apply: "#apply-btn",
    "apply discount": "#apply-btn",
    "apply discount button": "#apply-btn",
    "apply button": "#apply-btn",
    confirmation: "#status",
    "confirmation message": "#status",
    status: "#status",
  };

  var state = {
    steps: [],
    running: false,
    processing: false,
    demoLoaded: false,
    stepCounter: 0,
    previewUrl: null,
    frameBlocked: false,
    runOnSample: false,
    frameLoadToken: 0,
  };

  var els = {};

  function $(id) {
    return document.getElementById(id);
  }

  function wait(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  function uid() {
    state.stepCounter += 1;
    return "step-" + state.stepCounter;
  }

  function resolveSelector(target) {
    if (!target) return "";
    var key = target.trim().toLowerCase();
    if (TARGET_SELECTOR_MAP[key]) return TARGET_SELECTOR_MAP[key];
    for (var k in TARGET_SELECTOR_MAP) {
      if (key.indexOf(k) !== -1 || k.indexOf(key) !== -1) return TARGET_SELECTOR_MAP[k];
    }
    return "";
  }

  function actionMeta(action) {
    for (var i = 0; i < ACTION_TYPES.length; i++) {
      if (ACTION_TYPES[i].value === action) return ACTION_TYPES[i];
    }
    return ACTION_TYPES[0];
  }

  function validateSiteUrl(raw) {
    var trimmed = (raw || "").trim();
    if (!trimmed) return { ok: true, url: null };
    try {
      var parsed = new URL(trimmed);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return {
          ok: false,
          error: "Please use a link that starts with https:// or http://",
        };
      }
      return { ok: true, url: parsed.href };
    } catch (e) {
      return {
        ok: false,
        error:
          "That doesn't look like a web address. Try something like https://your-app.com/checkout",
      };
    }
  }

  function isSameOriginUrl(url) {
    try {
      return new URL(url, window.location.href).origin === window.location.origin;
    } catch (e) {
      return false;
    }
  }

  function formatUrlForChrome(url) {
    try {
      var u = new URL(url);
      var host = u.hostname.replace(/^www\./, "");
      var path = u.pathname === "/" ? "" : u.pathname;
      var label = host + path;
      return label.length > 42 ? label.slice(0, 39) + "…" : label;
    } catch (e) {
      return "your site";
    }
  }

  function setFrameSrc(src) {
    if (!els.frame || els.frame.getAttribute("src") === src) return;
    els.frame.setAttribute("src", src);
  }

  function updateBrowserChromeLabel(label) {
    if (els.browserStageUrl) els.browserStageUrl.textContent = label;
  }

  function showSiteUrlError(message) {
    if (!els.siteUrl || !els.siteUrlError) return;
    els.siteUrl.classList.add("is-invalid");
    els.siteUrlError.hidden = false;
    els.siteUrlError.textContent = message;
  }

  function hideSiteUrlError() {
    if (!els.siteUrl || !els.siteUrlError) return;
    els.siteUrl.classList.remove("is-invalid");
    els.siteUrlError.hidden = true;
    els.siteUrlError.textContent = "";
  }

  function showFrameNotice(kind, message) {
    if (!els.frameNotice) return;
    els.frameNotice.hidden = false;
    els.frameNotice.textContent = message;
    els.frameNotice.className = "frame-notice";
    if (kind === "warn") els.frameNotice.classList.add("frame-notice--warn");
    if (kind === "error") els.frameNotice.classList.add("frame-notice--error");
  }

  function hideFrameNotice() {
    if (!els.frameNotice) return;
    els.frameNotice.hidden = true;
    els.frameNotice.textContent = "";
    els.frameNotice.className = "frame-notice";
  }

  function isEmbedLikelyBlocked(url) {
    try {
      var host = new URL(url).hostname.replace(/^www./, "").toLowerCase();
      return host === "example.com" || host === "example.org";
    } catch (e) {
      return false;
    }
  }

  function setDefaultSiteUrl() {
    if (els.siteUrl) els.siteUrl.value = DEFAULT_SITE_URL;
    hideSiteUrlError();
  }

  function loadPreviewUrl(url, showLoading) {
    state.previewUrl = url || null;
    state.frameBlocked = false;
    state.frameLoadToken += 1;
    var token = state.frameLoadToken;

    if (!url) {
      hideFrameNotice();
      state.runOnSample = false;
      updateBrowserChromeLabel(SAMPLE_FRAME_LABEL);
      setFrameSrc(FALLBACK_FRAME);
      return;
    }

    updateBrowserChromeLabel(formatUrlForChrome(url));
    state.runOnSample = !isSameOriginUrl(url);

    if (showLoading) showFrameNotice("info", "Loading your site in the preview…");

    setFrameSrc(url);

    if (isEmbedLikelyBlocked(url)) {
      window.setTimeout(function () {
        if (token !== state.frameLoadToken) return;
        showFrameNotice(
          "warn",
          "example.com blocks embedded previews (X-Frame-Options). Your recording plays above; when you run the test, steps replay on our sample checkout page."
        );
      }, 600);
    } else if (state.runOnSample) {
      window.setTimeout(function () {
        if (token !== state.frameLoadToken) return;
        showFrameNotice(
          "info",
          "If the preview looks empty, that site blocks embedded views. When you run the test, steps play on our sample checkout so you can see Lumina in action."
        );
      }, 1500);
    }
  }

  function onFrameLoad() {
    if (!els.frame || !state.previewUrl) return;

    var blocked = false;
    try {
      var doc = els.frame.contentDocument;
      if (!doc || !doc.body || !doc.body.childNodes.length) blocked = true;
    } catch (e) {
      try {
        var loc = els.frame.contentWindow.location.href;
        if (loc === "about:blank" || loc === "") blocked = true;
      } catch (e2) {
        return;
      }
    }

    if (!blocked) return;

    state.frameBlocked = true;
    state.previewUrl = null;
    state.runOnSample = false;
    showFrameNotice(
      "warn",
      "This site can't be shown inside the preview — many sites block that for security. We're showing our sample checkout instead."
    );
    updateBrowserChromeLabel(SAMPLE_FRAME_LABEL);
    setFrameSrc(FALLBACK_FRAME);
  }

  function applySiteUrlFromInput() {
    var raw = els.siteUrl ? els.siteUrl.value : "";
    var result = validateSiteUrl(raw);
    if (!result.ok) {
      showSiteUrlError(result.error);
      return result;
    }
    hideSiteUrlError();
    return result;
  }

  function onSiteUrlChange() {
    var result = applySiteUrlFromInput();
    if (!result.ok) return;
    loadPreviewUrl(result.url, true);
  }

  async function ensureRunnableFrame() {
    if (!state.runOnSample && !state.frameBlocked) {
      var doc = getFrameDoc();
      if (doc) return doc;
    }
    setFrameSrc(FALLBACK_FRAME);
    updateBrowserChromeLabel(SAMPLE_FRAME_LABEL);
    await wait(400);
    return getFrameDoc();
  }

  function bind() {
    els.demoClip = $("demo-clip");
    els.demoIdle = $("demo-idle");
    els.demoProgress = $("demo-progress");
    els.videoName = $("video-name");
    els.progressFill = $("progress-fill");
    els.progressPct = $("progress-pct");
    els.videoThumb = $("video-thumb");
    els.transcriptPanel = $("transcript-panel");
    els.transcript = $("demo-transcript");
    els.stepList = $("step-list");
    els.editorEmpty = $("editor-empty");
    els.runBtn = $("run-test");
    els.resetBtn = $("reset-app");
    els.results = $("demo-results");
    els.frame = $("demo-frame");
    els.pipeline = $("pipeline");
    els.status = $("app-status");
    els.addStepBtn = $("add-step");
    els.startDemoInline = $("start-demo-inline");
    els.resultsPanel = $("results-panel");
    els.siteUrl = $("site-url");
    els.siteUrlError = $("site-url-error");
    els.frameNotice = $("frame-notice");
    els.browserStageUrl = $("browser-stage-url");
    els.demoVideoPlayer = $("demo-video-player");
    els.sampleVideo = $("sample-video");

    if (!els.demoClip) return;

    setDefaultSiteUrl();

    [els.startDemoInline].filter(Boolean).forEach(function (btn) {
      btn.addEventListener("click", startDemo);
    });
    if (els.runBtn) els.runBtn.addEventListener("click", runTest);
    if (els.resetBtn) els.resetBtn.addEventListener("click", resetApp);
    if (els.addStepBtn) els.addStepBtn.addEventListener("click", addBlankStep);
    if (els.siteUrl) {
      els.siteUrl.addEventListener("change", onSiteUrlChange);
      els.siteUrl.addEventListener("blur", onSiteUrlChange);
    }
    if (els.frame) els.frame.addEventListener("load", onFrameLoad);
    window.addEventListener("hashchange", maybeAutoStartDemo);
    updateBrowserChromeLabel(SAMPLE_FRAME_LABEL);
    setFrameSrc(FALLBACK_FRAME);
  }

  function isAppSection() {
    return location.hash === "#app";
  }

  function maybeAutoStartDemo() {
    if (!isAppSection() || state.demoLoaded || state.processing) return;
    startDemo();
  }

  function setPipeline(stage, label) {
    if (!els.pipeline) return;
    var order = ["load", "transcribe", "steps", "run"];
    var idx = order.indexOf(stage);
    els.pipeline.querySelectorAll("[data-stage]").forEach(function (node) {
      var s = node.getAttribute("data-stage");
      var si = order.indexOf(s);
      node.classList.remove("is-active", "is-done");
      if (si < idx) node.classList.add("is-done");
      if (si === idx) node.classList.add("is-active");
    });
    if (els.status) els.status.textContent = label;
  }

  function animateProgress(from, to, duration) {
    return new Promise(function (resolve) {
      var start = performance.now();
      function tick() {
        var now = performance.now();
        var t = Math.min(1, (now - start) / duration);
        var val = from + (to - from) * t;
        if (els.progressFill) els.progressFill.style.width = val + "%";
        if (els.progressPct) els.progressPct.textContent = Math.round(val) + "%";
        if (t < 1) setTimeout(tick, 16);
        else resolve();
      }
      tick();
    });
  }

  function mountThumbVideo(container) {
    if (!container) return;
    container.innerHTML = "";
    var video = document.createElement("video");
    video.className = "demo-clip__thumb-video";
    video.src = SAMPLE_VIDEO_SRC;
    video.muted = true;
    video.playsInline = true;
    video.preload = "metadata";
    video.setAttribute("aria-label", "Walkthrough preview");
    container.appendChild(video);
    video.addEventListener("loadeddata", function () {
      try {
        video.currentTime = Math.min(0.5, video.duration || 0.5);
      } catch (e) {}
    });
  }

  function showProgressUI() {
    if (els.demoIdle) els.demoIdle.hidden = true;
    if (els.demoProgress) els.demoProgress.hidden = false;
    if (els.demoVideoPlayer) els.demoVideoPlayer.hidden = true;
    if (els.videoName) els.videoName.textContent = SAMPLE_CLIP_DISPLAY_NAME;
    mountThumbVideo(els.videoThumb);
  }

  function showWalkthroughVideo() {
    if (els.demoProgress) els.demoProgress.hidden = true;
    if (els.demoVideoPlayer) els.demoVideoPlayer.hidden = false;
    if (els.sampleVideo) {
      if (!els.sampleVideo.getAttribute("src")) els.sampleVideo.setAttribute("src", SAMPLE_VIDEO_SRC);
      els.sampleVideo.play().catch(function () {});
    }
  }

  function hideWalkthroughVideo() {
    if (els.demoVideoPlayer) els.demoVideoPlayer.hidden = true;
    if (els.sampleVideo) {
      els.sampleVideo.pause();
      els.sampleVideo.currentTime = 0;
    }
  }

  async function startDemo() {
    if (state.processing || state.demoLoaded) return;

    var urlCheck = applySiteUrlFromInput();
    if (!urlCheck.ok) return;

    state.processing = true;
    loadPreviewUrl(urlCheck.url, true);
    showProgressUI();
    setPipeline("load", "Loading your walkthrough recording…");
    await animateProgress(0, 100, 800);

    setPipeline("transcribe", "Loading preset transcript (Whisper needs self-hosted Lumina)…");
    await animateProgress(0, 100, 1400);
    renderTranscript();

    setPipeline("steps", "Loading preset checkout steps you can edit…");
    await wait(900);
    state.steps = DEFAULT_STEPS.map(function (s) {
      return { id: uid(), action: s.action, target: s.target, value: s.value, selector: s.selector };
    });
    renderSteps();
    els.transcriptPanel.hidden = false;
    els.runBtn.disabled = false;

    showWalkthroughVideo();
    setPipeline(
      "steps",
      "Ready — your recording plays above; steps and transcript are presets until you self-host Lumina."
    );
    state.processing = false;
    state.demoLoaded = true;
  }

  function renderTranscript() {
    if (!els.transcript) return;
    els.transcript.innerHTML = SAMPLE_TRANSCRIPT.map(function (line) {
      return (
        '<div class="transcript-line">' +
        '<time>' + line.t + "</time>" +
        "<p>" + line.text + "</p></div>"
      );
    }).join("");
  }

  function renderSteps() {
    if (!els.stepList) return;
    var hasSteps = state.steps.length > 0;
    if (els.editorEmpty) els.editorEmpty.hidden = hasSteps;
    els.stepList.innerHTML = "";

    state.steps.forEach(function (step, index) {
      var meta = actionMeta(step.action);
      var li = document.createElement("li");
      li.className = "step-card";
      li.dataset.id = step.id;
      if (step._highlight) li.classList.add("step-card--running");

      var needsValue = step.action === "fill" || step.action === "navigate" || step.action === "assert" || step.action === "wait";
      var valueLabel = step.action === "navigate" ? "URL" : step.action === "wait" ? "Seconds" : step.action === "assert" ? "Expected" : "Value";

      li.innerHTML =
        '<div class="step-card__toolbar">' +
        '<span class="step-card__num">' + (index + 1) + "</span>" +
        '<span class="step-icon step-icon--' + step.action + '" aria-hidden="true">' + meta.icon + "</span>" +
        '<select class="step-card__action" data-field="action" aria-label="Action type">' +
        ACTION_TYPES.map(function (a) {
          return '<option value="' + a.value + '"' + (a.value === step.action ? " selected" : "") + ">" + a.label + "</option>";
        }).join("") +
        "</select>" +
        '<div class="step-card__reorder">' +
        '<button type="button" class="icon-btn" data-move="up" aria-label="Move step up"' + (index === 0 ? " disabled" : "") + ">↑</button>" +
        '<button type="button" class="icon-btn" data-move="down" aria-label="Move step down"' + (index === state.steps.length - 1 ? " disabled" : "") + ">↓</button>" +
        "</div>" +
        '<button type="button" class="icon-btn icon-btn--danger" data-remove aria-label="Remove step">×</button>' +
        "</div>" +
        '<label class="step-card__field">' +
        "<span>What to interact with</span>" +
        '<input type="text" data-field="target" value="' + escapeAttr(step.target) + '" placeholder="e.g. Email field, Submit button" />' +
        "</label>" +
        (needsValue
          ? '<label class="step-card__field">' +
            "<span>" + valueLabel + "</span>" +
            '<input type="text" data-field="value" value="' + escapeAttr(step.value) + '" placeholder="' + (step.action === "wait" ? "2" : "Enter value") + '" />' +
            "</label>"
          : "") +
        "";

      els.stepList.appendChild(li);
    });

    els.stepList.querySelectorAll(".step-card").forEach(function (card) {
      var id = card.dataset.id;
      card.querySelectorAll("[data-field]").forEach(function (input) {
        input.addEventListener("change", function () {
          updateStep(id, input.dataset.field, input.value);
        });
        input.addEventListener("input", function () {
          if (input.dataset.field === "target") updateStep(id, "target", input.value, true);
        });
      });
      card.querySelectorAll("[data-move]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          moveStep(id, btn.dataset.move);
        });
      });
      var removeBtn = card.querySelector("[data-remove]");
      if (removeBtn) removeBtn.addEventListener("click", function () { removeStep(id); });
    });
  }

  function escapeAttr(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;");
  }

  function updateStep(id, field, value, silent) {
    var step = state.steps.find(function (s) { return s.id === id; });
    if (!step) return;
    step[field] = value;
    if (field === "action" || field === "target") {
      step.selector = resolveSelector(step.target);
      if (!silent) renderSteps();
    }
  }

  function moveStep(id, dir) {
    var idx = state.steps.findIndex(function (s) { return s.id === id; });
    if (idx < 0) return;
    var next = dir === "up" ? idx - 1 : idx + 1;
    if (next < 0 || next >= state.steps.length) return;
    var tmp = state.steps[idx];
    state.steps[idx] = state.steps[next];
    state.steps[next] = tmp;
    renderSteps();
  }

  function removeStep(id) {
    state.steps = state.steps.filter(function (s) { return s.id !== id; });
    renderSteps();
    if (state.steps.length === 0) els.runBtn.disabled = true;
  }

  function addBlankStep() {
    state.steps.push({
      id: uid(),
      action: "click",
      target: "",
      value: "",
      selector: "",
    });
    renderSteps();
    els.runBtn.disabled = false;
    if (els.editorEmpty) els.editorEmpty.hidden = true;
  }

  function getFrameDoc() {
    if (!els.frame || !els.frame.contentWindow) return null;
    try {
      return els.frame.contentWindow.document;
    } catch (e) {
      return null;
    }
  }

  function highlightInFrame(selector, on) {
    var doc = getFrameDoc();
    if (!doc || !selector) return;
    var el = doc.querySelector(selector);
    if (!el) return;
    if (on) el.classList.add("lumina-highlight");
    else el.classList.remove("lumina-highlight");
  }

  function resetFrame() {
    var doc = getFrameDoc();
    if (!doc) return;
    doc.querySelectorAll(".lumina-highlight").forEach(function (n) {
      n.classList.remove("lumina-highlight");
    });
    var email = doc.getElementById("email");
    var promo = doc.getElementById("promo");
    var status = doc.getElementById("status");
    if (email) email.value = "";
    if (promo) promo.value = "";
    if (status) {
      status.hidden = true;
      status.textContent = "";
    }
  }

  function runStep(step, doc) {
    var selector = step.selector || resolveSelector(step.target);
    var action = step.action;

    if (action === "wait") {
      var secs = parseFloat(step.value) || 1;
      return wait(secs * 1000).then(function () {
        return { ok: true, detail: "Waited " + secs + "s" };
      });
    }

    if (action === "navigate") {
      return Promise.resolve({ ok: true, detail: "Navigated to " + (step.value || "page") + " (simulated in demo)" });
    }

    var el = selector ? doc.querySelector(selector) : null;
    highlightInFrame(selector, true);

    if (action === "fill" && el) {
      el.value = step.value;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return Promise.resolve({ ok: true, detail: 'Entered "' + step.value + '" in ' + step.target });
    }
    if (action === "click" && el) {
      el.click();
      return Promise.resolve({ ok: true, detail: "Clicked " + step.target });
    }
    if (action === "assert" && el) {
      var visible = !el.hidden && el.textContent.trim().length > 0;
      return Promise.resolve({
        ok: visible,
        detail: visible ? step.target + " appeared" : step.target + " not found",
      });
    }
    return Promise.resolve({ ok: false, detail: "Could not find: " + (step.target || selector || "element") });
  }

  function appendResult(row) {
    if (!els.results) return;
    var empty = els.results.querySelector(".run-results__empty");
    if (empty) empty.remove();
    var item = document.createElement("div");
    item.className = "result-row result-row--" + (row.ok ? "pass" : "fail");
    var meta = actionMeta(row.action);
    item.innerHTML =
      '<span class="result-row__step">' + meta.icon + " Step " + row.step + "</span>" +
      '<span class="result-row__action">' + meta.label + "</span>" +
      '<span class="result-row__detail">' + row.detail + "</span>";
    els.results.appendChild(item);
  }

  function setRunningStep(id) {
    state.steps.forEach(function (s) { delete s._highlight; });
    if (id) {
      var step = state.steps.find(function (s) { return s.id === id; });
      if (step) step._highlight = true;
    }
    renderSteps();
  }

  async function runTest() {
    if (state.running || state.steps.length === 0) return;
    state.running = true;
    els.runBtn.disabled = true;
    if (els.results) els.results.innerHTML = "";
    if (els.resultsPanel) els.resultsPanel.hidden = false;

    setPipeline("run", "Running steps in the live browser…");
    resetFrame();

    var doc = await ensureRunnableFrame();
    if (!doc) {
      appendResult({ step: 0, action: "setup", ok: false, detail: "Browser preview failed to load. Refresh and try again." });
      finishRun();
      return;
    }

    for (var i = 0; i < state.steps.length; i++) {
      var step = state.steps[i];
      setRunningStep(step.id);
      await wait(400);
      var outcome = await runStep(step, doc);
      highlightInFrame(step.selector || resolveSelector(step.target), false);
      appendResult({
        step: i + 1,
        action: step.action,
        ok: outcome.ok,
        detail: outcome.detail,
      });
      if (!outcome.ok) break;
      await wait(300);
    }

    setRunningStep(null);
    setPipeline("run", "Test complete — all steps finished.");
    finishRun();
  }

  function finishRun() {
    state.running = false;
    if (state.steps.length > 0) els.runBtn.disabled = false;
  }

  function resetApp() {
    state.steps = [];
    state.processing = false;
    state.demoLoaded = false;
    if (els.demoIdle) els.demoIdle.hidden = false;
    if (els.demoProgress) els.demoProgress.hidden = true;
    hideWalkthroughVideo();
    if (els.transcriptPanel) els.transcriptPanel.hidden = true;
    if (els.results) els.results.innerHTML = '<p class="run-results__empty">Results appear here after you run the test.</p>';
    if (els.progressFill) els.progressFill.style.width = "0%";
    if (els.progressPct) els.progressPct.textContent = "0%";
    if (els.resultsPanel) els.resultsPanel.hidden = true;
    renderSteps();
    resetFrame();
    state.previewUrl = null;
    state.frameBlocked = false;
    state.runOnSample = false;
    setDefaultSiteUrl();
    loadPreviewUrl(null, false);
    els.runBtn.disabled = true;
    setPipeline("load", "Press Start demo to load your recording and preview example.com.");
    if (isAppSection()) startDemo();
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

  document.addEventListener("DOMContentLoaded", function () {
    bind();
    initHeroPreview();
    if (!els.demoClip) return;
    if (isAppSection()) {
      var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      setTimeout(startDemo, reduced ? 0 : 400);
    } else {
      setPipeline("load", "Press Start demo to load your recording and preview example.com.");
    }
  });
})();
