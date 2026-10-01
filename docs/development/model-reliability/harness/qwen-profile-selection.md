# Qwen Harness Profile Selection (Mac, port 8087)

Three validated production Qwen profiles share one llama-server port
(`http://192.168.68.52:8087/v1`). **Only one profile can serve port 8087
at a time.**

> **Selecting a harness/client profile does NOT switch llama-server.**
> Before any evaluation, the operator must confirm the running server's
> `/v1/models` id and `/props` (`n_ctx`, `modalities.vision`) match the
> selected profile. There is no automation here that restarts, stops, or
> reconfigures llama-server; server-side properties (GGUF file, mmproj,
> context allocation, MTP/speculative decoding, GPU offload, KV cache,
> batch size, slot count) belong to the production launchers only.

## Profiles

| Profile                 | Model ID (client)                | Context | Input      | Server-side expectation                                                                            |
| ----------------------- | -------------------------------- | ------: | ---------- | -------------------------------------------------------------------------------------------------- |
| `qwen-unsloth-80k-text` | `qwen3.8-27b-unsloth-ud-iq3xxs`  |   80896 | text       | `Qwen3.8-27B-UD-IQ3_XXS.gguf`, no mmproj, MTP on, 1 slot                                           |
| `qwen-gsq-96k-text`     | `qwen3.8-27b-gsq-rco-96k-text`   |   97280 | text       | `Qwen3.8-27B-GSQ-RCO-IQ3_XXS-mtp.gguf`, no mmproj, MTP on, 1 slot                                  |
| `qwen-gsq-80k-vision`   | `qwen3.8-27b-gsq-rco-80k-vision` |   80896 | text+image | GSQ-RCO production GGUF **plus** `mmproj-Qwen3.8-27B-BF16.gguf` loaded server-side, MTP on, 1 slot |

`qwen-gsq-96k-text` is valid only when the server reports alias
`qwen3.8-27b-gsq-rco-96k-text` with `n_ctx=97280` and `vision=false`.
The vision client profile is valid only when the server actually runs
with the BF16 vision projector loaded; a text-only server will refuse
image parts mid-turn.

Note: `docs/development/README(4).md` describes an older production set
(alias `qwen3.8-27b-gsq-rco` for a 96K vision profile). The aliases above
are the current scheme, corroborated by live `/v1/models` evidence
(2026-09-29). That README is intentionally left untouched.

Legacy: `~/.config/opencode/opencode.qwen-local-eval-96k.jsonc` uses the
obsolete `qwen3.8-27b-gsq-rco` alias and wrongly declares image input for
a text profile. It is superseded by the files below and must not be used.

## Operator selection commands (client only — never touch llama-server)

Endpoint for all profiles: `http://192.168.68.52:8087/v1`.

### OpenCode v1 (1.18.30) — `OPENCODE_CONFIG` selects provider+policy

```sh
V1C=~/.config/opencode
# unsloth 80k text
OPENCODE_CONFIG=$V1C/opencode.qwen-local-eval-unsloth-8087.v1.jsonc \
  opencode run -m qwen-local/qwen3.8-27b-unsloth-ud-iq3xxs "<prompt>"
# gsq 96k text
OPENCODE_CONFIG=$V1C/opencode.qwen-local-eval-gsq-96k-text-8087.v1.jsonc \
  opencode run -m qwen-local/qwen3.8-27b-gsq-rco-96k-text "<prompt>"
# gsq 80k vision
OPENCODE_CONFIG=$V1C/opencode.qwen-local-eval-gsq-80k-vision-8087.v1.jsonc \
  opencode run -m qwen-local/qwen3.8-27b-gsq-rco-80k-vision "<prompt>"
```

### OpenCode v2 (2.0.18) — model routing comes from the GLOBAL config

Service-backed `run` ignores `OPENCODE_CONFIG` for provider/model
routing; all three models are registered in the global `qwen-local`
provider, so selection is by `-m` only. Per-profile files carry
policy/standalone config:

```sh
V2C=~/.config/opencode
# unsloth 80k text
opencode run --format json -m qwen-local/qwen3.8-27b-unsloth-ud-iq3xxs "<prompt>"
# gsq 96k text
opencode run --format json -m qwen-local/qwen3.8-27b-gsq-rco-96k-text "<prompt>"
# gsq 80k vision
opencode run --format json -m qwen-local/qwen3.8-27b-gsq-rco-80k-vision "<prompt>"
# standalone (honors OPENCODE_CONFIG end-to-end):
OPENCODE_CONFIG=$V2C/opencode.qwen-local-eval-gsq-96k-text-8087.jsonc \
  opencode run --standalone --format json -m qwen-local/qwen3.8-27b-gsq-rco-96k-text "<prompt>"
```

After editing the global config: `opencode reload` (reloads the v2
background service config only).

### DSH (0.1.5-rc.3) — active model is `settings.yaml:agent-default-model`

All three ids are defined under the single `local-llama-cpp` provider.
DSH has no `--model` flag; the documented selection mechanism is the
`agent-default-model` section. For controlled runs, point it at the
profile matching the running server (then restore):

```sh
DSH_BIN=/Users/cortezashley/.npm/_npx/c0774c5fa1755750/node_modules/.bin/dsh
node $DSH_BIN --profile headless "<task>"
```

`runner_dsh.py --model-label` records a label only; it does not select
the model (frozen runner, intentionally untouched).

### Pi (0.87.1) — isolated `PI_CODING_AGENT_DIR`

```sh
# provision once per operator session (isolated; never ~/.pi):
export PI_AGENT=/tmp/pi-qwen-8087 && mkdir -p $PI_AGENT
cp docs/development/model-reliability/harness/pi-qwen-local-8087-models.json \
   $PI_AGENT/models.json
export PI_CODING_AGENT_DIR=$PI_AGENT
pi --mode json --print --model qwen-local/qwen3.8-27b-gsq-rco-96k-text \
   --no-extensions --no-skills --no-prompt-templates --approve \
   --session-dir $PI_AGENT/sessions "<prompt>"
```

Substitute `--model qwen-local/<id>` for the other two profiles.

## Cross-harness semantics (not equivalent — documented, not normalized)

- Output caps: OpenCode `limit.output 4096`; DSH `maxTokens 32768`;
  Pi `maxTokens 32768`. Context values are authoritative; output caps are
  harness-native and intentionally differ.
- Reasoning: DSH pins `reasoning: low` / `reasoningEffort: low`;
  Pi uses engine-default thinking; OpenCode has no equivalent knob here;
  llama-server owns the chat/reasoning format.
- Vision representation: Pi `input: ["text","image"]` (schema-verified);
  DSH `input: [text, image]` (schema-verified); OpenCode v1 model entries
  tolerate a `capabilities.input` key (parse/run probe reached the model
  call); OpenCode v2 2.0.18 **must not** carry `capabilities` — it makes
  v2 drop the entire custom provider from the merged config (verified via
  `debug config`), so v2 vision capability is undocumented-client-side
  and image support depends on the server actually running mmproj.
