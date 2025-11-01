# video_processor.py
import cv2
import os
from concurrent.futures import ThreadPoolExecutor, as_completed
from langchain_ollama.llms import OllamaLLM
import base64

ollama_vision_model = OllamaLLM(model="gemma3", host="http://localhost:11434")

import cv2
import numpy as np

def are_frames_similar(frame1, frame2, threshold=10):
    hash1 = cv2.img_hash.AverageHash_create().compute(frame1)
    hash2 = cv2.img_hash.AverageHash_create().compute(frame2)
    diff = np.sum(np.abs(hash1 - hash2))
    return diff < threshold


def extract_frames(video_path, fps=1):
    cap = cv2.VideoCapture(video_path)
    frames = []
    video_fps = cap.get(cv2.CAP_PROP_FPS)
    frame_interval = int(video_fps / fps)
    count = 0
    # prev_frame = None

    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break
        if count % frame_interval == 0:
            # if prev_frame is None or not are_frames_similar(prev_frame, frame):
            frames.append((count, frame))
                # prev_frame = frame
        count += 1
    cap.release()
    return frames

def detect_ui_from_frame(frame_tuple):
    """
    Send a video frame to Ollama as a base64 data URL instead of saving to disk.
    Returns the parsed JSON result.
    """
    idx, frame = frame_tuple

    # Convert frame (numpy array) to JPEG bytes
    _, buffer = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), 70])
    jpg_bytes = buffer.tobytes()

    # Encode as base64 and create a data URL
    b64_str = base64.b64encode(jpg_bytes).decode("utf-8")
    data_url = f"data:image/jpeg;base64,{b64_str}"

    prompt = """
Analyze the image and output a JSON array of detected UI elements:
- element_type
- text
- coordinates
- suggested_actions
Return only JSON.
"""

    # Send to Ollama
    result = ollama_vision_model.invoke([
        {"role": "user", "content": [
            {"type": "text", "text": prompt},
            {"type": "image_url", "image_url": data_url}
        ]}
    ])
    return result

def detect_ui_from_video(video_path, fps=1, max_workers=4):
    frames = extract_frames(video_path, fps=fps)
    all_ui_actions = ''
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = [executor.submit(detect_ui_from_frame, f) for f in frames]
        for future in as_completed(futures):
            try:
                all_ui_actions += "\n" + future.result()
            except Exception as e:
                print(f"[!] Error processing frame: {e}")
    return all_ui_actions
