from langchain.prompts import PromptTemplate
from langchain.chains import LLMChain
from langchain_ollama.llms import OllamaLLM
import json, re

# Initialize Ollama LLM
ollama_model = OllamaLLM(model="llama2", host="http://localhost:11434")

# Prompt template: merge audio + vision actions into Playwright steps
merge_prompt = PromptTemplate(
    input_variables=["audio_actions", "vision_actions"],
    template="""
You are an assistant that converts audio actions and visual UI detections into Playwright test steps.

Instructions:
1. For each audio action, find the best matching UI element from the vision actions.
2. Map actions to valid Playwright steps: click, fill, hover, scroll.
3. Use selectors like 'text=Login', 'input[placeholder="Email"]', or CSS IDs/classes.
4. Return a pure JSON array. Each step must have:
   {{
       "step": 1,
       "action": "click" | "fill" | "hover" | "scroll",
       "selector": "CSS or text selector usable in Playwright",
       "value": "optional, only for fill actions",
       "expected_result": "string describing what should happen"
   }}

Audio actions:
{audio_actions}

Visual actions (from frames):
{vision_actions}

Return JSON only, no extra text, no markdown.
"""
)

merge_chain = LLMChain(llm=ollama_model, prompt=merge_prompt, output_key="test_cases")

def clean_json_output(response: str):
    """
    Extract JSON array from LLM response, handling code blocks or extra text.
    """
    # Try to extract JSON inside ```json blocks
    match = re.search(r"```json(.*?)```", response, re.DOTALL)
    if match:
        response = match.group(1)
    # Otherwise, try to find first [...] block
    elif "[" in response and "]" in response:
        start = response.find("[")
        end = response.rfind("]") + 1
        response = response[start:end]
    return response.strip()

def generate_test_cases(audio_actions, vision_actions):
    """
    Merge audio + vision actions into structured Playwright test cases.
    Returns a list of steps.
    """
    print("[DEBUG] Audio actions:", audio_actions)
    print("[DEBUG] Vision actions:", vision_actions)
    
    response = merge_chain.predict(audio_actions=audio_actions, vision_actions=vision_actions)
    response = clean_json_output(response)
    
    try:
        return json.loads(response)
    except json.JSONDecodeError:
        print("[!] Warning: LLM output not valid JSON. Returning raw response.")
        return [{"step": 0, "action": "error", "raw_output": response}]
