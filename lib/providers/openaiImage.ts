/**
 * OpenAI image adapter — keyframe generation.
 * Stage 1: typed surface only. Implemented in Stage 5.
 */
import { MODELS } from "@/config/models";

export const OPENAI_IMAGE_MODEL = MODELS.openaiImage;

export async function generateKeyframe(
  _imagePrompt: string,
  _charRefImageUrls: string[],
): Promise<string> {
  throw new Error("Not implemented until Stage 5: openaiImage.generateKeyframe");
}
