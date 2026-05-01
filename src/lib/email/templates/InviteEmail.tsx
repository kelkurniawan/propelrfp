export function InviteEmail({
  orgName,
  inviterName,
  acceptUrl,
}: {
  orgName: string;
  inviterName: string;
  acceptUrl: string;
}) {
  return (
    <div
      style={{
        fontFamily: "Helvetica, Arial, sans-serif",
        color: "#162B44",
        padding: "32px",
        maxWidth: "560px",
      }}
    >
      <h1 style={{ fontSize: 22, marginBottom: 8 }}>You&apos;ve been invited to {orgName}</h1>
      <p style={{ color: "#475569", lineHeight: 1.5 }}>
        {inviterName} invited you to join <strong>{orgName}</strong> on PropelRFP. Click the button
        below to accept the invitation. The link expires in 7 days.
      </p>
      <a
        href={acceptUrl}
        style={{
          display: "inline-block",
          marginTop: 16,
          padding: "12px 20px",
          background: "#162B44",
          color: "#fff",
          textDecoration: "none",
          borderRadius: 8,
          fontWeight: 600,
        }}
      >
        Accept invitation
      </a>
      <p style={{ marginTop: 24, color: "#94a3b8", fontSize: 12 }}>
        If you weren&apos;t expecting this email, you can safely ignore it.
      </p>
    </div>
  );
}
