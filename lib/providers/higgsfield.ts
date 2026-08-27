/**
 * Higgsfield adapter — stills and image-to-video.
 * Typed surface only; the calls land in Stage 5.
 *
 * Shaped against the published OpenAPI spec (Higgsfield API 2.0.0), not the
 * brief's assumptions. Three things differ from the brief and drive this shape:
 *
 * 1. Auth is a single header carrying BOTH credentials:
 *      Authorization: Key {api_key_id}:{api_key_secret}
 * 2. Every generation is asynchronous. A submit returns a request_id and a
 *    status_url; you poll until queued|in_progress becomes
 *    completed|failed|nsfw|canceled. Poll from 2s, easing out to 10s, with
 *    jitter. All polling runs inside Inngest, never in a request handler.
 * 3. There is no motion-control endpoint. Motion transfer exists in the
 *    Higgsfield product but not over REST, so the brief's fallback —
 *    image-to-video driven by the authored motion_prompt — is the only path.
 *
 * Inputs are public HTTPS URLs. Anything not already public goes through the
 * two-step presigned upload first.
 */
import { HIGGSFIELD } from "@/config/models";

export type Resolution = "720p" | "1080p";

/** Terminal and non-terminal states a request can report. */
export type RequestState =
  | "queued"
  | "in_progress"
  | "completed"
  | "failed"
  | "nsfw"
  | "canceled";

export type MediaOutput = { url: string };

export type RequestStatus = {
  status: RequestState;
  request_id: string;
  status_url?: string;
  cancel_url?: string;
  error?: string | null;
  images?: MediaOutput[];
  video?: MediaOutput;
};

export const HIGGSFIELD_BASE_URL = HIGGSFIELD.baseUrl;

/**
 * Credentials. The key id and the secret are separate values and the API
 * needs both; a request carrying only one gets 401.
 */
export function authHeader(): string {
  throw new Error("Not implemented until Stage 5: higgsfield.authHeader");
}

/** POST /files/generate-upload-url, then PUT the bytes, then return public_url. */
export async function uploadMedia(_bytes: Uint8Array, _contentType: string): Promise<string> {
  throw new Error("Not implemented until Stage 5: higgsfield.uploadMedia");
}

/** POST /nano-banana. `refImages` become `input_images`. Returns a request id. */
export async function generateStill(
  _prompt: string,
  _refImages: string[],
  _options?: { aspectRatio?: string },
): Promise<string> {
  throw new Error("Not implemented until Stage 5: higgsfield.generateStill");
}

/**
 * Image-to-video from a keyframe plus the authored motion prompt.
 * Duration is constrained by the endpoint (Kling accepts only 5 or 10 seconds),
 * so a longer reference has to be produced as multiple clips.
 */
export async function imageToVideo(
  _imageUrl: string,
  _motionPrompt: string,
  _options: { durationSeconds: 5 | 10; aspectRatio?: string },
): Promise<string> {
  throw new Error("Not implemented until Stage 5: higgsfield.imageToVideo");
}

/** GET /requests/{id}/status until terminal. Runs inside an Inngest step. */
export async function waitForRequest(_requestId: string): Promise<RequestStatus> {
  throw new Error("Not implemented until Stage 5: higgsfield.waitForRequest");
}
