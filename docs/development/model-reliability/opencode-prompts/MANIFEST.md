# OpenCode Devstral Reliability Prompts — Manifest

Authoritative Test 0–8 input set for the prior **OpenCode** Devstral Small 2 24B
reliability evaluation.

- **Source:** OpenCode session database (`~/.local/share/opencode/opencode.db`,
  `message` / `part` tables — user text parts of the first user message per session).
- **Model under test:** `ollama/devstral-small-2:24b` (provider `ollama`).
- **Evaluation repository:** `expo-bowling-journal`.
- **Baseline commit:** `a437b47ba762867ddec4c09f97990dae4cf16f8c`
  (`docs: add Continue GPT-OSS 20B reliability evaluation`).
- **Provenance note:** these are the prompts used by the prior **OpenCode** evaluation.
  They are **not** the Continue-CLI prompts; the Continue artifacts are a different
  prompt set and must not be substituted.

## Quote preservation

The recovered text stored in the session database begins and ends with a literal
double-quote character (`"`). Each `tN.txt` reproduces those surrounding quote
characters **intentionally and byte-for-byte**, with no normalization, trimming,
rewording, or added trailing newline. The SHA-256 values below are computed over the
exact stored bytes (including the quotes).

## Prompt set

| Test | File | Purpose | Bytes | SHA-256 |
| ---- | ---- | ------- | ----- | ------- |
| 0 | `t0.txt` | Smoke / self-identification: name model + cwd, no tools | 182 | `0b32ac32260c6a8d72dbdab67047e8fb35f9aad416662bea1cb8f0ce977c1863` |
| 1 | `t1.txt` | File/path recovery from a wrong hint; report path + line count | 384 | `daafab3a64a4c859b42e51e0740a856023537eb9813cdbf3017d6c3288927d77` |
| 2 | `t2.txt` | Git accuracy / commit reporting: scoped edit, validate, single commit | 317 | `66482d5f94070fdf01be2585eb173c3ade37a3aa509aa32d1db41e98f6e26d79` |
| 3 | `t3.txt` | Repository/content search for `PinPal`; exact count + paths | 202 | `fb2bb066324035ffff7ea2925720f4e15f1dd2b98eed3e2c261564a4ecd3302d` |
| 4 | `t4.txt` | Semantic judgment of the "asterisks in table cells" claim | 447 | `29ba5ec47d5c3d318ddc526d63fcd91e9a1fcd779d02441c21666fe415e1ff3f` |
| 5 | `t5.txt` | No-op discipline: mandatory ordered workflow, no network fetch | 471 | `639e9f9b93bd2c77a98e8c8decdefcea9cf1b7392f78d94b2821183a13f75358` |
| 6 | `t6.txt` | Validation / tool discovery: identify + run `format:check` | 191 | `0bf30373af219c1795cbc6b67a0089395721ab1995894aff37cfc2063c60964f` |
| 7 | `t7.txt` | Fresh-evidence / provenance: validator twice, separate outputs | 286 | `53baaf4db6b896c84b662c70d837f08e0b772f545c62757429412b9ab33f06dc` |
| 8 | `t8.txt` | Invalid-command recovery from two bogus commands | 248 | `ff79951270dd7edecc99da561cb50a1649f7b4fe64958f36dff5b713eef58624` |

## Source sessions

| Test | Session ID |
| ---- | ---------- |
| 0 | `ses_f55dda4c0ffeUdby6s6eD5YpWl` |
| 1 | `ses_f55dba7bfffezESn5PND5tALz5` |
| 2 | `ses_f55d8ebc2ffeQB9hb2WiRLJDr7` |
| 3 | `ses_f55ccb341ffeBPPmA12tEvjqos` |
| 4 | `ses_f55c50528ffeDAU9QrMLfsTTeT` |
| 5 | `ses_f55c1ebccffe7F6TLN6i0L9Y9i` |
| 6 | `ses_f55bf409effedEPPDh7bTq2xWg` |
| 7 | `ses_f55bd8982ffescmv0OZ9DdIU4l` |
| 8 | `ses_f55bae23fffeeiM4pojMLVzsl1` |

## Usage

Each test is a single `opencode run` invocation from a disposable clone at the baseline
commit, e.g.:

```
opencode run -m ollama/devstral-small-2:24b "$(cat tN.txt)"
```

Run serially (one Ollama generation at a time).
