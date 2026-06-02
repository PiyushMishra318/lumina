(function () {
  "use strict";

  var ACTION_TYPES = [
    { value: "click", label: "Click", icon: "◎" },
    { value: "fill", label: "Fill in", icon: "✎" },
    { value: "navigate", label: "Go to page", icon: "↗" },
    { value: "assert", label: "Check for", icon: "✓" },
    { value: "wait", label: "Wait", icon: "⏱" },
  ];

  var SAMPLE_TRANSCRIPT = [
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
    videoUrl: null,
    stepCounter: 0,
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

  function bind() {
    els.uploadZone = $("upload-zone");
    els.uploadDrop = $("upload-drop");
    els.videoInput = $("video-input");
    els.browseBtn = $("browse-btn");
    els.uploadProgress = $("upload-progress");
    els.videoName = $("video-name");
    els.progressFill = $("progress-fill");
    els.progressPct = $("progress-pct");
    els.videoThumb = $("video-thumb");
    els.transcriptPanel = $("transcript-panel");
    els.transcript = $("demo-transcript");
    els.stepList = $("step-list");
    els.editorEmpty = $("editor-empty");
    els.editorPanel = $("editor-panel");
    els.runBtn = $("run-test");
    els.resetBtn = $("reset-app");
    els.results = $("demo-results");
    els.frame = $("demo-frame");
    els.pipeline = $("pipeline");
    els.status = $("app-status");
    els.addStepBtn = $("add-step");
    els.useSampleBtn = $("use-sample");

    if (!els.uploadZone) return;

    els.browseBtn.addEventListener("click", function () {
      els.videoInput.click();
    });
    els.videoInput.addEventListener("change", onFileSelected);
    els.uploadDrop.addEventListener("dragover", onDragOver);
    els.uploadDrop.addEventListener("dragleave", onDragLeave);
    els.uploadDrop.addEventListener("drop", onDrop);
    els.runBtn.addEventListener("click", runTest);
    els.resetBtn.addEventListener("click", resetApp);
    els.addStepBtn.addEventListener("click", addBlankStep);
    els.useSampleBtn.addEventListener("click", useSampleClip);
  }

  function onDragOver(e) {
    e.preventDefault();
    els.uploadZone.classList.add("is-dragover");
  }

  function onDragLeave() {
    els.uploadZone.classList.remove("is-dragover");
  }

  function onDrop(e) {
    e.preventDefault();
    els.uploadZone.classList.remove("is-dragover");
    var file = e.dataTransfer.files[0];
    if (file) processVideo(file);
  }

  function onFileSelected(e) {
    var file = e.target.files[0];
    if (file) processVideo(file);
  }

  function setPipeline(stage, label) {
    if (!els.pipeline) return;
    var order = ["upload", "transcribe", "steps", "run"];
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

  function showUploadUI(file) {
    els.uploadDrop.hidden = true;
    els.uploadProgress.hidden = false;
    if (els.videoName) els.videoName.textContent = file.name;
    if (state.videoUrl) URL.revokeObjectURL(state.videoUrl);
    state.videoUrl = URL.createObjectURL(file);
    if (els.videoThumb) {
      els.videoThumb.innerHTML = '<video muted playsinline src="' + state.videoUrl + '"></video>';
      var vid = els.videoThumb.querySelector("video");
      if (vid) vid.currentTime = 0.5;
    }
  }

  async function processVideo(file) {
    if (state.processing) return;
    var valid = /^video\/(mp4|webm)$/i.test(file.type) || /\.(mp4|webm)$/i.test(file.name);
    if (!valid) {
      if (els.status) els.status.textContent = "Please upload an MP4 or WebM screen recording.";
      return;
    }

    state.processing = true;
    showUploadUI(file);
    setPipeline("upload", "Uploading your clip…");
    await animateProgress(0, 100, 800);

    setPipeline("transcribe", "Transcribing narration from audio…");
    await animateProgress(0, 100, 1400);
    renderTranscript();

    setPipeline("steps", "Turning walkthrough into editable test steps…");
    await wait(900);
    state.steps = DEFAULT_STEPS.map(function (s) {
      return { id: uid(), action: s.action, target: s.target, value: s.value, selector: s.selector };
    });
    renderSteps();
    els.transcriptPanel.hidden = false;
    els.runBtn.disabled = false;

    setPipeline("steps", "Steps ready — review, edit, then run the test.");
    state.processing = false;
  }

  async function useSampleClip() {
    var fake = new File(["sample"], "checkout-walkthrough.mp4", { type: "video/mp4" });
    await processVideo(fake);
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

    setPipeline("run", "Running steps in the live browser…");
    resetFrame();

    var doc = getFrameDoc();
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
    if (state.videoUrl) {
      URL.revokeObjectURL(state.videoUrl);
      state.videoUrl = null;
    }
    if (els.uploadDrop) els.uploadDrop.hidden = false;
    if (els.uploadProgress) els.uploadProgress.hidden = true;
    if (els.videoInput) els.videoInput.value = "";
    if (els.transcriptPanel) els.transcriptPanel.hidden = true;
    if (els.results) els.results.innerHTML = '<p class="run-results__empty">Results appear here after you run the test.</p>';
    if (els.progressFill) els.progressFill.style.width = "0%";
    if (els.progressPct) els.progressPct.textContent = "0%";
    renderSteps();
    resetFrame();
    els.runBtn.disabled = true;
    setPipeline("upload", "Drop a screen recording (.mp4 or .webm) to get started.");
  }

  document.addEventListener("DOMContentLoaded", bind);
})();
