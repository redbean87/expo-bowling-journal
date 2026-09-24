# Local AI Production Quick Reference

`E:\LocalAI` is this machine's local AI runtime and production environment.
Production currently supports **three models**: two Qwen3.8-27B profiles served
by `llama-server.exe` (Vulkan) on **port 8087**, and GPT-OSS 20B served by
**Ollama** on **port 11434**.

> Only **one** Qwen llama-server profile may occupy port 8087 at a time.
> GPT-OSS is a separate Ollama-served profile.

GLM-4.7-Flash is not part of the production set.

---

## Hardware / Runtime

| Item | Value |
| --- | --- |
| OS | Windows 11 Insider Preview, build **26340**, 64-bit |
| CPU | AMD Ryzen 7 7800X3D (8C/16T) |
| RAM | 32 GB DDR5 |
| GPU | AMD Radeon RX 9070 XT, ~16 GB VRAM |
| Qwen runtime | llama.cpp **b11046**, Vulkan build |
| Runtime path | `E:\LocalAI\runtimes\llama.cpp\vulkan-b11046\build-vulkan\bin\llama-server.exe` |

---

## Production Models

| Model | Validated context | Backend | Vision | Port |
| --- | ---: | --- | --- | ---: |
| Qwen3.8-27B GSQ-RCO 96K Vision | 96,000 | llama.cpp / Vulkan | Yes | 8087 |
| Qwen3.8-27B Unsloth 80K | 80,000 | llama.cpp / Vulkan | No | 8087 |
| GPT-OSS 20B | 122,880 | Ollama | No | 11434 |

### 1. Qwen3.8-27B GSQ-RCO 96K Vision

| Item | Value |
| --- | --- |
| Model | `E:\LocalAI\models\qwen3.8-27b\gsq-rco\production\Qwen3.8-27B-GSQ-RCO-IQ3_XXS-mtp.gguf` |
| mmproj | `E:\LocalAI\models\qwen3.8-27b\gsq-rco\production\mmproj-Qwen3.8-27B-BF16.gguf` |
| Alias | `qwen3.8-27b-gsq-rco` |
| Context | occupancy 96,000 / `n_ctx` 97,280 |
| Port | 8087 |
| Launcher | `E:\LocalAI\production\scripts\start-qwen3.8-27b-gsq-rco-96k-vision.ps1` |

Production flags:

```text
-ngl99 -c97280 -fa on -np1 -ctk q8_0 -ctv q8_0 -b512 -ub128 -t8 --jinja --metrics --spec-type draft-mtp --spec-draft-n-max3
```

BF16 mmproj loaded; vision and video enabled; MTP speculative decoding active.

### 2. Qwen3.8-27B Unsloth 80K

| Item | Value |
| --- | --- |
| Model | `E:\LocalAI\models\qwen3.8-27b\unsloth\production\Qwen3.8-27B-UD-IQ3_XXS.gguf` |
| mmproj | none (text-only) |
| Alias | `qwen3.8-27b-unsloth-ud-iq3xxs` |
| Context | occupancy 80,000 / `n_ctx` 80,896 |
| Port | 8087 |
| Launcher | `E:\LocalAI\production\scripts\start-qwen3.8-27b-unsloth-80k.ps1` |

Production flags are the same established llama.cpp flags as the GSQ launcher,
without mmproj.

### 3. GPT-OSS 20B

Served by **Ollama** (not the Qwen `llama.cpp` launcher).

| Item | Value |
| --- | --- |
| Ollama tag | `gpt-oss:20b` |
| Storage | `E:\OllamaModels` |
| Validated production context | `num_ctx=122880` |
| Port | 11434 |

122,880 is the **validated production context**, not a claim of theoretical
maximum.

---

## Start / Stop

GSQ-RCO 96K vision:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "E:\LocalAI\production\scripts\start-qwen3.8-27b-gsq-rco-96k-vision.ps1"
powershell -NoProfile -ExecutionPolicy Bypass -File "E:\LocalAI\production\scripts\stop-qwen3.8-27b-gsq-rco-96k-vision.ps1"
```

Unsloth 80K text:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "E:\LocalAI\production\scripts\start-qwen3.8-27b-unsloth-80k.ps1"
powershell -NoProfile -ExecutionPolicy Bypass -File "E:\LocalAI\production\scripts\stop-qwen3.8-27b-unsloth-80k.ps1"
```

- The two Qwen profiles use the **same port (8087)** and therefore **cannot run simultaneously**.
- Start/stop are idempotent; a start refuses to launch if port 8087 is already held.

Use these supplied launchers for production; do not promote legacy launchers
under `E:\LocalAI\production\profiles\` as current production interfaces.

---

## Health / Status

```powershell
# Qwen HTTP health
Invoke-WebRequest http://127.0.0.1:8087/health -UseBasicParsing | Select-Object StatusCode

# Qwen served model / context / modalities
Invoke-WebRequest http://127.0.0.1:8087/props -UseBasicParsing | Select-Object -ExpandProperty Content

# Port 8087 owner
Get-NetTCPConnection -LocalPort 8087 -State Listen | Select-Object LocalAddress,OwningProcess

# Qwen server process
Get-Process llama-server -ErrorAction SilentlyContinue

# Ollama status and served model
ollama list
ollama ps
```

---

## Ollama Configuration

Current production-relevant environment (user scope):

```text
OLLAMA_MODELS=E:\OllamaModels
OLLAMA_HOST=0.0.0.0:11434
OLLAMA_CONTEXT_LENGTH=65536
OLLAMA_FLASH_ATTENTION=1
OLLAMA_KV_CACHE_TYPE=q8_0
```

`OLLAMA_CONTEXT_LENGTH=65536` is the global/default environment setting. The
validated GPT-OSS benchmark/production context is `num_ctx=122880`, set per run;
the global environment is not changed. Do not modify the Ollama configuration
or manually reorganize `E:\OllamaModels`.

---

## LAN / API Access

Windows host LAN address: `192.168.68.52`

```text
Qwen server:            http://192.168.68.52:8087
Qwen OpenAI-compatible: http://192.168.68.52:8087/v1   (no API key)
Ollama API:             port 11434
```

The existing Private-network Windows Firewall rule for TCP 8087 is in place and
unchanged. Do not modify firewall or network configuration. Port 11434 (Ollama)
is not the Qwen production endpoint.

---

## Filesystem

```text
E:\LocalAI\
├── audit\
├── benchmarks\
├── docs\
├── experiments\
├── models\
│   └── qwen3.8-27b\
│       ├── gsq-rco\production\
│       └── unsloth\production\
├── production\
│   ├── profiles\
│   ├── scripts\
│   ├── state\
│   └── logs\
└── runtimes\
    └── llama.cpp\
        └── vulkan-b11046\
```

`E:\OllamaModels` remains separate from `E:\LocalAI\models`.

---

## Operational Rules

- One Qwen profile at a time on port 8087.
- Use the supplied production launchers rather than ad-hoc commands.
- Do not manually move or rename production model/runtime files.
- Keep benchmark/evidence material separate from production.
- Preserve the existing Ollama model store; do not reorganize it by hand.
- Do not modify firewall, network, or Ollama configuration.

---

## Benchmark Summary

| Model | Validated context | Status | Primary use | Warm decode |
| --- | ---: | --- | --- | ---: |
| Qwen3.8-27B GSQ-RCO | 96K | Production | Long-context multimodal | 16.568 tok/s |
| Qwen3.8-27B Unsloth | 80K | Production | Long-context text | 29.107 tok/s |
| GPT-OSS 20B | 122,880 | Production | Reasoning / agent workloads | 70.472 tok/s |

---

## Evidence

Detailed benchmark methodology, validation reports, failed candidates, rejected
configurations, and historical evidence live under:

```text
E:\LocalAI\benchmarks\
E:\LocalAI\audit\
```

They are intentionally not reproduced in this production README.
