/**
 * Higgsfield adapter — stills, motion control, image-to-video.
 * Stage 1: typed surface only. Implemented in Stage 5.
 *
 * TODO (Stage 5): verify every endpoint and payload shape against the Higgsfield API docs.
 * All polling must run inside Inngest functions, never in a request handler.
 */
import { MODELS } from "@/config/models";

export type Resolution = "720p" | "1080p";

export type MotionControlOptions = {
  resolution: Resolution;
  sceneControl: "video";
};

export type ImageToVideoOptions = {
  aspect_ratio: string;
  duration: number;
  resolution: Resolution;
};

export const HIGGSFIELD_IMAGE_MODEL = MODELS.higgsfieldImage;
export const HIGGSFIELD_MOTION_MODEL = MODELS.higgsfieldMotion;
export const HIGGSFIELD_VIDEO_MODEL = MODELS.higgsfieldVideo;

export async function generateStill(_prompt: string, _refImages: string[]): Promise<string> {
  throw new Error("Not implemented until Stage 5: higgsfield.generateStill");
}

export async function motionControl(
  _characterImageUrl: string,
  _referenceVideoUrl: string,
  _options: MotionControlOptions,
): Promise<string> {
  throw new Error("Not implemented until Stage 5: higgsfield.motionControl");
}

export async function imageToVideo(
  _imageUrl: string,
  _motionPrompt: string,
  _options: ImageToVideoOptions,
): Promise<string> {
  throw new Error("Not implemented until Stage 5: higgsfield.imageToVideo");
}
