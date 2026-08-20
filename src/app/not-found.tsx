import { ButtonLink } from "@/components/ui/button";
import { Container, Section } from "@/components/ui/card";

export default function NotFound() {
  return <Section className="min-h-[65vh]"><Container className="max-w-2xl"><p className="text-sm text-[#e1cb95]">404</p><h1 className="serif mt-2 text-4xl font-semibold">Research page not found</h1><p className="mt-4 text-[#9aa7b8]">The report may be private, expired or removed.</p><ButtonLink href="/analyze" className="mt-6">Start a new analysis</ButtonLink></Container></Section>;
}
