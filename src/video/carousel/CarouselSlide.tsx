import { AbsoluteFill } from "remotion";
import type { CarouselSlideSpec } from "../../lib/growth/carousel-spec";

export function CarouselSlide({
  slide,
  title,
  totalSlides,
}: {
  slide: CarouselSlideSpec;
  title: string;
  totalSlides: number;
}) {
  const isCta = slide.visualKind === "cta";

  return (
    <AbsoluteFill
      style={{
        background: "linear-gradient(160deg, #07111f 0%, #0c1d33 56%, #102842 100%)",
        color: "#f8fafc",
        fontFamily: "Arial, Helvetica, sans-serif",
        padding: 72,
        justifyContent: "space-between",
      }}
    >
      <div>
        <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: 1.5, opacity: 0.92 }}>
          STOCKBOX
        </div>
        <div style={{ marginTop: 20, fontSize: 28, lineHeight: 1.25, opacity: 0.7 }}>{title}</div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 34 }}>
        <div style={{
          width: 128,
          height: 12,
          borderRadius: 999,
          background: isCta ? "#dbeafe" : "#93c5fd",
          opacity: 0.9,
        }} />
        <div style={{ fontSize: 72, lineHeight: 1.03, fontWeight: 900, letterSpacing: -2 }}>
          {slide.headline}
        </div>
        <div style={{ fontSize: 38, lineHeight: 1.35, color: "#d9e7f7", maxWidth: 860 }}>
          {slide.body}
        </div>
        <div
          style={{
            marginTop: 10,
            minHeight: 250,
            borderRadius: 36,
            border: "1px solid rgba(148, 163, 184, 0.28)",
            background: "rgba(15, 35, 58, 0.78)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 36,
            fontSize: 32,
            fontWeight: 800,
            textTransform: "uppercase",
            letterSpacing: 1.2,
            color: "#bfdbfe",
          }}
        >
          {slide.visualKind.replace("_", " ")}
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 26 }}>
        <span style={{ opacity: 0.72 }}>getstockbox.app</span>
        <span style={{ fontWeight: 800 }}>{slide.index}/{totalSlides}</span>
      </div>
    </AbsoluteFill>
  );
}

CarouselSlide.displayName = "CarouselSlide";
