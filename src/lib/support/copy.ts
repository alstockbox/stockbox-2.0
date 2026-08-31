import type { Locale } from "@/lib/i18n/types";

const en = {
  contact: {
    name: "Name", email: "Email", subject: "Subject", message: "Message",
    placeholder: "How can we help?", send: "Send message", sending: "Sending...",
  },
  feedback: {
    title: "How useful is StockBox?", improve: "What should we improve?",
    placeholder: "Tell us what worked, what did not, or what you want next.",
    send: "Send feedback", sending: "Sending...",
  },
  feedbackPage: {
    kicker: "Product feedback", title: "Help us improve StockBox",
    copy: "Rate your experience and tell us what would make StockBox more useful, reliable or easier to use.",
  },
  messages: {
    feedbackInvalid: "Choose a rating and add a short comment.",
    contactInvalid: "Check the contact details and message, then try again.",
    rateLimited: "Too many submissions. Please try again shortly.",
    feedbackUnavailable: "Feedback is temporarily unavailable.",
    contactUnavailable: "Contact is temporarily unavailable.",
    feedbackError: "Feedback could not be sent. Please try again.",
    contactError: "Your message could not be sent. Please try again.",
    feedbackSuccess: "Thank you. Your feedback has been sent to StockBox.",
    contactSuccess: "Message sent. StockBox has received your request.",
  },
} as const;

const sv = {
  contact: {
    name: "Namn", email: "E-post", subject: "Ämne", message: "Meddelande",
    placeholder: "Hur kan vi hjälpa dig?", send: "Skicka meddelande", sending: "Skickar...",
  },
  feedback: {
    title: "Hur användbart är StockBox?", improve: "Vad ska vi förbättra?",
    placeholder: "Berätta vad som fungerade, vad som inte gjorde det eller vad du vill se härnäst.",
    send: "Skicka feedback", sending: "Skickar...",
  },
  feedbackPage: {
    kicker: "Produktfeedback", title: "Hjälp oss förbättra StockBox",
    copy: "Betygsätt din upplevelse och berätta vad som skulle göra StockBox mer användbart, pålitligt eller enklare att använda.",
  },
  messages: {
    feedbackInvalid: "Välj ett betyg och skriv en kort kommentar.",
    contactInvalid: "Kontrollera kontaktuppgifterna och meddelandet och försök igen.",
    rateLimited: "För många inskick. Försök igen om en stund.",
    feedbackUnavailable: "Feedback är tillfälligt otillgänglig.",
    contactUnavailable: "Kontaktformuläret är tillfälligt otillgängligt.",
    feedbackError: "Feedbacken kunde inte skickas. Försök igen.",
    contactError: "Meddelandet kunde inte skickas. Försök igen.",
    feedbackSuccess: "Tack. Din feedback har skickats till StockBox.",
    contactSuccess: "Meddelandet är skickat. StockBox har tagit emot din förfrågan.",
  },
} as const;

export function getSupportCopy(locale: Locale) {
  return locale === "sv" ? sv : en;
}
