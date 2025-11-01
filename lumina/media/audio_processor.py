import whisper
from moviepy import VideoFileClip
from langchain_ollama.llms import OllamaLLM

ollama_model = OllamaLLM(model="llama2", host="http://localhost:11434")

# Load Whisper model once
whisper_model = whisper.load_model("base")  # small/base/medium/large

def extract_audio_from_video(video_path, output_path="audio.wav"):
    clip = VideoFileClip(video_path)
    clip.audio.write_audiofile(output_path)
    return output_path

def transcribe_audio(audio_path):
    """Transcribe audio to text using local Whisper model"""
    result = whisper_model.transcribe(audio_path)
    return result["text"]

def extract_intent_from_video(video_path):
    """Full pipeline: extract audio from video → transcribe → generate intent"""
    audio_path = extract_audio_from_video(video_path)
    transcribed_text = transcribe_audio(audio_path)
    
    prompt = f"""
Extract step-by-step user actions from this transcribed audio:

"{transcribed_text}"

Provide each step with action type (click, fill, scroll), target (button/input text), and optional expected result.
"""
    response = ollama_model.predict(prompt)
    return response
