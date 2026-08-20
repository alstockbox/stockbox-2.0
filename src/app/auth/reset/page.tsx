import Link from "next/link";
import { AuthForm } from "@/components/auth/auth-form";
import { AuthShell } from "@/components/auth/auth-shell";
import { updatePasswordAction } from "@/lib/auth/actions";

export const metadata = { title: "Choose new password" };

export default function ResetPasswordPage() {
  return (
    <AuthShell title="Choose a new password" copy="Use at least eight characters." alternate={<Link href="/dashboard" className="text-[#e1cb95]">Continue to dashboard</Link>}>
      <AuthForm action={updatePasswordAction} submitLabel="Update password" email={false} />
    </AuthShell>
  );
}
