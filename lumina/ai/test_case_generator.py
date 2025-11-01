def create_test_cases(audio_text, video_frames):
    video_actions = process_video_frames(video_frames)  # from video_processor
    audio_intent = extract_intent_from_audio(audio_text)
    test_cases_json = generate_test_cases(audio_intent, video_actions)
    return test_cases_json
