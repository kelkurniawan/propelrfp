import Link from "next/link";

export default function LandingPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8 bg-[#F7F9FB]">
      <div className="text-center">
        <div className="inline-flex items-center gap-2.5 mb-6">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center font-bold text-white text-lg"
            style={{ background: "linear-gradient(135deg, #162B44, #2E75B6)" }}
          >
            P
          </div>
          <span className="text-2xl font-bold tracking-tight" style={{ color: "#162B44" }}>
            PropelRFP
          </span>
        </div>
        <h1
          className="text-5xl font-extrabold tracking-tight leading-tight"
          style={{ color: "#162B44" }}
        >
          Win more contracts,
          <br />
          faster.
        </h1>
        <p className="mt-4 text-lg text-gray-500 max-w-md mx-auto leading-relaxed">
          AI-powered proposal automation grounded in your company&apos;s own winning history. Stop
          rewriting — start winning.
        </p>
      </div>
      <div className="flex gap-3 mt-2">
        <Link
          href="/signup"
          className="rounded-lg px-6 py-3 text-sm font-semibold text-white shadow-sm"
          style={{ background: "#162B44" }}
        >
          Start free trial
        </Link>
        <Link
          href="/login"
          className="rounded-lg border border-gray-200 bg-white px-6 py-3 text-sm font-semibold text-gray-700 shadow-sm"
        >
          Sign in
        </Link>
      </div>
      <p className="text-xs text-gray-400">
        14-day free trial · No credit card required · Starting at $299/mo
      </p>
      <div className="flex gap-10 mt-4">
        {[
          ["60%", "Faster"],
          ["40%", "Accept rate"],
          ["10x", "ROI"],
        ].map(([n, l]) => (
          <div key={l} className="text-center">
            <div className="text-2xl font-extrabold" style={{ color: "#162B44" }}>
              {n}
            </div>
            <div className="text-xs text-gray-400 uppercase tracking-wider mt-0.5">{l}</div>
          </div>
        ))}
      </div>
    </main>
  );
}
