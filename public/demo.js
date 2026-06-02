(function () {
  "use strict";

  var ACTION_TYPES = [
    { value: "click", label: "Click", icon: "◎" },
    { value: "fill", label: "Fill in", icon: "✎" },
    { value: "navigate", label: "Go to page", icon: "↗" },
    { value: "assert", label: "Check for", icon: "✓" },
    { value: "wait", label: "Wait", icon: "⏱" },
  ];

  var SAMPLE_VIDEO_PATH = "sample-walkthrough.mp4";
  var SAMPLE_CLIP_NAME = "Recording 2026-06-02 232143.mp4";
  var FALLBACK_FRAME = "demo-target.html";
  var SAMPLE_FRAME_LABEL = "sample checkout";
  var PIPELINE_ORDER = ["upload", "transcribe", "steps", "run"];

  var SAMPLE_TRANSCRIPT = [
    {
      t: "—",
      text:
        "This static demo does not run Whisper in the browser. The lines below are a preset checkout illustration — self-host Lumina for real transcription.",
    },
    { t: "0:04", text: "I'll walk through applying a promo on checkout." },
    { t: "0:12", text: "Open the checkout page and enter the customer email." },
    { t: "0:22", text: "Type SAVE10 in the promo field, then hit Apply discount." },
    { t: "0:31", text: "We should see confirmation that the total updated." },
  ];

  var DEFAULT_STEPS = [
    { action: "fill", target: "Email field", value: "qa@lumina.dev", selector: "#email" },
    { action: "fill", target: "Promo code field", value: "SAVE10", selector: "#promo" },
    { action: "click", target: "Apply discount button", value: "", selector: "#apply-btn" },
    { action: "assert", target: "Confirmation message", value: "visible", selector: "#status" },
  ];

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
    clipLoaded: false,
    videoUrl: null,
    stepCounter: 0,
    previewUrl: null,
    previewReady: false,
    frameAccess: "unknown",
    frameBlocked: false,
    usingFallback: false,
    frameLoadToken: 0,
  };

  var expandedSteps = {};
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

  function escapeAttr(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;");
  }

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function stepSummary(step) {
    var meta = actionMeta(step.action);
    var target = step.target || "element";
    if (step.value && (step.action === "fill" || step.action === "navigate")) {
      return meta.label + " · " + target + " → " + step.value;
    }
    return meta.label + " · " + target;
  }

  function isStepExpanded(id, index) {
    if (expandedSteps[id] !== undefined) return expandedSteps[id];
    return state.steps.length <= 2 || index === 0;
  }

  function normalizeUrl(raw) {
    var trimmed = (raw || "").trim();
    if (!trimmed) return { ok: true, url: null };
    if (/^demo-target\.html$/i.test(trimmed)) {
      return { ok: true, url: new URL(FALLBACK_FRAME, window.location.href).href };
    }
    var candidate = /^https?:\/\//i.test(trimmed) ? trimmed : "https://" + trimmed;
    try {
      var parsed = new URL(candidate);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return { ok: false, error: "Please enter a web address (http:// or https://)." };
      }
      return { ok: true, url: parsed.href };
    } catch (e) {
      return { ok: false, error: "That doesn't look like a valid URL. Try https://your-app.com/checkout" };
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
    if (!url) return SAMPLE_FRAME_LABEL;
    try {
      var u = new URL(url);
      if (u.pathname.endsWith(FALLBACK_FRAME)) return SAMPLE_FRAME_LABEL;
      var label = u.hostname.replace(/^www\./, "") + (u.pathname === "/" ? "" : u.pathname);
      return label.length > 42 ? label.slice(0, 39) + "…" : label;
    } catch (e) {
      return "your site";
    }
  }

  function setFrameSrc(src) {
    if (els.frame && els.frame.getAttribute("src") !== src) els.frame.setAttribute("src", src);
  }

  function showSiteUrlError(message) {
    if (!els.siteUrl) return;
    els.siteUrl.classList.add("is-invalid");
    if (els.siteUrlField) els.siteUrlField.classList.add("site-url-field--required");
    if (els.siteUrlError) {
      els.siteUrlError.hidden = false;
      els.siteUrlError.textContent = message;
    }
  }

  function hideSiteUrlError() {
    if (!els.siteUrl) return;
    els.siteUrl.classList.remove("is-invalid");
    if (els.siteUrlField) els.siteUrlField.classList.remove("site-url-field--required");
    if (els.siteUrlError) {
      els.siteUrlError.hidden = true;
      els.siteUrlError.textContent = "";
    }
  }

  function showFrameNotice(kind, html) {
    if (!els.frameNotice) return;
    els.frameNotice.hidden = false;
    els.frameNotice.innerHTML = html;
    els.frameNotice.className =
      "frame-notice" +
      (kind === "warn" ? " frame-notice--warn" : kind === "error" ? " frame-notice--error" : "");
    var btn = els.frameNotice.querySelector("[data-use-sample-checkout]");
    if (btn) btn.addEventListener("click", useSampleCheckout);
  }

  function hideFrameNotice() {
    if (!els.frameNotice) return;
    els.frameNotice.hidden = true;
    els.frameNotice.innerHTML = "";
    els.frameNotice.className = "frame-notice";
  }

  function blockedNoticeHtml() {
    return (
      "<strong>This site can't be embedded here.</strong> Many pages block iframe previews. " +
      '<span class="frame-notice__actions"><button type="button" class="link-btn" data-use-sample-checkout>Use sample checkout instead</button></span>'
    );
  }

  function crossOriginNoticeHtml() {
    return (
      "<strong>Preview loaded, but step replay can't control this page.</strong> Cross-origin iframes block script access. " +
      '<button type="button" class="link-btn" data-use-sample-checkout>Use sample checkout</button> to see the full demo.'
    );
  }

  function assessFrameAccess() {
    if (!els.frame) return "missing";
    try {
      var doc = els.frame.contentDocument || els.frame.contentWindow.document;
      if (!doc || !doc.body || !doc.body.childNodes.length) return "blocked";
      return "ok";
    } catch (e) {
      return state.previewUrl && !isSameOriginUrl(state.previewUrl) ? "cross-origin" : "blocked";
    }
  }

  function loadPreviewUrl(url, showLoading) {
    state.frameLoadToken += 1;
    var token = state.frameLoadToken;
    state.previewUrl = url;
    state.previewReady = false;
    state.frameBlocked = false;
    state.usingFallback = !url;
    var targetUrl = url || new URL(FALLBACK_FRAME, window.location.href).href;
    if (els.browserStageUrl) els.browserStageUrl.textContent = formatUrlForChrome(url);
    if (showLoading && url) showFrameNotice("info", "Loading your site in the live preview…");
    else if (!url) hideFrameNotice();

    return new Promise(function (resolve) {
      if (!els.frame) {
        resolve({ ok: false });
        return;
      }
      var timeout = setTimeout(function () {
        finish({ ok: false, reason: "timeout" });
      }, 15000);

      function finish(result) {
        clearTimeout(timeout);
        els.frame.removeEventListener("load", onLoad);
        resolve(result);
      }

      function onLoad() {
        setTimeout(function () {
          if (token !== state.frameLoadToken) return;
          var access = assessFrameAccess();
          state.frameAccess = access;
          if (access === "ok") {
            hideFrameNotice();
            state.previewReady = true;
            finish({ ok: true, access: access });
            return;
          }
          if (access === "cross-origin" && url) {
            state.previewReady = true;
            showFrameNotice("warn", crossOriginNoticeHtml());
            finish({ ok: true, access: access, crossOrigin: true });
            return;
          }
          state.frameBlocked = true;
          showFrameNotice("error", blockedNoticeHtml());
          finish({ ok: false, reason: "blocked", access: access });
        }, 350);
      }

      var currentSrc = els.frame.getAttribute("src") || "";
      if (currentSrc === targetUrl) {
        onLoad();
      } else {
        els.frame.addEventListener("load", onLoad);
        setFrameSrc(targetUrl);
      }
    });
  }

  function useSampleCheckout() {
    if (els.siteUrl) els.siteUrl.value = "";
    hideSiteUrlError();
    state.previewUrl = null;
    state.frameBlocked = false;
    state.usingFallback = true;
    loadPreviewUrl(null, false);
    if (els.status && !state.clipLoaded) {
      els.status.textContent = "Sample checkout loaded — upload a clip or click Run sample.";
    }
  }

  function applySiteUrlFromInput() {
    var result = normalizeUrl(els.siteUrl ? els.siteUrl.value : "");
    if (!result.ok) showSiteUrlError(result.error);
    else hideSiteUrlError();
    return result;
  }

  async function onLoadPreviewClick() {
    var result = applySiteUrlFromInput();
    if (!result.ok) return;
    if (els.loadPreviewBtn) els.loadPreviewBtn.disabled = true;
    await loadPreviewUrl(result.url, !!result.url);
    if (els.loadPreviewBtn) els.loadPreviewBtn.disabled = false;
    if (els.status && !state.clipLoaded) {
      els.status.textContent = result.url
        ? "Preview loaded — upload a clip or click Run sample."
        : "Sample checkout loaded — upload a clip or click Run sample.";
    }
  }

  async function ensurePreviewBeforeRun() {
    if (state.previewReady && !state.frameBlocked) return true;
    var result = applySiteUrlFromInput();
    if (!result.ok) return false;
    var outcome = await loadPreviewUrl(result.url, !!result.url);
    return outcome.ok || outcome.crossOrigin;
  }

  async function ensureRunnableFrame() {
    var doc = getFrameDoc();
    if (doc && state.frameAccess === "ok" && !state.usingFallback) return doc;
    if (state.previewUrl && state.frameAccess === "cross-origin") {
      showFrameNotice("warn", crossOriginNoticeHtml());
    }
    setFrameSrc(new URL(FALLBACK_FRAME, window.location.href).href);
    state.usingFallback = true;
    if (els.browserStageUrl) els.browserStageUrl.textContent = SAMPLE_FRAME_LABEL;
    await wait(450);
    return getFrameDoc();
  }

  function bind() {
    els.app = $("app");
    els.uploadZone = $("upload-zone");
    els.uploadDrop = $("upload-drop");
    els.videoInput = $("video-input");
    els.browseBtn = $("browse-btn");
    els.uploadProgress = $("upload-progress");
    els.uploadPlayer = $("upload-player");
    els.clipVideo = $("clip-video");
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
    els.resultsPanel = $("results-panel");
    els.frame = $("demo-frame");
    els.pipeline = $("pipeline");
    els.status = $("app-status");
    els.addStepBtn = $("add-step");
    els.runSampleBtn = $("run-sample");
    els.siteUrl = $("site-url");
    els.siteUrlField = $("site-url-field");
    els.siteUrlError = $("site-url-error");
    els.loadPreviewBtn = $("load-preview-url");
    els.frameNotice = $("frame-notice");
    els.browserStageUrl = $("browser-stage-url");

    if (!els.app || !els.frame) return;

    if (els.browseBtn && els.videoInput) {
      els.browseBtn.addEventListener("click", function () {
        els.videoInput.click();
      });
      els.videoInput.addEventListener("change", onFileSelected);
    }
    if (els.uploadDrop) {
      els.uploadDrop.addEventListener("dragover", onDragOver);
      els.uploadDrop.addEventListener("dragleave", onDragLeave);
      els.uploadDrop.addEventListener("drop", onDrop);
    }
    if (els.runBtn) els.runBtn.addEventListener("click", runTest);
    if (els.resetBtn) els.resetBtn.addEventListener("click", resetApp);
    if (els.addStepBtn) els.addStepBtn.addEventListener("click", addBlankStep);
    if (els.runSampleBtn) els.runSampleBtn.addEventListener("click", runSample);
    if (els.loadPreviewBtn) els.loadPreviewBtn.addEventListener("click", onLoadPreviewClick);
    if (els.siteUrl) {
      els.siteUrl.addEventListener("keydown", function (e) {
        if (e.key === "Enter") {
          e.preventDefault();
          onLoadPreviewClick();
        }
      });
    }
  }

  function onDragOver(e) {
    e.preventDefault();
    if (els.uploadZone) els.uploadZone.classList.add("is-dragover");
  }

  function onDragLeave() {
    if (els.uploadZone) els.uploadZone.classList.remove("is-dragover");
  }

  function onDrop(e) {
    e.preventDefault();
    if (els.uploadZone) els.uploadZone.classList.remove("is-dragover");
    var file = e.dataTransfer.files[0];
    if (file) processVideo(file);
  }

  function onFileSelected(e) {
    var file = e.target.files[0];
    if (file) processVideo(file);
  }

  function setPipeline(stage, label) {
    if (!els.pipeline) return;
    var idx = PIPELINE_ORDER.indexOf(stage);
    els.pipeline.querySelectorAll("[data-stage]").forEach(function (node) {
      var si = PIPELINE_ORDER.indexOf(node.getAttribute("data-stage"));
      node.classList.remove("is-active", "is-done");
      if (si >= 0 && si < idx) node.classList.add("is-done");
      if (si === idx) node.classList.add("is-active");
    });
    if (els.status) els.status.textContent = label;
  }

  function animateProgress(from, to, duration) {
    return new Promise(function (resolve) {
      var start = performance.now();
      function tick(now) {
        var t = Math.min(1, (now - start) / duration);
        var val = from + (to - from) * t;
        if (els.progressFill) els.progressFill.style.width = val + "%";
        if (els.progressPct) els.progressPct.textContent = Math.round(val) + "%";
        if (t < 1) requestAnimationFrame(tick);
        else resolve();
      }
      requestAnimationFrame(tick);
    });
  }

  function showClipPlayer(src, isBlob) {
    if (els.uploadDrop) els.uploadDrop.hidden = true;
    if (els.uploadProgress) els.uploadProgress.hidden = false;
    if (els.uploadPlayer) els.uploadPlayer.hidden = false;
    if (els.clipVideo) {
      if (isBlob && state.videoUrl) URL.revokeObjectURL(state.videoUrl);
      if (isBlob) {
        state.videoUrl = src;
        els.clipVideo.src = src;
      } else {
        els.clipVideo.removeAttribute("src");
        els.clipVideo.innerHTML = '<source src="' + escapeAttr(src) + '" type="video/mp4" />';
        els.clipVideo.load();
      }
    }
    if (els.videoThumb) els.videoThumb.hidden = true;
  }

  function showUploadUI(file) {
    if (els.videoName) els.videoName.textContent = file.name;
    showClipPlayer(URL.createObjectURL(file), true);
  }

  function showUploadIdleUI() {
    if (els.uploadDrop) els.uploadDrop.hidden = false;
    if (els.uploadProgress) els.uploadProgress.hidden = true;
    if (els.uploadPlayer) els.uploadPlayer.hidden = true;
    if (els.videoThumb) els.videoThumb.hidden = false;
  }

  async function processVideo(file, opts) {
    opts = opts || {};
    if (state.processing) return;

    if (!opts.useBundledSample) {
      var valid = /^video\/(mp4|webm)$/i.test(file.type) || /\.(mp4|webm)$/i.test(file.name);
      if (!valid) {
        if (els.status) els.status.textContent = "Please upload an MP4 or WebM screen recording.";
        return;
      }
    }

    state.processing = true;
    state.clipLoaded = false;

    if (opts.useBundledSample) {
      if (els.videoName) els.videoName.textContent = SAMPLE_CLIP_NAME;
      showClipPlayer(SAMPLE_VIDEO_PATH, false);
    } else {
      showUploadUI(file);
    }

    setPipeline("upload", opts.useBundledSample ? "Loading sample walkthrough…" : "Loading your clip…");
    await animateProgress(0, 100, 800);

    setPipeline(
      "transcribe",
      "Showing preset transcript — Whisper needs self-hosted Lumina; we can't transcribe in the browser."
    );
    await animateProgress(0, 100, 1400);
    renderTranscript();
    if (els.transcriptPanel) els.transcriptPanel.hidden = false;

    setPipeline("steps", "Loading preset checkout steps you can edit…");
    await wait(900);
    expandedSteps = {};
    state.steps = DEFAULT_STEPS.map(function (s) {
      return { id: uid(), action: s.action, target: s.target, value: s.value, selector: s.selector };
    });
    renderSteps();
    if (els.runBtn) els.runBtn.disabled = false;

    setPipeline(
      "steps",
      "Ready — your video plays above; transcript and steps are presets until you self-host Lumina."
    );
    state.processing = false;
    state.clipLoaded = true;
  }

  async function runSample() {
    if (state.processing) return;
    await loadPreviewUrl(
      normalizeUrl(els.siteUrl ? els.siteUrl.value : "").url,
      !!(els.siteUrl && els.siteUrl.value.trim())
    );
    await processVideo(null, { useBundledSample: true });
  }

  function renderTranscript() {
    if (!els.transcript) return;
    els.transcript.innerHTML = SAMPLE_TRANSCRIPT.map(function (line) {
      return (
        '<div class="transcript-line">' +
        "<time>" +
        line.t +
        "</time>" +
        "<p>" +
        line.text +
        "</p></div>"
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
      var expanded = isStepExpanded(step.id, index) || step._highlight;
      var li = document.createElement("li");
      li.className = "step-card" + (expanded ? " step-card--expanded" : " step-card--collapsed");
      li.dataset.id = step.id;
      if (step._highlight) li.classList.add("step-card--running");

      var needsValue =
        step.action === "fill" ||
        step.action === "navigate" ||
        step.action === "assert" ||
        step.action === "wait";
      var valueLabel =
        step.action === "navigate"
          ? "Page URL"
          : step.action === "wait"
            ? "Wait (seconds)"
            : step.action === "assert"
              ? "Should show"
              : "With value";

      li.innerHTML =
        '<button type="button" class="step-card__header" data-toggle aria-expanded="' +
        expanded +
        '">' +
        '<span class="step-card__num">' +
        (index + 1) +
        "</span>" +
        '<span class="step-icon step-icon--' +
        step.action +
        '" aria-hidden="true">' +
        meta.icon +
        "</span>" +
        '<span class="step-card__summary">' +
        escapeHtml(stepSummary(step)) +
        "</span>" +
        '<span class="step-card__chevron" aria-hidden="true"></span>' +
        "</button>" +
        '<div class="step-card__body">' +
        '<div class="step-card__toolbar">' +
        '<label class="step-card__field step-card__field--action">Action<select class="step-card__select" data-field="action" aria-label="Action type">' +
        ACTION_TYPES.map(function (a) {
          return (
            '<option value="' +
            a.value +
            '"' +
            (a.value === step.action ? " selected" : "") +
            ">" +
            a.label +
            "</option>"
          );
        }).join("") +
        "</select></label>" +
        '<div class="step-card__reorder" role="group" aria-label="Reorder step">' +
        '<button type="button" class="icon-btn" data-move="up" aria-label="Move step up"' +
        (index === 0 ? " disabled" : "") +
        ">↑</button>" +
        '<button type="button" class="icon-btn" data-move="down" aria-label="Move step down"' +
        (index === state.steps.length - 1 ? " disabled" : "") +
        ">↓</button>" +
        '<button type="button" class="icon-btn icon-btn--danger" data-remove aria-label="Remove step">×</button>' +
        "</div></div>" +
        '<label class="step-card__field">On<input type="text" data-field="target" value="' +
        escapeAttr(step.target) +
        '" placeholder="e.g. Email field, Submit button" /></label>' +
        (needsValue
          ? '<label class="step-card__field">' +
            valueLabel +
            '<input type="text" data-field="value" value="' +
            escapeAttr(step.value) +
            '" placeholder="' +
            (step.action === "wait" ? "2" : "Enter value") +
            '" /></label>'
          : "") +
        "</div>";

      els.stepList.appendChild(li);
    });

    els.stepList.querySelectorAll(".step-card").forEach(function (card) {
      var id = card.dataset.id;
      var toggle = card.querySelector("[data-toggle]");
      if (toggle) {
        toggle.addEventListener("click", function () {
          expandedSteps[id] = !card.classList.contains("step-card--expanded");
          renderSteps();
        });
      }
      card.querySelectorAll("[data-field]").forEach(function (input) {
        input.addEventListener("change", function () {
          updateStep(id, input.dataset.field, input.value);
        });
        input.addEventListener("input", function () {
          if (input.dataset.field === "target") updateStep(id, "target", input.value, true);
          else if (input.dataset.field === "value") {
            var step = state.steps.find(function (s) {
              return s.id === id;
            });
            if (step) step.value = input.value;
            var summary = card.querySelector(".step-card__summary");
            if (summary) summary.textContent = stepSummary(step);
          }
        });
      });
      card.querySelectorAll("[data-move]").forEach(function (btn) {
        btn.addEventListener("click", function (e) {
          e.stopPropagation();
          moveStep(id, btn.dataset.move);
        });
      });
      var removeBtn = card.querySelector("[data-remove]");
      if (removeBtn) {
        removeBtn.addEventListener("click", function (e) {
          e.stopPropagation();
          delete expandedSteps[id];
          removeStep(id);
        });
      }
    });
  }

  function updateStep(id, field, value, silent) {
    var step = state.steps.find(function (s) {
      return s.id === id;
    });
    if (!step) return;
    step[field] = value;
    if (field === "action" || field === "target") {
      step.selector = resolveSelector(step.target);
      if (!silent) renderSteps();
    }
  }

  function moveStep(id, dir) {
    var idx = state.steps.findIndex(function (s) {
      return s.id === id;
    });
    if (idx < 0) return;
    var next = dir === "up" ? idx - 1 : idx + 1;
    if (next < 0 || next >= state.steps.length) return;
    var tmp = state.steps[idx];
    state.steps[idx] = state.steps[next];
    state.steps[next] = tmp;
    renderSteps();
  }

  function removeStep(id) {
    state.steps = state.steps.filter(function (s) {
      return s.id !== id;
    });
    renderSteps();
    if (state.steps.length === 0 && els.runBtn) els.runBtn.disabled = true;
  }

  function addBlankStep() {
    var id = uid();
    state.steps.push({
      id: id,
      action: "click",
      target: "",
      value: "",
      selector: "",
    });
    expandedSteps[id] = true;
    renderSteps();
    if (els.runBtn) els.runBtn.disabled = false;
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

  function setBrowserActive(on) {
    var stage = document.querySelector(".browser-stage");
    if (stage) stage.classList.toggle("browser-stage--active", !!on);
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
      return Promise.resolve({
        ok: true,
        detail: "Navigated to " + (step.value || "page") + " (simulated in demo)",
      });
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
    return Promise.resolve({
      ok: false,
      detail: "Could not find: " + (step.target || selector || "element"),
    });
  }

  function appendResult(row) {
    if (!els.results) return;
    if (els.resultsPanel) els.resultsPanel.hidden = false;
    var empty = els.results.querySelector(".run-results__empty");
    if (empty) empty.remove();
    var item = document.createElement("div");
    item.className = "result-item result-item--" + (row.ok ? "pass" : "fail");
    var meta = actionMeta(row.action);
    item.innerHTML =
      '<span class="result-item__mark" aria-hidden="true">' +
      (row.ok ? "✓" : "✕") +
      "</span>" +
      '<div class="result-item__body">' +
      '<span class="result-item__title">Step ' +
      row.step +
      " · " +
      meta.label +
      "</span>" +
      '<span class="result-item__detail">' +
      escapeHtml(row.detail) +
      "</span>" +
      "</div>";
    els.results.appendChild(item);
  }

  function setRunningStep(id) {
    state.steps.forEach(function (s) {
      delete s._highlight;
    });
    if (id) {
      var step = state.steps.find(function (s) {
        return s.id === id;
      });
      if (step) {
        step._highlight = true;
        expandedSteps[id] = true;
      }
    }
    renderSteps();
  }

  async function runTest() {
    if (state.running || state.steps.length === 0) return;
    if (!(await ensurePreviewBeforeRun())) {
      showSiteUrlError("Load a preview URL before running the test (or leave blank for sample checkout).");
      return;
    }

    state.running = true;
    if (els.runBtn) els.runBtn.disabled = true;
    if (els.results) els.results.innerHTML = "";
    if (els.resultsPanel) els.resultsPanel.hidden = true;

    setPipeline("run", "Running steps in the live browser…");
    setBrowserActive(true);
    resetFrame();

    var doc = await ensureRunnableFrame();
    if (!doc) {
      showFrameNotice("error", blockedNoticeHtml());
      appendResult({
        step: 0,
        action: "setup",
        ok: false,
        detail: "Browser preview isn't reachable — try sample checkout.",
      });
      finishRun();
      return;
    }

    if (state.usingFallback && state.previewUrl) {
      appendResult({
        step: 0,
        action: "setup",
        ok: true,
        detail: "Running on sample checkout (your URL can't be controlled from the demo iframe).",
      });
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
    if (state.steps.length > 0 && els.runBtn) els.runBtn.disabled = false;
    setBrowserActive(false);
  }

  function resetApp() {
    state.steps = [];
    state.processing = false;
    state.clipLoaded = false;
    if (state.videoUrl) {
      URL.revokeObjectURL(state.videoUrl);
      state.videoUrl = null;
    }
    showUploadIdleUI();
    if (els.clipVideo) {
      els.clipVideo.pause();
      els.clipVideo.removeAttribute("src");
      els.clipVideo.load();
    }
    if (els.videoInput) els.videoInput.value = "";
    if (els.transcriptPanel) els.transcriptPanel.hidden = true;
    if (els.resultsPanel) els.resultsPanel.hidden = true;
    if (els.results) {
      els.results.innerHTML =
        '<p class="run-results__empty">Results appear here after you run the test.</p>';
    }
    if (els.progressFill) els.progressFill.style.width = "0%";
    if (els.progressPct) els.progressPct.textContent = "0%";
    if (els.siteUrl) els.siteUrl.value = "";
    hideSiteUrlError();
    hideFrameNotice();
    expandedSteps = {};
    renderSteps();
    resetFrame();
    if (els.runBtn) els.runBtn.disabled = true;
    setBrowserActive(false);
    state.previewUrl = null;
    state.previewReady = false;
    state.frameAccess = "unknown";
    state.frameBlocked = false;
    state.usingFallback = false;
    setPipeline(
      "upload",
      "Drop a screen recording (.mp4 or .webm), or click Run sample — transcript and steps are preset until you self-host Lumina."
    );
    loadPreviewUrl(null, false);
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

  function maybeAutoStartSample() {
    if (location.hash !== "#app" || state.clipLoaded || state.processing) return;
    var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setTimeout(runSample, reduced ? 0 : 450);
  }

  function boot() {
    bind();
    initHeroPreview();
    if (!els.app) return;
    loadPreviewUrl(null, false).then(function () {
      maybeAutoStartSample();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
