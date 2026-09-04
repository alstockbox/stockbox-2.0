// Pure Edge mirror of src/lib/growth/storyboard.ts.
// Keep JSON parity covered by tests/growth-v3-edge-parity.test.ts.
export type EdgeStoryboardInput = {
  contentId: string;
  renderJobId: string;
  language: "sv" | "en";
  template: "educational_checklist" | "stock_analysis" | "investor_warning" | "stockbox_demo" | "company_comparison";
  title: string;
  hook: string;
  script: string;
  ctaText: string;
  ctaUrl: string;
  allowGeneratedScene?: boolean;
  preferredVisualRefs?: string[];
};

function compact(value: string, max: number) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length <= max ? text : `${text.slice(0, Math.max(1, max - 1))}…`;
}
function sentenceChunks(script: string, count = 3) {
  const sentences = String(script || "").replace(/\s+/g, " ").trim().split(/(?<=[.!?])\s+/).map((value) => value.trim()).filter(Boolean);
  if (!sentences.length) return ["Titta på helheten i analysen.", "Jämför utvecklingen över tid.", "Sätt siffrorna i sitt sammanhang."];
  if (sentences.length >= count) return sentences.slice(0, count);
  const output = [...sentences];
  const fallbacks = ["Jämför nyckeltalen med utvecklingen över tid.", "Sätt varje datapunkt i relation till kvalitet och risk.", "Kontrollera helheten innan du drar en slutsats."];
  while (output.length < count) output.push(fallbacks[output.length] ?? fallbacks.at(-1)!);
  return output;
}
function subtitleChunks(script: string) {
  const words = String(script || "").replace(/\s+/g, " ").trim().split(" ").filter(Boolean), chunks: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > 68 && current) { chunks.push(current); current = word; } else current = next;
  }
  if (current) chunks.push(current);
  const selected = chunks.slice(0, 6), availableMs = 28_000, slotMs = Math.floor(availableMs / Math.max(1, selected.length));
  return selected.map((text, index) => ({ startMs: 2_500 + index * slotMs, endMs: Math.min(30_500, 2_500 + (index + 1) * slotMs - 250), text }));
}

export function buildGrowthStoryboard(input: EdgeStoryboardInput) {
  const bodies = sentenceChunks(input.script, 3);
  const refs = Array.isArray(input.preferredVisualRefs) ? input.preferredVisualRefs.filter(Boolean) : [];
  const visualKind = (index: number) => refs[index] ? "stockbox_ui" : index === 1 ? "chart" : "motion_graphic";
  const scenes = [
    { id: "hook", kind: "motion_graphic", startMs: 0, endMs: 2_500, headline: compact(input.hook || input.title, 220), body: "En snabb StockBox-genomgång." },
    { id: "body-1", kind: visualKind(0), startMs: 2_500, endMs: 10_000, headline: compact(bodies[0], 180), body: refs[0] ? "StockBox-vy med relevant analysdata." : "Fokusera på den första datapunkten och sätt den i sitt sammanhang.", ...(refs[0] ? { visualRef: refs[0] } : {}) },
    { id: "body-2", kind: visualKind(1), startMs: 10_000, endMs: 18_000, headline: compact(bodies[1], 180), body: refs[1] ? "Kontrollerad StockBox-visual." : "Visa trend och jämförelse i stället för en isolerad siffra.", ...(refs[1] ? { visualRef: refs[1] } : {}) },
    { id: "body-3", kind: visualKind(2), startMs: 18_000, endMs: 27_000, headline: compact(bodies[2], 180), body: refs[2] ? "Kontrollerad StockBox-visual." : "Koppla analysen till kvalitet, värdering och risk.", ...(refs[2] ? { visualRef: refs[2] } : {}) },
    input.allowGeneratedScene
      ? { id: "visual-break", kind: "generated_micro_scene", startMs: 27_000, endMs: 31_000, headline: "Sätt siffrorna i sammanhang", body: "En kort visuell förstärkning av analysens helhet.", prompt: `Clean abstract financial analysis visual, vertical 9:16, no text, no logos, concept: ${compact(input.title, 140)}`, fallbackKind: "motion_graphic", fallbackHeadline: "Sätt siffrorna i sammanhang", fallbackBody: "Koppla flera datapunkter till samma helhetsbild." }
      : { id: "visual-break", kind: "motion_graphic", startMs: 27_000, endMs: 31_000, headline: "Sätt siffrorna i sammanhang", body: "Koppla flera datapunkter till samma helhetsbild." },
    { id: "cta", kind: "cta", startMs: 31_000, endMs: 35_000, headline: compact(input.ctaText, 180), body: "Fördjupa analysen i StockBox." },
  ];
  return {
    version: "v3" as const,
    contentId: input.contentId,
    renderJobId: input.renderJobId,
    language: input.language,
    template: input.template,
    title: compact(input.title, 220),
    hook: compact(input.hook, 500),
    script: compact(input.script, 6_000),
    voiceMode: input.language === "sv" ? "educational" : "generic_english",
    scenes,
    subtitles: subtitleChunks(input.script),
    cta: { text: compact(input.ctaText, 220), url: input.ctaUrl },
  };
}
