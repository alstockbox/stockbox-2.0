import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getSupportCopy } from "../../src/lib/support/copy";

const root = process.cwd();
const source = (path: string) => readFileSync(`${root}/${path}`, "utf8");

describe("support localization", () => {
  it("provides complete Swedish support form and action copy", () => {
    const copy = getSupportCopy("sv");
    expect(copy.contact.name).toBe("Namn");
    expect(copy.contact.subject).toBe("Ämne");
    expect(copy.contact.send).toBe("Skicka meddelande");
    expect(copy.feedback.title).toBe("Hur användbart är StockBox?");
    expect(copy.feedback.improve).toBe("Vad ska vi förbättra?");
    expect(copy.messages.contactInvalid).toContain("kontaktuppgifterna");
    expect(copy.messages.feedbackSuccess).toContain("Tack");
  });

  it("wires the resolved locale into both support forms", () => {
    const contact = source("src/app/contact/page.tsx");
    const feedback = source("src/app/feedback/page.tsx");
    expect(contact).toContain("<ContactForm locale={locale} />");
    expect(feedback).toContain("const locale = await getLocale()");
    expect(feedback).toContain("<FeedbackForm locale={locale} />");
  });
});
