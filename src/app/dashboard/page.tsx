"use client";

import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import { formatBodyToHtml } from "@/lib/template";

interface CampaignData {
  id: string;
  name: string;
  subjectTemplate: string;
  bodyTemplate: string;
  dailyLimit: number;
  status: string;
  createdAt: string;
  stats: {
    totalLeads: number;
    totalSent: number;
    totalFailed: number;
    sentToday: number;
    remaining: number;
  };
}

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [campaigns, setCampaigns] = useState<CampaignData[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewCampaign, setShowNewCampaign] = useState(false);
  const [showQuickTest, setShowQuickTest] = useState(false);
  const [toast, setToast] = useState<{ type: string; message: string } | null>(null);

  // Gmail connection status from URL params
  const [gmailStatus, setGmailStatus] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/");
    }
  }, [status, router]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const gmail = params.get("gmail");
    if (gmail === "connected") {
      showToast("success", "Gmail connected successfully!");
      window.history.replaceState({}, "", "/dashboard");
    } else if (gmail === "error") {
      showToast("error", "Failed to connect Gmail: " + (params.get("message") || "Unknown error"));
      window.history.replaceState({}, "", "/dashboard");
    }
  }, []);

  const showToast = (type: string, message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchCampaigns = useCallback(async () => {
    try {
      const res = await fetch("/api/campaigns");
      const data = await res.json();
      if (data.success) {
        setCampaigns(data.data);
      }
    } catch (err) {
      console.error("Failed to fetch campaigns:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (session) {
      fetchCampaigns();
    }
  }, [session, fetchCampaigns]);

  const toggleCampaignStatus = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === "ACTIVE" ? "PAUSED" : "ACTIVE";
    try {
      const res = await fetch(`/api/campaigns/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        showToast("success", `Campaign ${newStatus.toLowerCase()}`);
        fetchCampaigns();
      }
    } catch {
      showToast("error", "Failed to update campaign");
    }
  };

  const triggerCron = async () => {
    try {
      const res = await fetch("/api/cron", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        showToast("success", `Worker completed: ${data.data.totalSent} sent, ${data.data.totalFailed} failed`);
        fetchCampaigns();
      } else {
        showToast("error", data.error || "Worker failed");
      }
    } catch {
      showToast("error", "Failed to trigger worker");
    }
  };

  const gmailConnected = Boolean((session?.user as Record<string, unknown>)?.gmailConnected);

  if (status === "loading" || !session) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Aggregate stats
  const totalLeads = campaigns.reduce((sum, c) => sum + c.stats.totalLeads, 0);
  const totalSent = campaigns.reduce((sum, c) => sum + c.stats.totalSent, 0);
  const sentToday = campaigns.reduce((sum, c) => sum + c.stats.sentToday, 0);
  const totalRemaining = campaigns.reduce((sum, c) => sum + c.stats.remaining, 0);

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-[var(--card-border)] px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center text-lg" style={{ background: "var(--gradient-1)" }}>
              ⚡
            </div>
            <span className="text-xl font-bold tracking-tight">
              Mail<span style={{ color: "var(--accent-light)" }}>Forge</span>
            </span>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-sm" style={{ color: "var(--muted)" }}>
              <img
                src={session.user?.image || ""}
                alt=""
                className="w-7 h-7 rounded-full"
              />
              {session.user?.email}
            </div>
            <button onClick={() => signOut()} className="btn-secondary text-xs px-3 py-2">
              Sign Out
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full px-6 py-8">
        {/* Gmail Connection Status */}
        {!gmailConnected && (
          <div className="glass-card p-5 mb-8 flex items-center justify-between animate-fade-in" style={{ borderColor: "rgba(245, 158, 11, 0.3)" }}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center text-xl" style={{ background: "var(--warning-bg)" }}>
                📧
              </div>
              <div>
                <div className="font-semibold text-sm">Connect your Gmail</div>
                <div className="text-xs" style={{ color: "var(--muted)" }}>
                  Required to send emails from your account
                </div>
              </div>
            </div>
            <a href="/api/gmail/connect" className="btn-primary text-sm">
              Connect Gmail
            </a>
          </div>
        )}

        {gmailConnected && (
          <div className="glass-card p-4 mb-8 flex items-center gap-3 animate-fade-in" style={{ borderColor: "rgba(34, 197, 94, 0.3)" }}>
            <div className="w-8 h-8 rounded-lg flex items-center justify-center text-lg" style={{ background: "var(--success-bg)" }}>
              ✅
            </div>
            <div className="text-sm">
              <span className="font-semibold" style={{ color: "var(--success)" }}>Gmail Connected</span>
              <span style={{ color: "var(--muted)" }}> — sending from {session.user?.email}</span>
            </div>
          </div>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          {[
            { label: "Total Leads", value: totalLeads, color: "stat-card-purple", icon: "👥" },
            { label: "Sent Today", value: sentToday, color: "stat-card-blue", icon: "📤" },
            { label: "Total Sent", value: totalSent, color: "stat-card-green", icon: "✅" },
            { label: "Remaining", value: totalRemaining, color: "stat-card-orange", icon: "⏳" },
          ].map((stat, i) => (
            <div key={i} className={`glass-card stat-card ${stat.color} p-5 animate-slide-up stagger-${i + 1}`}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--muted)" }}>
                  {stat.label}
                </span>
                <span className="text-lg">{stat.icon}</span>
              </div>
              <div className="text-3xl font-bold">{stat.value.toLocaleString()}</div>
            </div>
          ))}
        </div>

        {/* Actions Row */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold">Campaigns</h2>
          <div className="flex items-center gap-3">
            <button onClick={() => setShowQuickTest(true)} className="btn-secondary text-sm flex items-center gap-2">
              <span>✉️</span> Quick Test Email
            </button>
            <button onClick={triggerCron} className="btn-secondary text-sm flex items-center gap-2">
              <span>🔄</span> Run Worker Now
            </button>
            <button onClick={() => setShowNewCampaign(true)} className="btn-primary text-sm flex items-center gap-2">
              <span>+</span> New Campaign
            </button>
          </div>
        </div>

        {/* Campaign List */}
        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="skeleton h-24 w-full" />
            ))}
          </div>
        ) : campaigns.length === 0 ? (
          <div className="glass-card p-12 text-center animate-fade-in">
            <div className="text-4xl mb-4">📭</div>
            <div className="text-lg font-semibold mb-2">No campaigns yet</div>
            <div className="text-sm mb-6" style={{ color: "var(--muted)" }}>
              Create your first campaign to start sending personalized emails
            </div>
            <button onClick={() => setShowNewCampaign(true)} className="btn-primary">
              Create Campaign
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {campaigns.map((campaign, i) => (
              <div key={campaign.id} className={`glass-card p-5 animate-slide-up stagger-${Math.min(i + 1, 5)}`}>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-semibold">{campaign.name}</h3>
                      <span className={`badge badge-${campaign.status.toLowerCase()}`}>
                        {campaign.status}
                      </span>
                    </div>
                    <div className="text-sm mb-3" style={{ color: "var(--muted)" }}>
                      Subject: {campaign.subjectTemplate}
                    </div>

                    {/* Stats row */}
                    <div className="flex items-center gap-6 text-sm">
                      <div>
                        <span style={{ color: "var(--muted)" }}>Leads: </span>
                        <span className="font-semibold">{campaign.stats.totalLeads}</span>
                      </div>
                      <div>
                        <span style={{ color: "var(--muted)" }}>Sent today: </span>
                        <span className="font-semibold" style={{ color: "var(--accent-light)" }}>
                          {campaign.stats.sentToday}/{campaign.dailyLimit}
                        </span>
                      </div>
                      <div>
                        <span style={{ color: "var(--muted)" }}>Total sent: </span>
                        <span className="font-semibold" style={{ color: "var(--success)" }}>
                          {campaign.stats.totalSent}
                        </span>
                      </div>
                      {campaign.stats.totalFailed > 0 && (
                        <div>
                          <span style={{ color: "var(--muted)" }}>Failed: </span>
                          <span className="font-semibold" style={{ color: "var(--danger)" }}>
                            {campaign.stats.totalFailed}
                          </span>
                        </div>
                      )}
                      <div>
                        <span style={{ color: "var(--muted)" }}>Remaining: </span>
                        <span className="font-semibold">{campaign.stats.remaining}</span>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 ml-4">
                    {(campaign.status === "ACTIVE" || campaign.status === "PAUSED" || campaign.status === "DRAFT") && (
                      <button
                        onClick={() => toggleCampaignStatus(campaign.id, campaign.status)}
                        className={campaign.status === "ACTIVE" ? "btn-secondary text-xs px-3 py-2" : "btn-success text-xs px-3 py-2"}
                      >
                        {campaign.status === "ACTIVE" ? "⏸ Pause" : "▶ Activate"}
                      </button>
                    )}
                    <button
                      onClick={() => router.push(`/campaigns/${campaign.id}`)}
                      className="btn-secondary text-xs px-3 py-2"
                    >
                      View Details
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* New Campaign Modal */}
      {showNewCampaign && (
        <NewCampaignModal
          onClose={() => setShowNewCampaign(false)}
          onCreated={() => {
            setShowNewCampaign(false);
            showToast("success", "Campaign created!");
            fetchCampaigns();
          }}
        />
      )}

      {/* Quick Test Email Modal */}
      {showQuickTest && (
        <QuickTestEmailModal
          onClose={() => setShowQuickTest(false)}
          onSent={(msg) => {
            setShowQuickTest(false);
            showToast("success", msg);
          }}
        />
      )}

      {/* Toast */}
      {toast && (
        <div className={`toast toast-${toast.type}`}>
          {toast.message}
        </div>
      )}
    </div>
  );
}

// ============================================
// New Campaign Modal
// ============================================
function NewCampaignModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [dailyLimit, setDailyLimit] = useState(30);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const handleCreate = async () => {
    if (!name.trim() || !subject.trim() || !body.trim()) {
      setError("All fields are required");
      return;
    }

    setCreating(true);
    setError("");

    try {
      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          subjectTemplate: subject.trim(),
          bodyTemplate: body.trim(),
          dailyLimit,
        }),
      });

      const data = await res.json();
      if (data.success) {
        onCreated();
      } else {
        setError(data.error || "Failed to create campaign");
      }
    } catch {
      setError("Network error");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="glass-card w-full max-w-xl p-6 mx-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold">New Campaign</h2>
          <button onClick={onClose} className="text-[var(--muted)] hover:text-[var(--foreground)] text-xl">
            ✕
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--muted)" }}>
              Campaign Name
            </label>
            <input
              type="text"
              className="input-field"
              placeholder="e.g., Q3 Outreach"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--muted)" }}>
              Subject Template
            </label>
            <input
              type="text"
              className="input-field"
              placeholder='e.g., Quick question about {{company}}'
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
            <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
              Use {"{{first_name}}"}, {"{{company}}"}, {"{{website}}"} as placeholders
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--muted)" }}>
              Body Template (HTML)
            </label>
            <textarea
              className="input-field"
              placeholder={`Hi {{first_name}},\n\nI noticed {{company}} is doing great work...\n\nBest,\nYour Name`}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={6}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--muted)" }}>
              Daily Limit
            </label>
            <input
              type="number"
              className="input-field"
              min={1}
              max={500}
              value={dailyLimit}
              onChange={(e) => setDailyLimit(parseInt(e.target.value) || 30)}
              style={{ width: "120px" }}
            />
          </div>

          {error && (
            <div className="text-sm" style={{ color: "var(--danger)" }}>
              {error}
            </div>
          )}

          <div className="flex items-center gap-3 pt-2">
            <button onClick={handleCreate} disabled={creating} className="btn-primary flex-1">
              {creating ? "Creating..." : "Create Campaign"}
            </button>
            <button onClick={onClose} className="btn-secondary">
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================
// Quick Test Email Modal
// ============================================
function QuickTestEmailModal({
  onClose,
  onSent,
}: {
  onClose: () => void;
  onSent: (msg: string) => void;
}) {
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("Email Format Test");
  const [body, setBody] = useState(
    `Hi John,\nThis is line 2 of the message.\n\nHere are some bullet points:\n- First bullet point\n- Second bullet point\n  - Indented sub point\n\n  Extra space and indents\n\nThanks!\nYour Name`
  );
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const handleSend = async () => {
    if (!to || !to.includes("@")) {
      setError("Please enter a valid recipient email address");
      return;
    }
    if (!body.trim()) {
      setError("Message body cannot be empty");
      return;
    }

    setSending(true);
    setError("");

    try {
      const res = await fetch("/api/gmail/test-send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: to.trim(),
          subject: subject.trim(),
          body,
        }),
      });

      const data = await res.json();
      if (data.success) {
        onSent(`Test email sent to ${to}! Check your inbox.`);
      } else {
        setError(data.error || "Failed to send email");
      }
    } catch {
      setError("Network error sending test email");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="glass-card w-full max-w-2xl p-6 mx-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold">✉️ Send Quick Test Email</h2>
            <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
              Type any recipient address & message to test line breaks, bullet points, and spacing.
            </p>
          </div>
          <button onClick={onClose} className="text-[var(--muted)] hover:text-[var(--foreground)] text-xl">
            ✕
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--muted)" }}>
              Send To (Recipient Email Address)
            </label>
            <input
              type="email"
              className="input-field"
              placeholder="e.g., your.other.email@gmail.com"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--muted)" }}>
              Subject Line
            </label>
            <input
              type="text"
              className="input-field"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--muted)" }}>
              Email Body (Type your message with newlines, bullet points, space gaps)
            </label>
            <textarea
              className="input-field font-mono text-xs"
              rows={7}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </div>

          {/* Live Preview Box */}
          <div className="border-t border-[var(--card-border)] pt-3">
            <div className="text-xs font-semibold mb-2 uppercase tracking-wider" style={{ color: "var(--muted)" }}>
              👁️ Live HTML Output Preview
            </div>
            <div
              className="text-sm p-5 rounded-xl shadow-lg border border-gray-200 max-h-48 overflow-auto"
              style={{ backgroundColor: "#ffffff", color: "#111827" }}
              dangerouslySetInnerHTML={{ __html: formatBodyToHtml(body) }}
            />
          </div>

          {error && (
            <div className="text-sm" style={{ color: "var(--danger)" }}>
              {error}
            </div>
          )}

          <div className="flex items-center gap-3 pt-2">
            <button onClick={handleSend} disabled={sending} className="btn-primary flex-1">
              {sending ? "Sending Test Email..." : "✉️ Send Test Email Now"}
            </button>
            <button onClick={onClose} className="btn-secondary">
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
