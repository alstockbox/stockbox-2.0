import { z } from "zod";

export const DistributionPlatformSchema = z.enum([
  "instagram_reel",
  "facebook_reel",
  "tiktok",
  "youtube_short",
  "instagram_carousel",
  "linkedin",
  "facebook",
]);

export type DistributionPlatform = z.infer<typeof DistributionPlatformSchema>;

export const RenderTemplateSchema = z.enum([
  "educational_checklist",
  "stock_analysis",
  "investor_warning",
  "stockbox_demo",
  "company_comparison",
]);

export type RenderTemplate = z.infer<typeof RenderTemplateSchema>;

export const SceneKindSchema = z.enum([
  "stockbox_ui",
  "motion_graphic",
  "chart",
  "generated_micro_scene",
  "cta",
]);

export type SceneKind = z.infer<typeof SceneKindSchema>;

export const VoiceModeSchema = z.enum([
  "hook",
  "educational",
  "serious_analysis",
  "generic_english",
]);

export type VoiceMode = z.infer<typeof VoiceModeSchema>;

export const RenderJobStateSchema = z.enum([
  "queued",
  "storyboarding",
  "voicing",
  "rendering",
  "qc",
  "ready",
  "failed",
  "superseded",
]);

export type RenderJobState = z.infer<typeof RenderJobStateSchema>;

export const MediaAssetKindSchema = z.enum([
  "voice_audio",
  "screenshot",
  "generated_scene",
  "master_video",
  "cover",
  "metadata",
  "carousel_slide",
  "carousel_zip",
  "static_image",
]);

export type MediaAssetKind = z.infer<typeof MediaAssetKindSchema>;

const SceneSchema = z.object({
  id: z.string().min(1).max(120),
  kind: SceneKindSchema,
  startMs: z.number().int().min(0),
  endMs: z.number().int().positive(),
  headline: z.string().max(220).optional(),
  body: z.string().max(1200).optional(),
  visualRef: z.string().max(500).optional(),
});

const SubtitleSchema = z.object({
  startMs: z.number().int().min(0),
  endMs: z.number().int().positive(),
  text: z.string().min(1).max(500),
});

const CtaSchema = z.object({
  text: z.string().min(1).max(220),
  url: z.string().url(),
});

export const RenderSpecSchema = z
  .object({
    version: z.literal("v3"),
    contentId: z.string().min(1).max(160),
    renderJobId: z.string().min(1).max(160),
    language: z.enum(["sv", "en"]),
    template: RenderTemplateSchema,
    title: z.string().min(1).max(220),
    hook: z.string().min(1).max(500),
    script: z.string().min(1).max(6000),
    voiceMode: VoiceModeSchema,
    scenes: z.array(SceneSchema).min(1).max(40),
    subtitles: z.array(SubtitleSchema).max(300).default([]),
    cta: CtaSchema,
  })
  .superRefine((spec, ctx) => {
    for (const [index, scene] of spec.scenes.entries()) {
      if (scene.endMs <= scene.startMs) {
        ctx.addIssue({
          code: "custom",
          path: ["scenes", index, "endMs"],
          message: "Scene endMs must be greater than startMs",
        });
      }
    }

    const videoEndMs = Math.max(...spec.scenes.map((scene) => scene.endMs));
    if (videoEndMs > 60_000) {
      ctx.addIssue({
        code: "custom",
        path: ["scenes"],
        message: "Growth short-form renders may not exceed 60 seconds",
      });
    }

    for (const [index, subtitle] of spec.subtitles.entries()) {
      if (subtitle.endMs <= subtitle.startMs) {
        ctx.addIssue({
          code: "custom",
          path: ["subtitles", index, "endMs"],
          message: "Subtitle endMs must be greater than startMs",
        });
      }
      if (subtitle.endMs > videoEndMs) {
        ctx.addIssue({
          code: "custom",
          path: ["subtitles", index, "endMs"],
          message: "Subtitle may not extend past the final scene",
        });
      }
    }

    if (
      spec.language === "sv" &&
      !(["hook", "educational", "serious_analysis"] as const).includes(
        spec.voiceMode as "hook" | "educational" | "serious_analysis",
      )
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["voiceMode"],
        message: "Swedish automatic renders require an approved founder voice mode",
      });
    }
  });

export type RenderSpec = z.infer<typeof RenderSpecSchema>;

export const QcSummarySchema = z.object({
  passed: z.boolean(),
  checks: z.record(z.string(), z.boolean()).default({}),
  warnings: z.array(z.string()).default([]),
  errors: z.array(z.string()).default([]),
});

export type QcSummary = z.infer<typeof QcSummarySchema>;
