import type { Metadata } from "next";
import { MessageSquareText } from "lucide-react";
import { FeedbackForm } from "@/components/support/feedback-form";
import { Card, Container, Section } from "@/components/ui/card";

export const metadata: Metadata = { title: "Feedback" };

export default function FeedbackPage() {
  return (
    <Section><Container className="max-w-3xl">
      <div className="flex items-center gap-3"><MessageSquareText className="h-6 w-6 text-[#e1cb95]" /><p className="text-sm font-semibold text-[#e1cb95]">Product feedback</p></div>
      <h1 className="serif mt-3 text-3xl font-semibold text-[#f4efe5]">Help us improve StockBox</h1>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-[#9aa7b8]">Rate your experience and tell us what would make StockBox more useful, reliable or easier to use.</p>
      <Card className="mt-7"><FeedbackForm /></Card>
    </Container></Section>
  );
}
