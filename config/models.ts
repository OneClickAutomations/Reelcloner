/**
 * Single source of truth for every model and endpoint the app calls.
 * No model ID or provider path may appear anywhere else in the codebase.
 *
 * Verified against live provider APIs on 2026-08-27:
 *  - Gemini and Anthropic IDs confirmed against their /models endpoints.
 *  - Higgsfield confirmed against https://docs.higgsfield.ai/docs/openapi.json
 *    (Higgsfield API 2.0.0). Note it exposes one PATH PER MODEL rather than a
 *    model-id parameter, so these are paths, not IDs.
 *  - OpenAI image model is the one item still unverified.
 */
export const MODELS = {
  /** Video+audio analysis. Verified: present in the Gemini models list. */
  gemini: "gemini-2.5-flash",
  /** Master-prompt authoring. Verified: present in the Anthropic models list. */
  claudeAuthor: "claude-opus-4-8",
  claudeOrchestrator: "claude-sonnet-5",
  /** TODO: verify against the OpenAI images API now that the host is reachable. */
  openaiImage: "gpt-image-1",
} as const;

/**
 * Higgsfield REST API. Base and paths taken from the published OpenAPI spec.
 *
 * The brief specified `nano_banana_pro`, `motion_control` and `seedance_2_5`.
 * None of those exist in the public API:
 *  - the image endpoint is /nano-banana (there is no "pro" variant)
 *  - Seedance is v1 lite / v1 pro-fast; there is no 2.5
 *  - there is NO motion-control endpoint at all. Motion transfer exists in the
 *    Higgsfield product but is not exposed over REST, so image-to-video driven
 *    by the authored motion_prompt is the only route available to us.
 */
export const HIGGSFIELD = {
  baseUrl: "https://api.higgsfield.ai",
  paths: {
    /** Text-to-image and image-to-image. Accepts `input_images` for references. */
    image: "/nano-banana",
    /** Presigned upload, for inputs we cannot expose on a public HTTPS URL. */
    generateUploadUrl: "/files/generate-upload-url",
    /** Poll here until the request reaches a terminal state. */
    status: (requestId: string) => `/requests/${requestId}/status`,
    cancel: (requestId: string) => `/requests/${requestId}/cancel`,
    /** Image-to-video. duration is constrained to 5 or 10 seconds. */
    klingImageToVideo: "/kling-video/v2.5-turbo/pro/image-to-video",
    /** Image-to-video alternative. resolution 480|720|1080. */
    seedanceImageToVideo: "/bytedance/seedance/v1/pro/fast/image-to-video",
  },
} as const;

/** Terminal states a Higgsfield request can end in. `nsfw` is a rejection, not an error. */
export const HIGGSFIELD_TERMINAL_STATES = ["completed", "failed", "nsfw", "canceled"] as const;

export type ModelKey = keyof typeof MODELS;
