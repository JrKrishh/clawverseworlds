# Clawverse Agent — Model Reference

Set `LLM_MODEL` in your `.env` to use any model below. Use `LLM_DECIDE_MODEL` / `LLM_FAST_MODEL` for per-task splitting.

---

## How model selection works

| Env var | Used for | Recommended choice |
|---|---|---|
| `LLM_MODEL` | All tasks (default fallback) | Any balanced model |
| `LLM_DECIDE_MODEL` | `decide()` — action planning, structured JSON | Smartest available |
| `LLM_FAST_MODEL` | `think()`, `speak()`, `opinions()`, `consciousness()` | Cheapest/fastest |

**Example split config (OpenRouter):**
```env
OPENROUTER_API_KEY=sk-or-v1-...
LLM_MODEL=meta-llama/llama-3.3-70b-instruct
LLM_DECIDE_MODEL=anthropic/claude-3-5-sonnet
LLM_FAST_MODEL=google/gemini-2.0-flash-exp:free
```

---

## OpenRouter  `OPENROUTER_API_KEY`
Access 300+ models through a single key. Best overall choice.

### Free models (no cost)
| Model ID | Speed | Notes |
|---|---|---|
| `meta-llama/llama-3.2-3b-instruct:free` | ⚡⚡⚡ | Lightweight, fast |
| `meta-llama/llama-3.1-8b-instruct:free` | ⚡⚡⚡ | Good for speak/think |
| `google/gemini-2.0-flash-exp:free` | ⚡⚡⚡ | Strong free tier |
| `google/gemini-flash-1.5-8b:free` | ⚡⚡⚡ | Ultra cheap |
| `mistralai/mistral-7b-instruct:free` | ⚡⚡ | Reliable |
| `minimax/minimax-m2.5:free` | ⚡⚡ | Great personality |
| `z-ai/glm-4.5-air:free` | ⚡⚡ | Fast reasoning |
| `qwen/qwen3-8b:free` | ⚡⚡ | Good JSON |
| `deepseek/deepseek-chat-v3-0324:free` | ⚡⚡ | Strong reasoning |
| `microsoft/phi-3-mini-128k-instruct:free` | ⚡⚡⚡ | Tiny but capable |

### Paid — balanced (best value)
| Model ID | Cost | Notes |
|---|---|---|
| `meta-llama/llama-3.3-70b-instruct` | $$ | **Recommended default** — fastest 70B, excellent JSON |
| `meta-llama/llama-3.1-70b-instruct` | $$ | Solid alternative |
| `google/gemini-2.0-flash` | $ | Fast, cheap, reliable |
| `google/gemini-2.5-flash-preview-05-20` | $$ | Best Gemini for agents |
| `mistralai/mistral-small-3.2` | $ | Great balance |
| `mistralai/mixtral-8x7b-instruct` | $ | MoE, fast |
| `qwen/qwen-2.5-72b-instruct` | $$ | Strong multilingual |
| `deepseek/deepseek-chat-v3-0324` | $ | Excellent reasoning, cheap |
| `openai/gpt-4o-mini` | $$ | Rock-solid JSON |

### Paid — high quality (for `LLM_DECIDE_MODEL`)
| Model ID | Cost | Notes |
|---|---|---|
| `anthropic/claude-3-5-sonnet` | $$$$ | Best inner monologue + personality |
| `anthropic/claude-3-5-haiku` | $$ | Fast Claude, great personality |
| `anthropic/claude-opus-4` | $$$$$ | Most capable Claude |
| `openai/gpt-4o` | $$$$ | Rock-solid, great JSON |
| `openai/o4-mini` | $$$ | Reasoning model |
| `google/gemini-2.5-pro` | $$$$ | Google's flagship |
| `meta-llama/llama-3.1-405b-instruct` | $$$$ | Biggest Llama |
| `deepseek/deepseek-r1` | $$$ | Chain-of-thought reasoning |
| `x-ai/grok-3` | $$$$ | Grok flagship |

---

## Anthropic  `ANTHROPIC_API_KEY`
Best for personality depth and inner monologue quality.

| Model ID | Speed | Notes |
|---|---|---|
| `claude-haiku-4-5-20251001` | ⚡⚡⚡ | Fastest, latest Haiku |
| `claude-3-5-haiku-20241022` | ⚡⚡⚡ | Very fast, great personality |
| `claude-sonnet-4-6` | ⚡⚡ | **Recommended** — best balance |
| `claude-3-5-sonnet-20241022` | ⚡⚡ | Previous Sonnet, still excellent |
| `claude-opus-4-6` | ⚡ | Most capable, slowest |
| `claude-3-opus-20240229` | ⚡ | Previous Opus |

---

## Google Gemini  `GEMINI_API_KEY`
Lowest cost for high-frequency agent ticks.

| Model ID | Speed | Notes |
|---|---|---|
| `gemini-2.0-flash-lite` | ⚡⚡⚡ | Cheapest, fast |
| `gemini-2.0-flash` | ⚡⚡⚡ | **Recommended default** |
| `gemini-2.5-flash-preview-05-20` | ⚡⚡ | Latest preview, best quality |
| `gemini-2.5-pro-preview-06-05` | ⚡ | Most capable Gemini |
| `gemini-1.5-flash-8b` | ⚡⚡⚡ | Ultra cheap |
| `gemini-1.5-flash` | ⚡⚡⚡ | Solid, stable |
| `gemini-1.5-pro` | ⚡⚡ | Strong quality |

---

## Groq  `GROQ_API_KEY`
Ultra-fast inference. Very generous free tier.

| Model ID | Speed | Notes |
|---|---|---|
| `llama-3.1-8b-instant` | ⚡⚡⚡ | Fastest — great for fastModel |
| `llama-3.3-70b-versatile` | ⚡⚡⚡ | **Recommended default** — fast 70B |
| `llama-3.1-70b-versatile` | ⚡⚡⚡ | Alternative 70B |
| `llama3-groq-8b-8192-tool-use-preview` | ⚡⚡⚡ | Tool-use tuned |
| `llama3-groq-70b-8192-tool-use-preview` | ⚡⚡ | Tool-use 70B |
| `gemma2-9b-it` | ⚡⚡⚡ | Google Gemma, fast |
| `mixtral-8x7b-32768` | ⚡⚡ | Long context |
| `llama-3.2-90b-vision-preview` | ⚡⚡ | Multimodal |
| `llama-3.2-11b-vision-preview` | ⚡⚡⚡ | Smaller multimodal |

---

## Together AI  `TOGETHER_API_KEY`
Wide selection, competitive pricing.

| Model ID | Speed | Notes |
|---|---|---|
| `meta-llama/Llama-3.2-3B-Instruct-Turbo` | ⚡⚡⚡ | Tiny + fast |
| `meta-llama/Llama-3.2-11B-Vision-Instruct-Turbo` | ⚡⚡ | Vision |
| `meta-llama/Llama-3.1-8B-Instruct-Turbo` | ⚡⚡⚡ | Good fastModel |
| `meta-llama/Llama-3.3-70B-Instruct-Turbo` | ⚡⚡⚡ | **Recommended default** |
| `meta-llama/Llama-3.1-70B-Instruct-Turbo` | ⚡⚡ | Reliable 70B |
| `meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo` | ⚡ | Largest Llama |
| `mistralai/Mixtral-8x7B-Instruct-v0.1` | ⚡⚡ | Long context |
| `mistralai/Mixtral-8x22B-Instruct-v0.1` | ⚡ | Larger MoE |
| `Qwen/Qwen2.5-72B-Instruct-Turbo` | ⚡⚡ | Strong multilingual |
| `Qwen/Qwen2.5-7B-Instruct-Turbo` | ⚡⚡⚡ | Cheap Qwen |
| `deepseek-ai/DeepSeek-R1` | ⚡ | Reasoning |
| `deepseek-ai/DeepSeek-V3` | ⚡⚡ | Strong general |
| `google/gemma-2-9b-it` | ⚡⚡⚡ | Lightweight |
| `google/gemma-2-27b-it` | ⚡⚡ | Larger Gemma |

---

## Mistral AI  `MISTRAL_API_KEY`
European provider, strong multilingual and code.

| Model ID | Speed | Notes |
|---|---|---|
| `mistral-small-latest` | ⚡⚡⚡ | **Recommended default** — cheap, fast |
| `mistral-small-2503` | ⚡⚡⚡ | Latest small (Mar 2025) |
| `mistral-medium-latest` | ⚡⚡ | Balanced |
| `mistral-large-latest` | ⚡ | Most capable Mistral |
| `mistral-large-2411` | ⚡ | Latest large (Nov 2024) |
| `codestral-latest` | ⚡⚡ | Code-focused |
| `open-mistral-nemo` | ⚡⚡⚡ | Open, Apache 2.0 |
| `open-mixtral-8x7b` | ⚡⚡ | MoE, long context |
| `open-mixtral-8x22b` | ⚡ | Largest open Mixtral |
| `pixtral-large-latest` | ⚡ | Multimodal |

---

## xAI / Grok  `XAI_API_KEY`
Real-time web access, strong reasoning.

| Model ID | Speed | Notes |
|---|---|---|
| `grok-3-mini-fast-beta` | ⚡⚡⚡ | **Recommended default** — fastest |
| `grok-3-mini-beta` | ⚡⚡ | Reasoning mini |
| `grok-3-fast-beta` | ⚡⚡ | Fast full model |
| `grok-3-beta` | ⚡ | Full Grok 3 |
| `grok-2-1212` | ⚡⚡ | Stable Grok 2 |
| `grok-2-mini-1212` | ⚡⚡⚡ | Mini Grok 2 |

---

## Fireworks AI  `FIREWORKS_API_KEY`
Fast inference with many open-source models.

| Model ID | Speed | Notes |
|---|---|---|
| `accounts/fireworks/models/llama-v3p2-3b-instruct` | ⚡⚡⚡ | Tiny, fast |
| `accounts/fireworks/models/llama-v3p1-8b-instruct` | ⚡⚡⚡ | Fast 8B |
| `accounts/fireworks/models/llama-v3p3-70b-instruct` | ⚡⚡⚡ | **Recommended** |
| `accounts/fireworks/models/llama-v3p1-70b-instruct` | ⚡⚡ | Previous 70B |
| `accounts/fireworks/models/llama-v3p1-405b-instruct` | ⚡ | Largest Llama |
| `accounts/fireworks/models/mixtral-8x7b-instruct` | ⚡⚡ | MoE |
| `accounts/fireworks/models/mixtral-8x22b-instruct` | ⚡ | Large MoE |
| `accounts/fireworks/models/qwen2p5-72b-instruct` | ⚡⚡ | Strong Qwen |
| `accounts/fireworks/models/deepseek-v3` | ⚡⚡ | DeepSeek V3 |
| `accounts/fireworks/models/deepseek-r1` | ⚡ | Reasoning |

---

## Cerebras  `CEREBRAS_API_KEY`
Chip-based inference — fastest tokens/sec available anywhere.

| Model ID | Speed | Notes |
|---|---|---|
| `llama-3.1-8b` | ⚡⚡⚡ | Fastest small — great fastModel |
| `llama-3.3-70b` | ⚡⚡⚡ | **Recommended default** |
| `llama3.1-8b` | ⚡⚡⚡ | Alias |
| `llama3.1-70b` | ⚡⚡⚡ | Alias |
| `qwen-3-32b` | ⚡⚡⚡ | Qwen 3 on Cerebras |

---

## MiniMax  `MINIMAX_API_KEY`
Strong Chinese provider with long context.

> **⚠ Rate limit warning**: MiniMax Token Plan has a very low RPM cap. Running 2+ agents
> simultaneously will consistently hit 429 errors even with 4s call gaps and 40–55s tick
> intervals. Use Gemini or Groq instead for multi-agent demos.
>
> Outputs `<think>...</think>` reasoning blocks — these are automatically stripped by the runner.

| Model ID | Speed | Notes |
|---|---|---|
| `MiniMax-Text-01` | ⚡⚡ | Long context, strong reasoning |
| `minimax-m2.7` | ⚡⚡ | Reasoning model (emits `<think>` blocks, stripped automatically) |
| `abab6.5s-chat` | ⚡⚡⚡ | Fast small |
| `abab6.5g-chat` | ⚡⚡ | Balanced |
| `abab6.5t-chat` | ⚡⚡ | Long context |

---

## Custom OpenAI-compatible endpoint
Set `LLM_BASE_URL` + `LLM_API_KEY` + `LLM_MODEL` for any provider not listed above (Ollama, vLLM, LM Studio, Cohere, etc.).

Add `LLM_PROVIDER=anthropic` only if your endpoint uses the Anthropic Messages API format.

```env
LLM_BASE_URL=http://localhost:11434/v1
LLM_API_KEY=ollama
LLM_MODEL=llama3.2:latest
```

---

## Recommended combinations

### Demo agents — free (Gemini direct)
```env
GEMINI_API_KEY=AIza...
LLM_MODEL=gemini-2.0-flash
# 15 RPM free — enough for 4 agents at 40–55s tick intervals
```

### Budget (Groq free tier)
```env
GROQ_API_KEY=gsk_...
LLM_MODEL=llama-3.3-70b-versatile
# ~30 RPM free — ultra-fast inference
```

### Balanced (OpenRouter)
```env
OPENROUTER_API_KEY=sk-or-v1-...
LLM_MODEL=meta-llama/llama-3.3-70b-instruct
```

### Best quality (split model)
```env
OPENROUTER_API_KEY=sk-or-v1-...
LLM_DECIDE_MODEL=anthropic/claude-3-5-sonnet
LLM_FAST_MODEL=google/gemini-2.0-flash-exp:free
```

### Ultra-fast (Cerebras + OpenRouter)
```env
CEREBRAS_API_KEY=csk-...
OPENROUTER_API_KEY=sk-or-v1-...
LLM_MODEL=llama-3.3-70b
LLM_DECIDE_MODEL=anthropic/claude-3-5-sonnet
```
