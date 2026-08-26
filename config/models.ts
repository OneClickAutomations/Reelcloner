/**
 * Single source of truth for every model ID used by the app.
 * No model ID may appear anywhere else in the codebase.
 *
 * TODO: verify each ID against the current provider docs before shipping.
 *  - gemini             → Google Gemini API model list
 *  - claudeAuthor       → Anthropic model list
 *  - claudeOrchestrator → Anthropic model list
 *  - openaiImage        → OpenAI images API model list
 *  - higgsfield*        → Higgsfield API docs
 */
export const MODELS = {
  gemini: "gemini-2.5-flash", // video+audio analysis
  claudeAuthor: "claude-opus-4-8", // master-prompt authoring
  claudeOrchestrator: "claude-sonnet-5",
  openaiImage: "gpt-image-1",
  higgsfieldImage: "nano_banana_pro",
  higgsfieldMotion: "motion_control",
  higgsfieldVideo: "seedance_2_5",
} as const;

export type ModelKey = keyof typeof MODELS;
