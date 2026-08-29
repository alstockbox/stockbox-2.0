import type { Metadata } from "next";
import { Mail } from "lucide-react";
import { ContactForm } from "@/components/support/contact-form";
import { Card, Container, Section } from "@/components/ui/card";

export const metadata: Metadata = { title: "Contact" };

export default function ContactPage() {
  return (
    <Section><Container className="max-w-3xl">
      <div className="flex items-center gap-3"><Mail className="h-6 w-6 text-[#e1cb95]" /><p className="text-sm font-semibold text-[#e1cb95]">Support</p></div>
      <h1 className="serif mt-3 text-3xl font-semibold text-[#f4efe5]">Contact StockBox</h1>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-[#9aa7b8]">Questions about your account, billing, analyses or StockBox? Send us a message below.</p>
      <Card className="mt-7"><ContactForm /></Card>
    </Container></Section>
  );
}
