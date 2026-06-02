(function () {
  var SAMPLE_TRANSCRIPT = [
    { t: "0:04", text: "I'll walk through applying a promo on checkout." },
    { t: "0:12", text: "Open the checkout page and enter the customer email." },
    { t: "0:22", text: "Type SAVE10 in the promo field, then hit Apply discount." },
    { t: "0:31", text: "We should see confirmation that the total updated." },
  ];

  var SAMPLE_TESTS = [
    { step: 1, action: "fill", selector: "#email", value: "qa@lumina.dev" },
    { step: 2, action: "fill", selector: "#promo", value: "SAVE10" },
    { step: 3, action: "click", selector: "#apply-btn" },
    { step: 4, action: "assert", selector: "#status", value: "visible" },
  ];

  var els = {};
  var running = false;

  function $(id) {
    return document.getElementById(id);
  }

  function bind() {
    els.transcript = $("demo-transcript");
    els.testsOut = $("demo-tests");
    els.results = $("demo-results");
    els.frame = $("demo-frame");
    els.runBtn = $("demo-run");
    els.resetBtn = $("demo-reset");
    els.progress = $("demo-progress");
    els.status = $("demo-status");

    if (!els.runBtn) return;

    renderTranscript();
    renderTests();

    els.runBtn.addEventListener("click", runDemo);
    if (els.resetBtn) els.resetBtn.addEventListener("click", resetDemo);
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

  function renderTests() {
    if (!els.testsOut) return;
    els.testsOut.textContent = JSON.stringify(SAMPLE_TESTS, null, 2);
  }

  function setProgress(step, label) {
    if (!els.progress) return;
    var items = els.progress.querySelectorAll("[data-step]");
    items.forEach(function (node) {
      var n = Number(node.getAttribute("data-step"));
      node.classList.remove("is-active", "is-done");
      if (n < step) node.classList.add("is-done");
      if (n === step) node.classList.add("is-active");
    });
    if (els.status) els.status.textContent = label;
  }

  function wait(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  function getFrameDoc() {
    if (!els.frame || !els.frame.contentWindow) return null;
    try {
      return els.frame.contentWindow.document;
    } catch (e) {
      return null;
    }
  }

  function runStep(step, doc) {
    var action = step.action;
    var el = doc.querySelector(step.selector);
    if (action === "fill" && el) {
      el.value = step.value;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      return { ok: true, detail: 'Filled "' + step.selector + '"' };
    }
    if (action === "click" && el) {
      el.click();
      return { ok: true, detail: "Clicked " + step.selector };
    }
    if (action === "assert" && el) {
      var visible = !el.hidden && el.textContent.trim().length > 0;
      return {
        ok: visible,
        detail: visible ? "Confirmation message appeared" : "Expected confirmation missing",
      };
    }
    return { ok: false, detail: "Element not found: " + step.selector };
  }

  function appendResult(row) {
    if (!els.results) return;
    var empty = els.results.querySelector(".demo-results__empty");
    if (empty) empty.remove();
    var item = document.createElement("div");
    item.className = "result-row result-row--" + (row.ok ? "pass" : "fail");
    item.innerHTML =
      '<span class="result-row__step">Step ' +
      row.step +
      "</span>" +
      '<span class="result-row__action">' +
      row.action +
      "</span>" +
      '<span class="result-row__detail">' +
      row.detail +
      "</span>";
    els.results.appendChild(item);
  }

  async function runDemo() {
    if (running) return;
    running = true;
    if (els.runBtn) els.runBtn.disabled = true;
    if (els.results) els.results.innerHTML = "";

    setProgress(1, "Reading narration from your recording…");
    await wait(700);
    setProgress(2, "Turning walkthrough into structured test steps…");
    await wait(900);
    setProgress(3, "Running tests in a real browser session…");

    var doc = getFrameDoc();
    if (!doc) {
      appendResult({
        step: 0,
        action: "setup",
        ok: false,
        detail: "Demo app failed to load. Refresh and try again.",
      });
      finishRun();
      return;
    }

    doc.getElementById("email").value = "";
    doc.getElementById("promo").value = "";
    var status = doc.getElementById("status");
    if (status) {
      status.hidden = true;
      status.textContent = "";
    }

    for (var i = 0; i < SAMPLE_TESTS.length; i++) {
      var step = SAMPLE_TESTS[i];
      await wait(500);
      var outcome = runStep(step, doc);
      appendResult({
        step: step.step,
        action: step.action,
        ok: outcome.ok,
        detail: outcome.detail,
      });
      if (!outcome.ok) break;
    }

    setProgress(4, "Run complete — report ready.");
    finishRun();
  }

  function finishRun() {
    running = false;
    if (els.runBtn) els.runBtn.disabled = false;
  }

  function resetDemo() {
    if (els.results) els.results.innerHTML = "";
    setProgress(1, "Paste a Loom-style walkthrough, or use the sample above.");
    var doc = getFrameDoc();
    if (!doc) return;
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

  document.addEventListener("DOMContentLoaded", bind);
})();
