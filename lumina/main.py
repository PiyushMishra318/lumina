from media.audio_processor import extract_intent_from_video
from media.video_processor import detect_ui_from_video
from ai.llm_interface import generate_test_cases
from executor.playwright_runner import run_test
import argparse, json

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--video", required=True, help="Path to user interaction video")
    parser.add_argument("--url", required=True, help="Target website URL")
    parser.add_argument("--headless", action="store_true", default=False)
    parser.add_argument("--report_dir", default="reports")
    args = parser.parse_args()

    print("[+] Extracting user intent from audio...")
    audio_actions = extract_intent_from_video(args.video)

    print("[+] Detecting UI elements from video frames...")
    vision_actions = detect_ui_from_video(args.video, fps=0.25, max_workers=6)

    print("[+] Generating Playwright test cases...")
    test_cases = generate_test_cases(audio_actions, vision_actions)

    with open("test_cases.json", "w") as f:
        json.dump(test_cases, f, indent=4)
    print("[+] Test cases saved to test_cases.json")

    print("[+] Executing Playwright tests...")
    results = run_test(args.url, test_cases, headless=args.headless, report_dir=args.report_dir)

    print("\n[=] Test execution complete.")
    print(json.dumps(results, indent=2))

if __name__ == "__main__":
    main()
