# 0011 — Plan

## Approach

Two surgical, isolated provider-layer fixes. No changes to `proxy.mjs`, routing,
or the already-working paths (OpenRouter/OpenAI/local Chat passthrough). The
shared OpenAI translator is reused as-is; each native target post-processes its
output into the shape that target actually accepts.

## Changes

### providers/ollama.mjs
- `dataUriToBase64(url)` — strip `data:<mime>;base64,` → raw base64; `null` for
  non-data-URI strings.
- `toOllamaNativeMessages(messages)` — for any array-content message, collapse
  text parts into a string and hoist base64 `image_url` parts into a top-level
  `images` array; URL images → visible marker.
- `transformRequest` — feed `openaiBody.messages` through `toOllamaNativeMessages`.

### providers/responses.mjs
- `responsesContentToChatParts(content)` — text-only → string (byte-stable);
  with images → array of Chat parts, translating `input_image` (string url) →
  `image_url:{url[,detail]}`; whitelist `detail ∈ {low,high,auto}`; `file_id`-only
  and unresolvable → marker.
- `responsesToChat` — user messages use the new helper; tool results hoist images
  into a following user turn (Chat `tool` role is text-only).

## Testing

`test/image-attachments.test.mjs` (node:test) — unit coverage for every AC plus
end-to-end `transformRequest` / `responsesToChat` assertions. Existing
`content-translation.test.mjs` and `responses-bridge.test.mjs` guard no regression.

## Risk

Low. Additive; text-only paths byte-stable; no silent drops (every unrenderable
image becomes a visible marker). Full suite must stay green before release.
