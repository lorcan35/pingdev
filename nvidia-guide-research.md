# NVIDIA OpenClaw Guide — Full Research
## Source: nvidia.com/en-eu/geforce/news/open-claw-rtx-gpu-dgx-spark-guide/
## Status: PARKED — sandbox test only, don't touch current setup
## Date: 2026-02-14

---

## What NVIDIA Published
A step-by-step guide for running OpenClaw locally on RTX GPUs and DGX Spark, using Ollama or LM Studio as inference backends. Published Feb 12, 2026.

Key message: "Cloud LLMs can incur significant costs due to the always-on nature of OpenClaw. And they require you to upload your personal data." They position local execution as cost + privacy win.

---

## Models NVIDIA Recommends (by GPU tier)

### Tier 1: 8-12GB GPUs → qwen3-4B-Thinking-2507
| Spec | Value |
|------|-------|
| **Parameters** | 4B dense |
| **Family** | Qwen3 (Alibaba) |
| **Context** | 32K+ |
| **Type** | Thinking/reasoning model |
| **VRAM** | ~3-4GB quantized |
| **Architecture** | Dense transformer |
| **Benchmarks** | MMLU ~85%, strong GSM8K |
| **Notes** | 2507 variant = separate thinking/instruct models (fixed toggle issue from earlier Qwen3). Smallest viable model for OpenClaw. |
| **Our take** | Way too small for serious agent work. Fine for basic Q&A but will hallucinate on complex tool use. We have 128GB — this is irrelevant to us. |

### Tier 2: 16GB GPUs → gpt-oss-20b
| Spec | Value |
|------|-------|
| **Parameters** | 21B total, 3.6B active per token (MoE) |
| **Family** | GPT-OSS (OpenAI, Apache 2.0) |
| **Context** | 128K (131,072 dense layers via YaRN) |
| **Type** | MoE reasoning model with tool use |
| **VRAM** | ~16GB with MXFP4 quantization |
| **Architecture** | MoE (top-4 experts), GQA, SWA, RoPE, Gated SwiGLU, Attention Sinks |
| **Quantization** | Native MXFP4 (4.25 bits/param) |
| **Post-training** | Reasoning, tool use (browsing, Python, dev functions), safety via CoT RL |
| **Tokenizer** | o200k_harmony (BPE via TikToken) |
| **Benchmarks** | Strong reasoning, competitive with much larger models due to MoE efficiency |
| **Notes** | OpenAI's first open-source since GPT-2 (2019). Can run in browser via WebGPU. Being fine-tuned by community. 128K context is huge for agents. |
| **Our take** | Interesting middle ground. 128K context is great for OpenClaw. Only 3.6B active params though — less "smart" than it sounds. Could be useful as a fast router/planner while larger models handle execution. |

### Tier 3: 24-48GB GPUs → Nemotron-3-Nano-30B-A3B
| Spec | Value |
|------|-------|
| **Parameters** | 30B total, 3B active per token (MoE) |
| **Family** | Nemotron 3 (NVIDIA) |
| **Context** | 128K+ |
| **Type** | Reasoning MoE, optimized for agentic use |
| **VRAM** | ~15-20GB BF16, ~8GB NVFP4 |
| **Architecture** | MoE with reasoning token generation |
| **Quantization** | NVFP4 version achieves 99.4% accuracy of BF16 |
| **Benchmarks** | Leads on LiveCodeBench, GPQA Diamond, AIME 2025, BFCL, IFBench (vs open models <30B) |
| **Availability** | Amazon SageMaker JumpStart, Ollama, LM Studio |
| **Notes** | NVIDIA's own model, specifically designed for DGX Spark. NVFP4 quantization is DGX Spark native (Blackwell GPU feature). Leads benchmarks for agentic inference under 30B. |
| **Our take** | THIS is the one to test. NVIDIA-optimized for our exact hardware. NVFP4 is a Blackwell-native format we can't use anywhere else. 99.4% accuracy at 4-bit. Designed for agents. Should benchmark against our Qwen3-32B. |

### Tier 4: 96-128GB GPUs → gpt-oss-120b
| Spec | Value |
|------|-------|
| **Parameters** | 117B total, 5.1B active per token (MoE) |
| **Family** | GPT-OSS (OpenAI, Apache 2.0) |
| **Context** | 128K (131,072 via YaRN) |
| **Type** | Large MoE reasoning model |
| **VRAM** | ~60GB with MXFP4 |
| **Architecture** | Same as 20B but 36 layers (vs 24), 8 KV heads |
| **Speed on DGX Spark** | 10-15 tok/s for single user (community reports) |
| **Concurrency** | 1-2 simultaneous users on DGX Spark |
| **Notes** | We ALREADY have this model (derestricted variant) in LM Studio. NVIDIA specifically recommends it for 96-128GB systems = us. "Requires about 60GB of RAM" per Tom's Hardware. |
| **Our take** | Already running. Already tested. The derestricted variant removes safety guardrails which is useful for pentesting/red team work. 128K context is perfect for OpenClaw agent work. Main limitation is speed (~10-15 tok/s). |

---

## Methods NVIDIA Recommends

### Inference Backends
1. **LM Studio** — "recommended for raw performance, uses Llama.cpp"
   - Install: `curl -fsSL https://lmstudio.ai/install.sh | bash`
   - Load: `lms get openai/gpt-oss-20b && lms load openai/gpt-oss-20b --context-length 32768`
   - We already have LM Studio v0.0.47 ✅

2. **Ollama** — "additional developer tools to facilitate deployment"
   - Install: `curl -fsSL https://ollama.com/install.sh | sh`
   - Load: `ollama pull gpt-oss:20b && ollama run gpt-oss:20b /set parameter num_ctx 32768`
   - We already have Ollama ✅

### OpenClaw Config
```json
"models": {
  "mode": "merge",
  "providers": {
    "lmstudio": {
      "baseUrl": "http://localhost:1234/v1",
      "apiKey": "lmstudio",
      "api": "openai-responses",
      "models": [{
        "id": "openai/gpt-oss-20b",
        "contextWindow": 32768,
        "maxTokens": 4096
      }]
    }
  }
}
```

### Key Recommendation: 32K+ context window
NVIDIA says 32,768 tokens minimum. We're running 131,072 (4x their recommendation).

---

## NVIDIA's Security Warnings
- Run on separate/clean PC or VM
- Don't give it access to real accounts — create dedicated ones
- Be careful with skills — limit to community-vetted ones
- Ensure channels aren't accessible without auth
- "No way to completely protect against all risk"

### The Exposure Problem
- 21,639 exposed instances (Jan 31, 2025) per Censys
- 40,000+ by early Feb per SecurityScorecard
- 63% classified as vulnerable
- 12,000+ exploitable via RCE
- Plaintext API keys, Telegram tokens, Slack OAuth found exposed
- US has most exposed instances, then China, Singapore

---

## What's New vs What We Already Have

| Feature | NVIDIA Guide | Our Setup | Delta |
|---------|-------------|-----------|-------|
| GPT-OSS 120B | Recommended for 128GB | Already running (derestricted) | ✅ Ahead |
| LM Studio | Recommended backend | Already installed v0.0.47 | ✅ Ahead |
| Ollama | Alternative backend | Already installed | ✅ Ahead |
| Context window | 32K recommended | 131K configured | ✅ 4x ahead |
| Security | Basic warnings | ClawSec suite + audit watchdog + skill vetting | ✅ Way ahead |
| Nemotron-3-Nano | Recommended for 24-48GB | NOT tested | ⚠️ Should test |
| NVFP4 quantization | Mentioned for DGX Spark | NOT using | ⚠️ Blackwell-native, should test |
| WSL setup | Windows guide | Native Linux (DGX OS) | ✅ N/A |
| Dual DGX clustering | 256GB combined | Single unit | N/A (we don't need it) |

---

## What to Test in Sandbox

### Priority 1: Nemotron-3-Nano-30B-A3B (NVFP4)
- NVIDIA's own model, optimized for our exact hardware
- NVFP4 is a Blackwell-native quantization format
- 99.4% accuracy of BF16 at fraction of the memory
- Best-in-class for agentic inference under 30B
- Could replace Qwen3-32B as default local model if it benchmarks better

### Priority 2: GPT-OSS-20B as fast router
- Only 3.6B active params = very fast
- 128K context = great for agent orchestration
- Use as planner/router while larger models execute
- Compare against MiniMax M2.5 for the "fast cheap worker" role

### Priority 3: NVFP4 quantization for GPT-OSS-120B
- We're running derestricted variant, probably in FP16 or Q4
- NVFP4 could give us better speed with near-identical accuracy
- Need to check if LM Studio supports NVFP4 on Blackwell

### Sandbox Plan
- Spin up a separate LM Studio instance on a different port (e.g., :1235)
- Load test models there without touching :1234 production
- Benchmark: tokens/sec, VRAM usage, quality on standard prompts
- Compare against our current Qwen3-32B and GPT-OSS-120B-derestricted
- Only promote to production if clearly better

---

## DGX Spark Software Optimizations (from NVIDIA Tech Blog)
- **Llama.cpp updates**: 35% performance uplift for MoE models on DGX Spark
- **NVFP4**: ~40% memory reduction vs FP8, maintaining high accuracy
- **Dual Spark clustering**: 200Gbps ConnectX-7 networking, 256GB combined
- **Qwen-235B on dual Spark**: 2.6x performance with NVFP4 + speculative decoding vs FP8
- **DGX Spark now NVIDIA-Certified Systems** program member

---

## Bottom Line
We're already running NVIDIA's recommended setup. The gaps are:
1. **Nemotron-3-Nano** — NVIDIA's own agent-optimized model we haven't tested
2. **NVFP4 quantization** — Blackwell-native format we're not using yet
3. **Llama.cpp MoE optimizations** — 35% free performance we might be missing

All testable in sandbox without touching production. Park until ready.
