import os
import json
from pathlib import Path
from typing import Literal
from urllib import error as urlerror
from urllib import request as urlrequest

import google.generativeai as genai
import traceback
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from google.api_core.exceptions import NotFound, ResourceExhausted, TooManyRequests
from pydantic import BaseModel, Field
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential
import requests
import json as _json
from pathlib import Path as _Path

ROOT_ENV = Path(__file__).resolve().parents[1] / '.env'
load_dotenv(dotenv_path=ROOT_ENV, override=True)

GEMINI_API_KEY = os.getenv('GEMINI_API_KEY', '')
MODEL_NAME = os.getenv('GEMINI_MODEL', 'gemini-1.5-flash')
ACTIVE_MODEL: str | None = None
GROQ_API_KEY = os.getenv('GROQ_API_KEY', '')
GROQ_MODEL = os.getenv('GROQ_MODEL', 'llama-3.1-8b-instant')
GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions'

if GEMINI_API_KEY:
  getattr(genai, 'configure')(api_key=GEMINI_API_KEY)

app = FastAPI(title='Lumin Backend', version='1.0.0')

print(f'[Lumin] Providers - Groq: {bool(GROQ_API_KEY)} | Gemini: {bool(GEMINI_API_KEY)}')

app.add_middleware(
  CORSMiddleware,
  allow_origins=['*'],
  allow_credentials=True,
  allow_methods=['*'],
  allow_headers=['*'],
)

# Admin helper: create child user without sending confirmation email (requires service role key)
SUPABASE_URL = os.getenv('VITE_SUPABASE_URL') or os.getenv('NEXT_PUBLIC_SUPABASE_URL')
SUPABASE_SERVICE_ROLE = os.getenv('SUPABASE_SERVICE_ROLE_KEY')


class CreateChildPayload(BaseModel):
  username: str
  password: str
  display_name: str = ''
  caregiver_code: str | None = None


@app.post('/admin/create-child')
def create_child(payload: CreateChildPayload):
  if not SUPABASE_SERVICE_ROLE:
    return { 'error': 'Service role key not configured' }
  if not SUPABASE_URL:
    return { 'error': 'Supabase URL not configured' }

  email = f"{payload.username}@kids.lumin.local"

  body = {
    'email': email,
    'password': payload.password,
    'user_metadata': {
      'role': 'child',
      'username': payload.username,
      'display_name': payload.display_name,
      'caregiver_code': (payload.caregiver_code or '')
    },
    'email_confirm': True
  }

  headers = {
    'apikey': SUPABASE_SERVICE_ROLE,
    'Authorization': f'Bearer {SUPABASE_SERVICE_ROLE}',
    'Content-Type': 'application/json'
  }

  url = f"{SUPABASE_URL}/auth/v1/admin/users"
  try:
    resp = requests.post(url, json=body, headers=headers, timeout=10)
  except Exception as exc:
    return { 'error': f'Create child request failed: {exc}' }

  if resp.status_code >= 400:
    try:
      return { 'error': resp.json() }
    except Exception:
      return { 'error': resp.text }

  try:
    created = resp.json()
  except Exception:
    created = { 'result': 'ok' }

  # If caregiver_code provided, try to link caregiver_patients (use REST API with service role)
  try:
    caregiver_code = (payload.caregiver_code or '').strip().upper()
    if caregiver_code:
      codes_url = f"{SUPABASE_URL}/rest/v1/caregiver_codes?code=eq.{caregiver_code}&select=caregiver_id,active"
      codes_resp = requests.get(codes_url, headers={**headers, 'Accept': 'application/json'}, timeout=8)
      if codes_resp.ok:
        rows = codes_resp.json() or []
        if len(rows) > 0 and rows[0].get('active'):
          caregiver_id = rows[0].get('caregiver_id')
          # insert mapping
          patients_url = f"{SUPABASE_URL}/rest/v1/caregiver_patients"
          mapping = {
            'caregiver_id': caregiver_id,
            'child_id': created.get('id'),
            'active': True
          }
          # Upsert via POST with Prefer header to return representation
          map_resp = requests.post(patients_url, json=mapping, headers={**headers, 'Prefer': 'return=representation', 'Content-Type':'application/json'}, timeout=8)
          # ignore errors here but log
          if not map_resp.ok:
            print(f'[Lumin] caregiver_patients insert failed: {map_resp.status_code} {map_resp.text}')
  except Exception as exc:
    print(f'[Lumin] caregiver link failed: {exc}')

  return created

class ChatRequest(BaseModel):
  message: str = Field(min_length=1)
  child_name: str = Field(min_length=1)
  mode: Literal['normal', 'story', 'game'] = 'normal'
  memory_context: str = ''
  language: str = 'en'


class ChatResponse(BaseModel):
  reply: str
  structured: dict | None = None
  suggested_mode: str | None = None
  memory_update: str | None = None


class RateLimitError(Exception):
  pass


class ProviderError(Exception):
  pass


class AuthProviderError(ProviderError):
  pass


def candidate_models() -> list[str]:
  # Keep gemini-1.5-flash as preferred default for free-tier stability.
  # Some API projects do not expose that model name anymore, so we gracefully
  # fall back to currently available flash variants.
  if ACTIVE_MODEL:
    return [ACTIVE_MODEL]

  ordered = [
    MODEL_NAME,
    'models/gemini-flash-lite-latest',
  ]
  unique: list[str] = []
  for model in ordered:
    if model and model not in unique:
      unique.append(model)
  return unique


# Simple JSON file persistence for small game-state (hearts, changeCount) keyed by child name.
_GAME_STATE_FILE = _Path(__file__).resolve().parents[1] / 'data' / 'game_states.json'
_GAME_STATE_FILE.parent.mkdir(parents=True, exist_ok=True)

def _load_game_states() -> dict:
  try:
    if not _GAME_STATE_FILE.exists():
      return {}
    with open(_GAME_STATE_FILE, 'r', encoding='utf-8') as f:
      return _json.load(f)
  except Exception as exc:
    print(f'[Lumin] failed loading game states: {exc}')
    return {}

def _save_game_states(states: dict):
  try:
    with open(_GAME_STATE_FILE, 'w', encoding='utf-8') as f:
      _json.dump(states, f)
  except Exception as exc:
    print(f'[Lumin] failed saving game states: {exc}')


# Story-state persistence (narrative context) keyed by child name.
_STORY_STATE_FILE = _Path(__file__).resolve().parents[1] / 'data' / 'story_states.json'
_STORY_STATE_FILE.parent.mkdir(parents=True, exist_ok=True)

def _load_story_states() -> dict:
  try:
    if not _STORY_STATE_FILE.exists():
      return {}
    with open(_STORY_STATE_FILE, 'r', encoding='utf-8') as f:
      return _json.load(f)
  except Exception as exc:
    print(f'[Lumin] failed loading story states: {exc}')
    return {}

def _save_story_states(states: dict):
  try:
    with open(_STORY_STATE_FILE, 'w', encoding='utf-8') as f:
      _json.dump(states, f)
  except Exception as exc:
    print(f'[Lumin] failed saving story states: {exc}')


@app.get('/api/story-state')
def get_story_state(child_name: str):
  states = _load_story_states()
  return { 'state': states.get(child_name) }


@app.post('/api/story-state')
def post_story_state(payload: dict):
  child_name = payload.get('child_name')
  if not child_name:
    return { 'error': 'child_name required' }
  states = _load_story_states()
  states[child_name] = payload.get('state')
  _save_story_states(states)
  return { 'status': 'ok' }


@app.get('/api/game-state')
def get_game_state(child_name: str):
  states = _load_game_states()
  return { 'state': states.get(child_name) }


@app.post('/api/game-state')
def post_game_state(payload: dict):
  child_name = payload.get('child_name')
  if not child_name:
    return { 'error': 'child_name required' }
  states = _load_game_states()
  states[child_name] = payload.get('state')
  _save_game_states(states)
  return { 'status': 'ok' }


def build_system_prompt(child_name: str, mode: str, memory_context: str = '', language: str = 'en') -> str:
  # Always use English system prompt: Lumin is an English-only assistant.
  base = (
    f"You are Lumin, a kind AI companion for hospitalized children. The child's name is {child_name}. "
    "Speak in simple English suitable for 6-12 year olds, 1-3 short sentences, warm, reassuring and positive tone, with 1-2 emojis. "
    "If the child expresses fear, sadness, or pain, validate the feeling and offer one small gentle step. "
    "Abilities: you can tell stories, offer riddles, give hints, listen, and provide emotional support. Do not prepend a greeting to every reply — only say 'Hello' on the very first turn or when the child greets first. Respond ONLY in English."
  )

  safe_memory = (memory_context or '').strip()
  if safe_memory:
    truncated = safe_memory[:900]
    base = f"{base} Known child context: {truncated}. Use this to personalize responses and ask useful follow-up questions rather than generic prompts."

  # Global response strategy
  base = (
    base
    + " Response strategy: Be specific and practical. When the child describes a problem or feeling, give one short, concrete step they can try (example: 'Try taking three deep breaths'), and ask at most one clarifying question if needed. Avoid vague platitudes. Use the child's name when appropriate."
  )

  if mode == 'story':
    # Story-specific instructions appended to the base system prompt.
    story_instr = (
      " Story mode: the child is the hero. Write a coherent, child-friendly mini-episode (2-4 very short sentences) that keeps characters and facts consistent across turns. Use present tense and very simple vocabulary. After the episode, present exactly 2 clear numbered choices, each on its own line starting with '1)' and '2)'.\n\n"
      + "CRITICAL: Immediately after the human-readable episode and numbered choices, add a single line containing exactly '---STRUCTURED---' and then ONLY one valid JSON object (no extra text). "
      + "The JSON must be valid and have this shape: {\"episode\": string, \"choices\": [string, string], \"clarify\": boolean, \"question\": string|null, \"characters\": [{\"name\": string, \"trait\": string}] }."
    )
    return base + story_instr

  if mode == 'normal':
    return base + " Normal chat: answer empathetically and very concisely for a child (1-2 very short sentences). Ask at most one clarifying question only if needed. Do NOT produce a story episode, numbered choices, or any machine-readable JSON. Do NOT append a '---STRUCTURED---' section."

  if mode == 'game':
    return f"{base} Game mode: be encouraging, playful, and give short motivating responses."

  return base

_MEMORY_FILE = _Path(__file__).resolve().parents[1] / 'data' / 'memories.json'
_MEMORY_FILE.parent.mkdir(parents=True, exist_ok=True)

def _load_memories() -> dict:
  try:
    if not _MEMORY_FILE.exists():
      return {}
    with open(_MEMORY_FILE, 'r', encoding='utf-8') as f:
      return _json.load(f)
  except Exception as exc:
    print(f'[Lumin] failed loading memories: {exc}')
    return {}

def _save_memories(mem: dict):
  try:
    with open(_MEMORY_FILE, 'w', encoding='utf-8') as f:
      _json.dump(mem, f)
  except Exception as exc:
    print(f'[Lumin] failed saving memories: {exc}')


def _derive_profile(mem_entries: list) -> str:
  """Create a short one-line profile from recent memory entries using simple heuristics.
  Scans for likes, favorites, fears and repeating facts. Returns empty string if none found."""
  if not mem_entries:
    return ''
  import re

  # Collect categorized facts
  likes = []
  fears = []
  pets = []
  age = None
  pronouns = None
  name = None
  favorites = []
  hobbies = []
  others = []

  # Look back further to capture patterns across recent interactions
  for e in mem_entries[-24:]:
    text = (e.get('text') or '').strip()
    if not text:
      continue
    low = text.lower()

    # name
    m = re.search(r"my name is\s+([A-Za-z'\- ]{2,30})", low)
    if m and not name:
      name = m.group(1).strip().title()

    # age
    m = re.search(r"i am (\d{1,2})\s*(?:years|yo|year)?\b", low)
    if m and not age:
      age = m.group(1)

    # pronouns
    m = re.search(r"\b(my pronouns are|i use)\s+(he|she|they|him|her|them)\b", low)
    if m and not pronouns:
      pronouns = m.group(2)

    # likes / loves / favorites
    if re.search(r"\bi like\b|\bi love\b|favorite|prefers?\b", low):
      likes.append(text)
    m = re.search(r"favorite (?:color|food|song|game|movie|book) is ([^\.\!\?]{1,60})", low)
    if m:
      favorites.append(m.group(1).strip())

    # pets
    m = re.search(r"i have (?:a |an |my )?(cat|dog|hamster|rabbit|parrot|fish|pet)\b", low)
    if m:
      pets.append(m.group(1))

    # fears
    if re.search(r"scared|afraid|fear|don't like|don't want", low):
      fears.append(text)

    # hobbies / activities
    if re.search(r"(like to|enjoy|love to|i play|i draw|i read|i sing|i dance)\b", low):
      hobbies.append(text)

    # small facts
    if re.search(r"\bi have\b|\bi am \d|\bmy\b|\bhas\b", low):
      others.append(text)

  parts = []
  if name:
    parts.append(f"Name: {name}")
  if age:
    parts.append(f"Age: {age}")
  if pronouns:
    parts.append(f"Pronouns: {pronouns}")
  if pets:
    parts.append("Pets: " + ", ".join(list(dict.fromkeys(pets))[:3]))
  if favorites:
    parts.append("Favorites: " + ", ".join(list(dict.fromkeys(favorites))[:4]))
  if likes:
    short = ", ".join([l.split('\n')[0][:50].strip() for l in likes[:3]])
    parts.append("Likes: " + short)
  if hobbies:
    parts.append("Hobbies: " + ", ".join(list(dict.fromkeys([h.split('\n')[0][:40].strip() for h in hobbies[:3]]))))
  if fears:
    parts.append("Fears: " + ", ".join(list(dict.fromkeys([f.split('\n')[0][:50].strip() for f in fears[:2]]))))
  if others and not parts:
    parts.append("Notes: " + ", ".join([o.split('\n')[0][:60].strip() for o in others[:3]]))

  profile = ' | '.join(parts)
  return profile[:900]


def _extract_memory_facts(text: str) -> str:
  """Extract short facts from a child's single message to grow short-term memory.
  Returns a compact semicolon-separated string or empty if nothing found."""
  if not text:
    return ''
  t = text.strip()
  lower = t.lower()
  facts = []
  import re

  # age
  m = re.search(r"i am (\d{1,2}) (?:years|yo|year)?\b", lower)
  if m:
    facts.append(f"Age: {m.group(1)}")

  # name
  m = re.search(r"my name is ([a-z'\- ]{1,40})", lower)
  if m:
    facts.append(f"Name: {m.group(1).strip().title()}")

  # pronouns
  m = re.search(r"my pronouns are (he|she|they|him|her|them)", lower)
  if m:
    facts.append(f"Pronouns: {m.group(1)}")

  # likes / loves
  m = re.search(r"i like ([^\.\!\?]{1,60})", lower)
  if m:
    facts.append(f"Likes: {m.group(1).strip()}")
  m = re.search(r"i love ([^\.\!\?]{1,60})", lower)
  if m:
    facts.append(f"Loves: {m.group(1).strip()}")

  # favorite X is Y
  m = re.search(r"favorite (?:color|food|song|game|book|movie) is ([^\.\!\?]{1,60})", lower)
  if m:
    facts.append(f"Favorite: {m.group(1).strip()}")

  # has/pets
  m = re.search(r"i have (?:a |an |my )?([^\.\!\?]{1,60})", lower)
  if m:
    val = m.group(1).strip()
    # short pet heuristic
    if re.search(r"cat|dog|hamster|rabbit|parrot|fish|pet", val):
      facts.append(f"Has: {val}")
    else:
      facts.append(f"Has: {val}")

  # activities/hobbies
  m = re.search(r"(i play|i like to|i enjoy|i draw|i sing|i dance|i read) ([^\.\!\?]{1,60})", lower)
  if m:
    facts.append(f"Hobby: {m.group(2).strip()}")

  # fears or discomfort
  if re.search(r"scared|afraid|fear|don't like|don't want", lower):
    facts.append(f"Concern: {t[:120]}")

  # dedupe and limit
  seen = set()
  out = []
  for f in facts:
    if f and f not in seen:
      seen.add(f)
      out.append(f)
    if len(out) >= 6:
      break

  return '; '.join(out)[:400]


def detect_intent(message: str) -> str:
  """Very small heuristic intent detector: returns 'story','game','music' or 'normal'."""
  m = (message or '').lower()
  # Accept common synonyms children may use (history -> story, tell me -> story)
  if any(kw in m for kw in ['story', 'tale', 'adventure', 'choose', 'pick', 'history', 'tell me a story', 'i want a story', 'storytime']):
    return 'story'
  if any(kw in m for kw in ['game', 'play', 'level', 'score', 'riddle', 'quiz', "let's play", 'lets play']):
    return 'game'
  if any(kw in m for kw in ['song', 'music', 'sing', 'play music', 'listen to', 'listen', 'playlist']):
    return 'music'
  return 'normal'


@retry(
  retry=retry_if_exception_type((ResourceExhausted, TooManyRequests)),
  wait=wait_exponential(multiplier=0.5, min=0.5, max=4),
  stop=stop_after_attempt(3),
  reraise=True,
)
def generate_with_retry(system_prompt: str, user_message: str, model_name: str, max_tokens: int) -> str:
  try:
    model = getattr(genai, 'GenerativeModel')(model_name=model_name, system_instruction=system_prompt)
    generation_config_cls = getattr(getattr(genai, 'types'), 'GenerationConfig')
    response = model.generate_content(
      user_message,
      generation_config=generation_config_cls(max_output_tokens=max_tokens, temperature=0.75),
    )

    text = getattr(response, 'text', None)
    if text:
      return text.strip()

    candidates = getattr(response, 'candidates', None) or []
    if candidates:
      parts = getattr(candidates[0].content, 'parts', [])
      if parts:
        maybe_text = getattr(parts[0], 'text', '')
        if maybe_text:
          return maybe_text.strip()

    # If we get here, generation returned no text
    print(f'[Lumin] Gemini generation returned empty response for model {model_name}: {response}')
    return "I'm here for you 💛"
  except Exception as exc:
    print(f'[Lumin] Exception in generate_with_retry for model {model_name}: {exc}')
    traceback.print_exc()
    raise


@retry(
  retry=retry_if_exception_type(RateLimitError),
  wait=wait_exponential(multiplier=0.5, min=0.5, max=4),
  stop=stop_after_attempt(3),
  reraise=True,
)
def generate_with_groq(system_prompt: str, user_message: str, max_tokens: int) -> str:
  if not GROQ_API_KEY:
    raise ProviderError('Groq API key missing')

  payload = {
    'model': GROQ_MODEL,
    'messages': [
      {'role': 'system', 'content': system_prompt},
      {'role': 'user', 'content': user_message},
    ],
    'temperature': 0.7,
    'max_tokens': max_tokens,
  }

  req = urlrequest.Request(
    GROQ_API_URL,
    data=json.dumps(payload).encode('utf-8'),
    headers={
      'Authorization': f'Bearer {GROQ_API_KEY}',
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'User-Agent': 'LuminBackend/1.0',
    },
    method='POST',
  )

  try:
    with urlrequest.urlopen(req, timeout=20) as response:
      body = response.read().decode('utf-8')
  except urlerror.HTTPError as exc:
    try:
      err_body = exc.read().decode('utf-8', errors='ignore')
    except Exception:
      err_body = '<could not read error body>'
    if exc.code == 429:
      raise RateLimitError('Groq rate limit')
    if exc.code in (401, 403):
      raise AuthProviderError(f'Groq HTTP {exc.code}: {err_body[:250]}')
    print(f'[Lumin] Groq HTTPError {exc.code}: {err_body}')
    raise ProviderError(f'Groq HTTP {exc.code}: {err_body[:250]}')
  except urlerror.URLError as exc:
    raise ProviderError(f'Groq URL error: {exc.reason}')

  try:
    parsed = json.loads(body)
  except json.JSONDecodeError as exc:
    print(f'[Lumin] Groq returned non-JSON body: {body[:1000]}')
    traceback.print_exc()
    raise ProviderError(f'Groq JSON decode error: {exc}')

  content = (
    parsed.get('choices', [{}])[0]
    .get('message', {})
    .get('content', '')
    .strip()
  )
  if not content:
    raise ProviderError('Groq returned empty content')

  return content


@app.post('/api/chat', response_model=ChatResponse)
def chat(payload: ChatRequest) -> ChatResponse:
  global ACTIVE_MODEL
  # Determine intent and possibly auto-switch mode
  requested_intent = detect_intent(payload.message)
  effective_mode = payload.mode
  # If the heuristic detects story/game/music intent, prefer that mode
  if payload.mode == 'normal' and requested_intent in ('story', 'game', 'music'):
    effective_mode = requested_intent if requested_intent != 'music' else 'normal'

  # Load short persist memory for this child and include in prompt if not provided
  memories = _load_memories()
  child_mem = memories.get(payload.child_name.strip(), [])
  # Build memory context from last few personalized items if payload didn't include memory_context
  if not (payload.memory_context or '').strip() and child_mem:
    # join last 6 interactions
    joined = ' | '.join([f"{it.get('role')}: {it.get('text')}" for it in child_mem[-6:]])
    memory_context = joined
  else:
    memory_context = payload.memory_context or ''

  # Derive a short profile summary to help the model personalize and "learn" between turns
  try:
    profile_summary = _derive_profile(child_mem)
    if profile_summary:
      if memory_context:
        memory_context = f"{memory_context} ; Profile: {profile_summary}"
      else:
        memory_context = f"Profile: {profile_summary}"
  except Exception as exc:
    print(f'[Lumin] profile derive failed: {exc}')

  # Include any saved story state so the model continues narrative consistently
  try:
    story_states = _load_story_states()
    sstate = story_states.get(payload.child_name.strip())
    if sstate:
      # include concise story state summary if present
      story_summary = sstate.get('summary') or ''
      if story_summary:
        memory_context = f"{memory_context} ; StoryState: {story_summary}" if memory_context else f"StoryState: {story_summary}"
  except Exception as exc:
    print(f'[Lumin] story-state include failed: {exc}')

  prompt = build_system_prompt(payload.child_name.strip(), effective_mode, memory_context, payload.language)
  mode_to_tokens = {
    'normal': 80,
    'story': 180,
    'game': 100,
  }
  max_tokens = mode_to_tokens.get(effective_mode, 120)

  if GROQ_API_KEY:
    try:
      reply = generate_with_groq(prompt, payload.message.strip(), max_tokens)
      print(f'[Lumin] Groq model used: {GROQ_MODEL}')
      structured = None
      if isinstance(reply, str) and '---STRUCTURED---' in reply:
        parts = reply.split('---STRUCTURED---')
        human = parts[0].strip()
        jsonpart = '\n'.join(parts[1:]).strip()
        try:
          structured = _json.loads(jsonpart)
          reply = human
        except Exception:
          # malformed JSON from model; we'll attempt a robust fallback below
          structured = None
          print('[Lumin] malformed structured JSON from Groq model; will attempt fallback')
      # If we're in story mode, ensure we always return a usable structured object.
      if effective_mode == 'story':
        try:
          if not structured or not isinstance(structured, dict):
            # Attempt to parse numbered choices from the human-readable reply
            lines = (reply or '').split('\n')
            # collect lines that look like choices: starting with 1) or 1. or '1) '
            choice_lines = [l.strip() for l in lines if l.strip().startswith('1') or l.strip().startswith('1)') or l.strip().startswith('1.')]
            choices = []
            if choice_lines:
              # try to extract two choices by scanning for 1) and 2)
              text = '\n'.join(lines)
              import re
              found = re.findall(r'^[ \t]*[12][\)\.:]?\s*(.+)$', text, flags=re.M)
              if found and len(found) >= 2:
                choices = [found[0].strip(), found[1].strip()]
            # If we have two choices, build structured object
            if len(choices) == 2:
              structured = {
                'episode': (reply or '').split('\n\n')[0].strip(),
                'choices': choices,
                'clarify': False,
                'question': None,
                'characters': []
              }
            else:
              # final fallback: safe defaults to avoid frontend failures
              structured = {
                'episode': (reply or '').strip()[:600],
                'choices': ['Continue exploring', 'Return to the village'],
                'clarify': False,
                'question': None,
                'characters': []
              }
              print('[Lumin] using fallback structured object for story mode')
        except Exception as _exc:
          print(f'[Lumin] error constructing fallback structured object: {_exc}')
      # Save interaction to memory (child message + assistant short summary)
      memory_update_local = None
      try:
        entry = {'role': 'child', 'text': payload.message.strip()}
        memories.setdefault(payload.child_name.strip(), []).append(entry)
        # extract short facts from this message to grow personalization
        try:
          mem_fact = _extract_memory_facts(payload.message.strip())
          if mem_fact:
            memories[payload.child_name.strip()].append({'role': 'profile', 'text': mem_fact})
            memory_update_local = mem_fact
        except Exception as _:
          memory_update_local = None

        if structured and isinstance(structured, dict):
          # store story choice summary if present
          memories[payload.child_name.strip()].append({'role': 'assistant', 'text': structured.get('episode', reply)})
        else:
          memories[payload.child_name.strip()].append({'role': 'assistant', 'text': (reply or '')[:300]})
        # keep memory trimmed
        memories[payload.child_name.strip()] = memories[payload.child_name.strip()][-40:]
        _save_memories(memories)
      except Exception as exc:
        print(f'[Lumin] memory save failed: {exc}')
      return ChatResponse(reply=reply, structured=structured, suggested_mode=effective_mode, memory_update=memory_update_local or (memory_context or None))
    except AuthProviderError as exc:
      print(f'[Lumin] Groq auth error: {exc}; falling back to Gemini')
    except RateLimitError:
      print('[Lumin] Groq rate-limited; falling back to Gemini')
    except ProviderError as exc:
      print(f'[Lumin] Groq error: {exc}; falling back to Gemini')

  if not GEMINI_API_KEY:
    return ChatResponse(reply="I'm here for you 💛")

  for model_name in candidate_models():
    try:
      reply = generate_with_retry(prompt, payload.message.strip(), model_name, max_tokens)
      ACTIVE_MODEL = model_name
      print(f'[Lumin] Gemini model used: {model_name}')
      structured = None
      if isinstance(reply, str) and '---STRUCTURED---' in reply:
        parts = reply.split('---STRUCTURED---')
        human = parts[0].strip()
        jsonpart = '\n'.join(parts[1:]).strip()
        try:
          structured = _json.loads(jsonpart)
          reply = human
        except Exception:
          structured = None
          print('[Lumin] malformed structured JSON from Gemini model; will attempt fallback')
      # If we're in story mode, ensure structured exists to avoid frontend breakage
      if effective_mode == 'story':
        try:
          if not structured or not isinstance(structured, dict):
            lines = (reply or '').split('\n')
            choice_lines = [l.strip() for l in lines if l.strip().startswith('1') or l.strip().startswith('1)') or l.strip().startswith('1.')]
            choices = []
            if choice_lines:
              import re
              found = re.findall(r'^[ \t]*[12][\)\.:]?\s*(.+)$', '\n'.join(lines), flags=re.M)
              if found and len(found) >= 2:
                choices = [found[0].strip(), found[1].strip()]
            if len(choices) == 2:
              structured = {
                'episode': (reply or '').split('\n\n')[0].strip(),
                'choices': choices,
                'clarify': False,
                'question': None,
                'characters': []
              }
            else:
              structured = {
                'episode': (reply or '').strip()[:600],
                'choices': ['Continue exploring', 'Return to the village'],
                'clarify': False,
                'question': None,
                'characters': []
              }
              print('[Lumin] using fallback structured object for story mode')
        except Exception as _exc:
          print(f'[Lumin] error constructing fallback structured object: {_exc}')
      # Save interaction into memory
      try:
        entry = {'role': 'child', 'text': payload.message.strip()}
        memories.setdefault(payload.child_name.strip(), []).append(entry)
        # extract short facts from this message to grow personalization
        memory_update_local = None
        try:
          mem_fact = _extract_memory_facts(payload.message.strip())
          if mem_fact:
            memories[payload.child_name.strip()].append({'role': 'profile', 'text': mem_fact})
            memory_update_local = mem_fact
        except Exception:
          memory_update_local = None

        if structured and isinstance(structured, dict):
          memories[payload.child_name.strip()].append({'role': 'assistant', 'text': structured.get('episode', reply)})
        else:
          memories[payload.child_name.strip()].append({'role': 'assistant', 'text': (reply or '')[:300]})
        memories[payload.child_name.strip()] = memories[payload.child_name.strip()][-40:]
        _save_memories(memories)
      except Exception as exc:
        print(f'[Lumin] memory save failed: {exc}')
      return ChatResponse(reply=reply or "I'm here for you 💛", structured=structured, suggested_mode=effective_mode, memory_update=memory_update_local or (memory_context or None))
    except NotFound:
      # Try next candidate model if this one is unavailable.
      continue
    except (ResourceExhausted, TooManyRequests):
      # After retries on this model, try the next model variant.
      continue
    except Exception as exc:
      print(f'[Lumin] Gemini error on {model_name}: {exc}')
      continue

  return ChatResponse(reply="I'm here for you 💛 Let's keep going 🌟")
