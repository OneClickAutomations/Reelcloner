/**
 * Stage 4 verification harness — run a real video through the pipeline's
 * first two steps and print what came back.
 *
 *   pnpm analyze <path-or-url> [--author <subject_id>] [--character "..."] [--out dir]
 *
 * This calls live APIs and costs money. It is a development tool, not part of
 * the app: the real flow runs inside Inngest from Stage 6.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { analyzeVideoDetailed, type VideoInput } from "@/lib/providers/gemini";
import { authorMasterPromptDetailed } from "@/lib/providers/claude";
import { replaceTargetCandidates } from "@/lib/schemas/analysis";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

async function main() {
  const source = process.argv[2];
  if (!source || source.startsWith("--")) {
    console.error("usage: pnpm analyze <path-or-url> [--author <subject_id>] [--character \"...\"] [--out dir]");
    process.exit(1);
  }

  const video: VideoInput = /^https?:\/\//.test(source)
    ? { kind: "url", url: source }
    : { kind: "file", path: source };

  const outDir = arg("out") ?? "./.analysis";
  await mkdir(outDir, { recursive: true });
  const stem = source.split("/").pop()?.replace(/\.[^.]+$/, "") ?? "video";

  console.log(`\n=== ANALYZING ===\n${source}`);
  const startedAt = Date.now();
  const result = await analyzeVideoDetailed(video);
  const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
  const { analysis } = result;

  await writeFile(`${outDir}/${stem}.analysis.json`, JSON.stringify(analysis, null, 2));

  console.log(`\nmodel        ${result.model}`);
  console.log(`took         ${seconds}s`);
  console.log(`repair used  ${result.repaired ? "YES — first response failed validation" : "no"}`);
  console.log(`tokens       in=${result.usage?.promptTokens ?? "?"} out=${result.usage?.responseTokens ?? "?"}`);

  console.log(`\n--- format ---`);
  console.log(`duration        ${analysis.duration_seconds}s   aspect ${analysis.aspect_ratio}`);
  console.log(`take            ${analysis.recording_format.take}`);
  console.log(`camera          ${analysis.recording_format.camera}`);
  console.log(`framing         ${analysis.recording_format.framing}`);
  console.log(`movement        ${analysis.recording_format.camera_movement}`);
  console.log(`cuts            ${analysis.cuts.length ? analysis.cuts.map((c) => `${c.at_seconds}s ${c.type}`).join(", ") : "none"}`);

  console.log(`\n--- scene ---`);
  console.log(`${analysis.scene.location_type} · ${analysis.scene.setting}`);
  console.log(`lighting        ${analysis.scene.lighting}`);
  console.log(`background      ${analysis.scene.background}`);

  console.log(`\n--- subjects (${analysis.subjects.length}) ---`);
  for (const s of analysis.subjects) {
    console.log(`${s.id}  [${s.type}]  ${s.approx_screen_time_pct}% screen  swappable=${s.is_candidate_replace_target}`);
    console.log(`   role: ${s.role}`);
    console.log(`   seen: ${s.observed_description}`);
  }

  console.log(`\n--- beats (${analysis.beats.length}) ---`);
  for (const b of analysis.beats) {
    console.log(`${b.start_seconds}-${b.end_seconds}s  ${b.label}`);
    console.log(`   evidence: ${b.evidence}`);
  }

  console.log(`\n--- motion timeline (${analysis.motion_timeline.length}) ---`);
  for (const m of analysis.motion_timeline) {
    console.log(`${m.start_seconds}-${m.end_seconds}s  ${m.subject_id}: ${m.action}  [camera: ${m.camera}]`);
  }

  console.log(`\n--- audio ---`);
  console.log(`speech          ${analysis.audio.has_speech}   wps=${analysis.audio.approx_words_per_second ?? "null"}`);
  console.log(`tone            ${analysis.audio.speaker_tone}`);
  console.log(`music           ${analysis.audio.music}`);
  console.log(`sfx             ${analysis.audio.sfx.join(" | ") || "none"}`);
  console.log(`transcript:\n${analysis.audio.transcript || "(none)"}`);

  console.log(`\n--- on-screen text (${analysis.on_screen_text.length}) ---`);
  for (const t of analysis.on_screen_text) console.log(`${t.at_seconds}s  "${t.text}"`);

  console.log(`\n--- notes_uncertain (${analysis.notes_uncertain.length}) ---`);
  for (const n of analysis.notes_uncertain) console.log(`- ${n}`);

  console.log(`\nsaved  ${outDir}/${stem}.analysis.json`);

  const targetId = arg("author");
  if (!targetId) {
    const candidates = replaceTargetCandidates(analysis).map((s) => s.id);
    console.log(`\n(no --author given; swappable subjects: ${candidates.join(", ") || "none"})`);
    return;
  }

  const character = arg("character") ?? "the new character supplied as reference images";
  console.log(`\n=== AUTHORING (replace ${targetId}) ===`);
  const authored = await authorMasterPromptDetailed(analysis, targetId, character);
  const mp = authored.masterPrompt;
  await writeFile(`${outDir}/${stem}.masterprompt.json`, JSON.stringify(mp, null, 2));

  console.log(`model        ${authored.model}`);
  console.log(`repair used  ${authored.repaired ? "YES" : "no"}`);
  console.log(`tokens       in=${authored.usage?.inputTokens} out=${authored.usage?.outputTokens}`);

  console.log(`\npreserve (${mp.preserve.length}):`);
  for (const p of mp.preserve) console.log(`  - ${p}`);
  console.log(`\nchange (${mp.change.length}):`);
  for (const c of mp.change) console.log(`  - ${c}`);
  console.log(`\nkeyframes (${mp.keyframe_prompts.length}):`);
  for (const k of mp.keyframe_prompts) console.log(`  ${k.shot_id} @${k.at_seconds}s: ${k.image_prompt}`);
  console.log(`\nmotion_prompt:\n  ${mp.motion_prompt}`);
  console.log(`\nsettings: ${JSON.stringify(mp.settings)}`);
  console.log(`\nsaved  ${outDir}/${stem}.masterprompt.json`);
}

main().catch((error) => {
  console.error(`\nFAILED: ${error.message}`);
  process.exit(1);
});
