from playwright.sync_api import sync_playwright
import os, time, traceback

def run_single_step(step, page, report_dir):
    step_result = {
        "step": step.get("step"),
        "action": step.get("action"),
        "selector": step.get("selector"),
        "status": "",
        "error": None,
        "screenshot": None
    }

    try:
        action = step.get("action")
        selector = step.get("selector")
        value = step.get("value", "")

        print(f"[→] Step {step_result['step']}: {action} -> {selector or '(no selector)'}")

        if action == "click":
            page.click(selector)
        elif action == "fill":
            page.fill(selector, value)
        elif action == "hover":
            page.hover(selector)
        elif action == "scroll":
            page.evaluate("window.scrollBy(0, 500)")
        else:
            print(f"[!] Unknown action type: {action}")

        step_result["status"] = "success"

    except Exception as e:
        step_result["status"] = "fail"
        step_result["error"] = str(e)
        screenshot_path = os.path.join(report_dir, f"step_{step.get('step')}.png")
        page.screenshot(path=screenshot_path)
        step_result["screenshot"] = screenshot_path
        print(f"[X] Step {step.get('step')} failed: {e}")
        traceback.print_exc()

    return step_result


def run_test(url, test_cases, headless=True, report_dir="reports"):
    os.makedirs(report_dir, exist_ok=True)
    results = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=headless)
        page = browser.new_page()
        page.goto(url)
        time.sleep(2)

        print(f"\n[+] Running {len(test_cases)} Playwright test steps...\n")

        for step in sorted(test_cases, key=lambda x: x["step"]):
            result = run_single_step(step, page, report_dir)
            results.append(result)

        browser.close()

    return results
