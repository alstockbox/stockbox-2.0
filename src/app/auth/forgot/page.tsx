import Link from "next/link";
import { AuthForm } from "@/components/auth/auth-form";
import { AuthShell } from "@/components/auth/auth-shell";
import { resetPasswordAction } from "@/lib/auth/actions";

export const metadata = { title: "Reset password" };

export default function ForgotPasswordPage() {
  return (
    <AuthShell title="Reset password" copy="We will send a secure recovery link to your verified email." alternate={<Link href="/auth/login" className="text-[#e1cb95]">Return to log in</Link>}>
      <AuthForm action={resetPasswordAction} submitLabel="Send recovery link" password={false} />
    </AuthShell>
  );
}
