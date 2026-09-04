export type FounderScriptTopic = {
  topicKey: string;
  title: string;
  qualityScore: number;
  category?: string;
  platformHint?: string;
  aiCopy?: {
    hook?: string;
    script?: string;
    screenDirections?: string;
    caption?: string;
    cta?: string;
  };
};

export type FounderScriptIdea = {
  topicKey: string;
  hook: string;
  script: string;
  screenDirections: string;
  caption: string;
  cta: string;
  recommendedPlatform: string;
  automaticRender: false;
};

function clean(value: unknown, fallback: string, max = 1800) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return (text || fallback).slice(0, max);
}

function defaultPlatform(topic: FounderScriptTopic) {
  const platform = String(topic.platformHint || "");
  if (["instagram_reel", "facebook_reel", "tiktok", "youtube_short"].includes(platform)) return platform;
  return "instagram_reel";
}

function fallbackScript(topic: FounderScriptTopic) {
  const title = clean(topic.title, "En sak att kontrollera i ett börsbolag", 160);
  return `Här är ett snabbt sätt att tänka kring ${title.toLowerCase()}. Börja med att titta på utvecklingen över tid, jämför sedan siffran med bolagets kvalitet och risk och avsluta med att fråga vad som faktiskt skulle kunna ändra din slutsats. Det är samma typ av strukturerad kontroll som StockBox är byggt för att förenkla.`;
}

export function buildFounderScriptIdeas(topics: FounderScriptTopic[], max = 2): FounderScriptIdea[] {
  const limit = Math.max(1, Math.min(2, Math.floor(max || 2)));
  return topics
    .filter((topic) => topic && Number(topic.qualityScore) >= 72 && topic.topicKey && topic.title)
    .slice(0, limit)
    .map((topic) => {
      const title = clean(topic.title, "En snabb aktieanalys", 160);
      return {
        topicKey: topic.topicKey,
        hook: clean(topic.aiCopy?.hook, `Det här missar många när de analyserar: ${title}`, 220),
        script: clean(topic.aiCopy?.script, fallbackScript(topic), 1800),
        screenDirections: clean(topic.aiCopy?.screenDirections, "Börja med kameran mot dig i 2-3 sekunder. Visa sedan StockBox eller ett relevant nyckeltal på skärmen och avsluta med en enkel CTA.", 700),
        caption: clean(topic.aiCopy?.caption, `${title} — en snabb checklista för en mer strukturerad analys.`, 600),
        cta: clean(topic.aiCopy?.cta, "Testa analysen själv i StockBox.", 220),
        recommendedPlatform: defaultPlatform(topic),
        automaticRender: false as const,
      };
    });
}
