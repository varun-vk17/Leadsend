"use client";

import { signIn, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function HomePage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (session) {
      router.push("/dashboard");
    }
  }, [session, router]);

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <main className="flex-1 flex items-center justify-center min-h-screen relative overflow-hidden">
      {/* Background gradient orbs */}
      <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] rounded-full bg-[radial-gradient(circle,rgba(99,102,241,0.15),transparent_70%)] blur-3xl" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] rounded-full bg-[radial-gradient(circle,rgba(168,85,247,0.1),transparent_70%)] blur-3xl" />
      <div className="absolute top-[30%] right-[20%] w-[300px] h-[300px] rounded-full bg-[radial-gradient(circle,rgba(6,182,212,0.08),transparent_70%)] blur-3xl" />

      <div className="relative z-10 text-center max-w-xl px-6 animate-fade-in">
        {/* Logo */}
        <div className="inline-flex items-center gap-3 mb-8">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl" style={{ background: "var(--gradient-1)" }}>
            ⚡
          </div>
          <h1 className="text-3xl font-bold tracking-tight">
            Mail<span style={{ color: "var(--accent-light)" }}>Forge</span>
          </h1>
        </div>

        {/* Tagline */}
        <p className="text-lg mb-2" style={{ color: "var(--muted)" }}>
          Email Automation Agent
        </p>
        <h2 className="text-4xl font-bold mb-4 leading-tight">
          Send personalized emails
          <br />
          <span className="bg-clip-text text-transparent" style={{ backgroundImage: "var(--gradient-1)" }}>
            on autopilot
          </span>
        </h2>
        <p className="text-base mb-10 max-w-md mx-auto" style={{ color: "var(--muted)" }}>
          Upload your leads, craft templates with placeholders, and let MailForge
          send up to 30 personalized emails per day from your real Gmail account.
        </p>

        {/* Login Button */}
        <button
          onClick={() => signIn("google")}
          className="inline-flex items-center gap-3 px-8 py-4 rounded-xl text-base font-semibold text-white transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
          style={{
            background: "var(--gradient-1)",
            boxShadow: "0 8px 32px rgba(99, 102, 241, 0.3)",
          }}
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path
              fill="currentColor"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
            />
            <path
              fill="currentColor"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="currentColor"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            />
            <path
              fill="currentColor"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
          </svg>
          Continue with Google
        </button>

        {/* Features */}
        <div className="mt-16 grid grid-cols-3 gap-6 text-left">
          {[
            { icon: "📧", title: "Real Gmail", desc: "Sends from your actual Gmail account" },
            { icon: "📊", title: "CSV Import", desc: "Upload 500+ leads in seconds" },
            { icon: "🤖", title: "Auto Pilot", desc: "30 emails/day, fully automated" },
          ].map((f, i) => (
            <div key={i} className={`glass-card p-4 animate-slide-up stagger-${i + 1}`}>
              <div className="text-2xl mb-2">{f.icon}</div>
              <div className="font-semibold text-sm mb-1">{f.title}</div>
              <div className="text-xs" style={{ color: "var(--muted)" }}>{f.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
