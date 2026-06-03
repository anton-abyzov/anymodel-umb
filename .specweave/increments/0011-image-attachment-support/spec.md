# 0011 — Image Attachment Support

## Problem

Attached images are silently dropped on two proxy paths, so vision/screenshot
workflows fail (e.g. running a coding agent through anymodel in cmux). An audit
of every (client-wire × provider) combination found exactly two drop points; the
rest already carry images.

**Image-survival matrix (before this increment):**

| Client wire | Provider | Images reach upstream? |
|---|---|---|
| `/v1/messages` | openrouter (passthrough) | ✅ |
| `/v1/messages` | openai (cloud) | ✅ |
| `/v1/messages` | lmstudio / llamacpp | ✅ (model must be vision-capable) |
| `/v1/messages` | **ollama** | ❌ native `/api/chat` ignores OpenAI `image_url` parts |
| `/v1/chat/completions` | local (passthrough) | ✅ |
| `/v1/responses` | **any local** | ❌ `contentToText` flattens `input_image` to text |

## Root cause

1. **Ollama** ([providers/ollama.mjs](../../../repositories/antonoly/anymodel/providers/ollama.mjs)) —
   `transformRequest` reuses the shared OpenAI translator (image → `image_url`
   content part) and posts to Ollama's **native** `/api/chat`. Native Ollama
   expects a top-level `message.images` array of **raw base64** (no `data:`
   prefix); it does not parse OpenAI content-part arrays. Image → dropped.
2. **Responses bridge** ([providers/responses.mjs](../../../repositories/antonoly/anymodel/providers/responses.mjs)) —
   `contentToText`/`responsesToChat` keep only `.text`, discarding
   `input_image` blocks for any Responses-wire client (current Codex) on a local
   model. Responses uses `{type:"input_image", image_url:"<string>"}`; Chat
   Completions wants `{type:"image_url", image_url:{url}}`.

Upstream formats verified against official Ollama `docs/api.md` and OpenAI
images-vision docs (high confidence).

## User Stories

### US-001 — Ollama vision
As a user pointing a coding agent at anymodel→Ollama, when I attach an image to a
message, the image reaches a multimodal model so it can answer about it.

- **AC-US1-01**: a base64 image in an Anthropic message becomes a raw-base64 entry
  in the native `message.images` array (data-URI prefix stripped).
- **AC-US1-02**: message `content` is a plain string (the joined text), never an
  OpenAI content-part array.
- **AC-US1-03**: a URL-sourced image (native API can't carry it) becomes a visible
  text marker, never a silent drop.
- **AC-US1-04**: text-only messages are byte-stable (no `images` field added).

### US-002 — Responses-wire vision
As a Codex/Responses-wire user on a local model, when I attach an image, it is
forwarded to the local Chat Completions endpoint as a vision part.

- **AC-US2-01**: a Responses `input_image` (string `image_url`) becomes a Chat
  `{type:"image_url", image_url:{url}}` part on the user message.
- **AC-US2-02**: the Responses-only `detail:"original"` is dropped (Chat rejects it);
  `low`/`high`/`auto` pass through.
- **AC-US2-03**: a `file_id`-only image becomes a visible marker, never a silent drop.
- **AC-US2-04**: text-only content stays a plain string (byte-stable).
- **AC-US2-05**: a tool-result image is hoisted into a following user turn (the Chat
  `tool` role is text-only).

## Out of scope

- Fetching URL/`file_id` images server-side (would require async transformRequest).
- Adding vision capability to models that don't have it — anymodel only stops
  dropping the bytes; the upstream model must support vision.
