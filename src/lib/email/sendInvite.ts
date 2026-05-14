import { Resend } from "resend";
import { InviteEmail } from "./templates/InviteEmail";

export async function sendInvite(params: {
  to: string;
  orgName: string;
  inviterName: string;
  token: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  const fromAddr = process.env.RESEND_FROM_EMAIL ?? "PropelRFP <onboarding@resend.dev>";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  if (!apiKey) {
    throw new Error("RESEND_API_KEY not configured");
  }
  const resend = new Resend(apiKey);
  const acceptUrl = `${appUrl}/invite/${params.token}`;
  await resend.emails.send({
    from: fromAddr,
    to: params.to,
    subject: `You're invited to ${params.orgName} on PropelRFP`,
    react: InviteEmail({
      orgName: params.orgName,
      inviterName: params.inviterName,
      acceptUrl,
    }),
  });
}
