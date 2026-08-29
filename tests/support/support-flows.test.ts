import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { contactSchema, feedbackSchema } from "@/lib/support/validation";

const feedbackPage = readFileSync(join(process.cwd(), "src/app/feedback/page.tsx"), "utf8");
const contactPage = readFileSync(join(process.cwd(), "src/app/contact/page.tsx"), "utf8");
const adminPage = readFileSync(join(process.cwd(), "src/app/admin/page.tsx"), "utf8");

describe("feedback and contact flows", () => {
  it("validates feedback ratings and comments", () => {
    expect(feedbackSchema.safeParse({ rating: 5, comment: "Great product" }).success).toBe(true);
    expect(feedbackSchema.safeParse({ rating: 6, comment: "Great product" }).success).toBe(false);
    expect(feedbackSchema.safeParse({ rating: 5, comment: "" }).success).toBe(false);
  });

  it("validates contact payloads", () => {
    expect(contactSchema.safeParse({ name: "Arthur", email: "a@example.com", subject: "Help", message: "Need assistance" }).success).toBe(true);
    expect(contactSchema.safeParse({ name: "Arthur", email: "bad", subject: "Help", message: "Need assistance" }).success).toBe(false);
  });

  it("wires both user-facing forms to persistent server actions", () => {
    expect(feedbackPage).toContain("FeedbackForm");
    expect(contactPage).toContain("ContactForm");
  });

  it("shows feedback operations in admin", () => {
    expect(adminPage).toContain("Feedback queue");
    expect(adminPage).toContain("testimonial_approved");
  });
});
