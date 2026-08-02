"use client";

import { useSession } from "next-auth/react";
import { useRouter, useParams } from "next/navigation";
import { useEffect, useState, useCallback, useRef } from "react";
import { renderTemplate, formatBodyToHtml } from "@/lib/template";

interface Lead {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  website: string | null;
  status: string;
  lastSentAt: string | null;
}

interface EmailLogEntry {
  id: string;
  subject: string;
  body: string | null;
  status: string;
  errorMessage: string | null;
  sentAt: string;
  lead: {
    email: string;
    firstName: string | null;
    lastName: string | null;
    company: string | null;
  };
}

interface CampaignDetail {
  id: string;
  name: string;
  subjectTemplate: string;
  bodyTemplate: string;
  dailyLimit: number;
  status: string;
  createdAt: string;
  leads: Lead[];
  stats: {
    totalLeads: number;
    totalSent: number;
    totalFailed: number;
    sentToday: number;
    remaining: number;
  };
}

export default function CampaignDetailPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const params = useParams();
  const campaignId = params.id as string;

  const [campaign, setCampaign] = useState<CampaignDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"overview" | "leads" | "logs" | "settings">("overview");
  const [toast, setToast] = useState<{ type: string; message: string } | null>(null);

  // Logs state
  const [logs, setLogs] = useState<EmailLogEntry[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logFilter, setLogFilter] = useState<string>("");
  const [logSearch, setLogSearch] = useState("");
  const [logPage, setLogPage] = useState(1);
  const [logTotal, setLogTotal] = useState(0);

  // CSV upload state
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<Record<string, unknown> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Edit state
  const [editName, setEditName] = useState("");
  const [editSubject, setEditSubject] = useState("");
  const [editBody, setEditBody] = useState("");
  const [editLimit, setEditLimit] = useState(30);
  const [saving, setSaving] = useState(false);

  // Test email state
  const [showTestModal, setShowTestModal] = useState(false);
  const [testEmailAddress, setTestEmailAddress] = useState("");
  const [sendingTest, setSendingTest] = useState(false);

  const handleSendTestEmail = async () => {
    if (!testEmailAddress || !testEmailAddress.includes("@")) {
      showToast("error", "Please enter a valid target email address");
      return;
    }
    setSendingTest(true);
    try {
      const res = await fetch("/api/gmail/test-send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: testEmailAddress,
          subject: editSubject || campaign?.subjectTemplate,
          body: editBody || campaign?.bodyTemplate,
        }),
      });
      const data = await res.json();
      if (data.success) {
        showToast("success", `Test email sent to ${testEmailAddress}! Check your inbox.`);
        setShowTestModal(false);
      } else {
        showToast("error", data.error || "Failed to send test email");
      }
    } catch {
      showToast("error", "Network error sending test email");
    } finally {
      setSendingTest(false);
    }
  };

  useEffect(() => {
    if (status === "unauthenticated") router.push("/");
  }, [status, router]);

  const showToast = (type: string, message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchCampaign = useCallback(async () => {
    try {
      const res = await fetch(`/api/campaigns/${campaignId}`);
      const data = await res.json();
      if (data.success) {
        setCampaign(data.data);
        setEditName(data.data.name);
        setEditSubject(data.data.subjectTemplate);
        setEditBody(data.data.bodyTemplate);
        setEditLimit(data.data.dailyLimit);
      } else {
        showToast("error", "Campaign not found");
        router.push("/dashboard");
      }
    } catch {
      showToast("error", "Failed to load campaign");
    } finally {
      setLoading(false);
    }
  }, [campaignId, router]);

  const fetchLogs = useCallback(async () => {
    setLogsLoading(true);
    try {
      const params = new URLSearchParams({ page: String(logPage), limit: "20" });
      if (logFilter) params.set("status", logFilter);
      if (logSearch) params.set("search", logSearch);

      const res = await fetch(`/api/campaigns/${campaignId}/logs?${params}`);
      const data = await res.json();
      if (data.success) {
        setLogs(data.data.logs);
        setLogTotal(data.data.pagination.total);
      }
    } catch {
      console.error("Failed to fetch logs");
    } finally {
      setLogsLoading(false);
    }
  }, [campaignId, logPage, logFilter, logSearch]);

  useEffect(() => {
    if (session) fetchCampaign();
  }, [session, fetchCampaign]);

  useEffect(() => {
    if (activeTab === "logs") fetchLogs();
  }, [activeTab, fetchLogs]);

  // CSV Upload
  const handleCsvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadResult(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("campaignId", campaignId);

    try {
      const res = await fetch("/api/leads/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (data.success) {
        setUploadResult(data.data);
        showToast("success", `Imported ${data.data.imported} leads`);
        fetchCampaign();
      } else {
        showToast("error", data.error || "Upload failed");
      }
    } catch {
      showToast("error", "Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // Save settings
  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName,
          subjectTemplate: editSubject,
          bodyTemplate: editBody,
          dailyLimit: editLimit,
        }),
      });
      if (res.ok) {
        showToast("success", "Campaign updated");
        fetchCampaign();
      } else {
        showToast("error", "Failed to update");
      }
    } catch {
      showToast("error", "Network error");
    } finally {
      setSaving(false);
    }
  };

  // Toggle status
  const toggleStatus = async () => {
    if (!campaign) return;
    const newStatus = campaign.status === "ACTIVE" ? "PAUSED" : "ACTIVE";
    try {
      await fetch(`/api/campaigns/${campaignId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      showToast("success", `Campaign ${newStatus.toLowerCase()}`);
      fetchCampaign();
    } catch {
      showToast("error", "Failed to update status");
    }
  };

  // Delete campaign
  const handleDelete = async () => {
    if (!confirm("Are you sure? This will delete all leads and logs.")) return;
    try {
      await fetch(`/api/campaigns/${campaignId}`, { method: "DELETE" });
      showToast("success", "Campaign deleted");
      router.push("/dashboard");
    } catch {
      showToast("error", "Failed to delete");
    }
  };

  // Template preview
  const getPreview = () => {
    if (!campaign) return null;
    const lead = campaign.leads.find((l) => l.company || l.firstName) || campaign.leads[0] || {
      email: "sample@askelephant.ai",
      firstName: "John",
      lastName: "Doe",
      company: "Ask Elephant",
      website: "askelephant.ai",
    };

    const leadData = {
      email: lead.email,
      firstName: lead.firstName || "",
      lastName: lead.lastName || "",
      company: lead.company || "",
      website: lead.website || "",
    };

    const subjectTemplate = editSubject || campaign.subjectTemplate;
    const bodyTemplate = editBody || campaign.bodyTemplate;

    const subject = renderTemplate(subjectTemplate, leadData, true);
    const body = renderTemplate(bodyTemplate, leadData, true);
    return { subject, body, leadEmail: lead.email };
  };

  if (loading || !campaign) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const preview = getPreview();

  const triggerCron = async () => {
    try {
      showToast("info", "Starting email sending worker...");
      const res = await fetch("/api/cron", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId }),
      });
      const data = await res.json();
      if (data.success) {
        showToast("success", `Sent ${data.data.totalSent} email(s)!`);
        fetchCampaign();
        if (activeTab === "logs") fetchLogs();
      } else {
        showToast("error", data.error || "Worker error");
      }
    } catch {
      showToast("error", "Failed to trigger worker");
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-[var(--card-border)] px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => router.push("/dashboard")} className="text-[var(--muted)] hover:text-[var(--foreground)] transition-colors">
              ← Back
            </button>
            <div className="w-px h-6 bg-[var(--card-border)]" />
            <h1 className="text-xl font-bold">{campaign.name}</h1>
            <span className={`badge badge-${campaign.status.toLowerCase()}`}>{campaign.status}</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowTestModal(true)} className="btn-secondary text-sm flex items-center gap-1.5">
              ✉️ Send Test Email
            </button>
            {campaign.status === "ACTIVE" && (
              <button onClick={triggerCron} className="btn-primary text-sm flex items-center gap-1.5">
                ⚡ Send Emails Now
              </button>
            )}
            <button onClick={toggleStatus} className={campaign.status === "ACTIVE" ? "btn-secondary text-sm" : "btn-success text-sm"}>
              {campaign.status === "ACTIVE" ? "⏸ Pause" : "▶ Activate"}
            </button>
            <button onClick={handleDelete} className="btn-danger text-sm">
              🗑 Delete
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full px-6 py-8">
        {/* Stats Row */}
        <div className="grid grid-cols-5 gap-4 mb-8">
          {[
            { label: "Total Leads", value: campaign.stats.totalLeads, icon: "👥" },
            { label: "Sent Today", value: `${campaign.stats.sentToday}/${campaign.dailyLimit}`, icon: "📤" },
            { label: "Total Sent", value: campaign.stats.totalSent, icon: "✅" },
            { label: "Failed", value: campaign.stats.totalFailed, icon: "❌" },
            { label: "Remaining", value: campaign.stats.remaining, icon: "⏳" },
          ].map((stat, i) => (
            <div key={i} className={`glass-card p-4 animate-slide-up stagger-${i + 1}`}>
              <div className="text-xs font-medium uppercase tracking-wider mb-2" style={{ color: "var(--muted)" }}>
                {stat.icon} {stat.label}
              </div>
              <div className="text-2xl font-bold">{stat.value}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 mb-6 p-1 rounded-xl inline-flex" style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}>
          {(["overview", "leads", "logs", "settings"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200"
              style={{
                background: activeTab === tab ? "var(--accent-glow)" : "transparent",
                color: activeTab === tab ? "var(--accent-light)" : "var(--muted)",
                border: activeTab === tab ? "1px solid rgba(99,102,241,0.3)" : "1px solid transparent",
              }}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="animate-fade-in">
          {/* OVERVIEW TAB */}
          {activeTab === "overview" && (
            <div className="grid grid-cols-2 gap-6">
              {/* Template Preview */}
              <div className="glass-card p-5">
                <h3 className="text-sm font-semibold mb-4 uppercase tracking-wider" style={{ color: "var(--muted)" }}>
                  📧 Email Preview
                </h3>
                {preview ? (
                  <div className="space-y-3">
                    <div>
                      <div className="text-xs mb-1" style={{ color: "var(--muted)" }}>To:</div>
                      <div className="text-sm">{preview.leadEmail}</div>
                    </div>
                    <div>
                      <div className="text-xs mb-1" style={{ color: "var(--muted)" }}>Subject:</div>
                      <div className="text-sm font-medium">{preview.subject}</div>
                    </div>
                    <div className="border-t border-[var(--card-border)] pt-3">
                      <div className="text-xs mb-1 font-medium" style={{ color: "var(--muted)" }}>Body Preview:</div>
                      <div
                        className="text-sm p-5 rounded-xl shadow-lg border border-gray-200 overflow-auto max-h-96"
                        style={{ backgroundColor: "#ffffff", color: "#111827" }}
                        dangerouslySetInnerHTML={{ __html: formatBodyToHtml(preview.body) }}
                      />
                    </div>
                    <div className="text-xs pt-2" style={{ color: "var(--muted)" }}>
                      Preview using first lead&apos;s data
                    </div>
                  </div>
                ) : (
                  <div className="text-sm" style={{ color: "var(--muted)" }}>
                    Upload leads to see a preview
                  </div>
                )}
              </div>

              {/* CSV Upload */}
              <div className="glass-card p-5">
                <h3 className="text-sm font-semibold mb-4 uppercase tracking-wider" style={{ color: "var(--muted)" }}>
                  📂 Upload Leads
                </h3>
                <div
                  className="border-2 border-dashed border-[var(--card-border)] rounded-xl p-8 text-center cursor-pointer transition-all hover:border-[var(--accent)] hover:bg-[var(--accent-glow)]"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv"
                    onChange={handleCsvUpload}
                    className="hidden"
                  />
                  <div className="text-3xl mb-3">{uploading ? "⏳" : "📄"}</div>
                  <div className="text-sm font-medium mb-1">
                    {uploading ? "Uploading..." : "Click to upload CSV"}
                  </div>
                  <div className="text-xs" style={{ color: "var(--muted)" }}>
                    Required columns: email. Optional: first_name, last_name, company, website
                  </div>
                </div>

                {uploadResult && (
                  <div className="mt-4 p-3 rounded-lg" style={{ background: "var(--success-bg)" }}>
                    <div className="text-sm font-medium" style={{ color: "var(--success)" }}>
                      Upload Complete
                    </div>
                    <div className="text-xs mt-1 space-y-0.5" style={{ color: "var(--muted)" }}>
                      <div>Total rows: {(uploadResult as Record<string, number>).totalRows}</div>
                      <div>Imported: {(uploadResult as Record<string, number>).imported}</div>
                      {(uploadResult as Record<string, number>).skipped > 0 && (
                        <div>Skipped (duplicates): {(uploadResult as Record<string, number>).skipped}</div>
                      )}
                      {(uploadResult as Record<string, number>).invalid > 0 && (
                        <div style={{ color: "var(--danger)" }}>Invalid: {(uploadResult as Record<string, number>).invalid}</div>
                      )}
                    </div>
                  </div>
                )}

                <div className="mt-4 p-3 rounded-lg" style={{ background: "var(--muted-bg)" }}>
                  <div className="text-xs font-medium mb-1" style={{ color: "var(--muted)" }}>CSV Format Example:</div>
                  <code className="text-xs block font-mono" style={{ color: "var(--accent-light)" }}>
                    email,first_name,last_name,company,website<br />
                    john@acme.com,John,Doe,Acme Inc,acme.com
                  </code>
                </div>
              </div>
            </div>
          )}

          {/* LEADS TAB */}
          {activeTab === "leads" && (
            <div className="glass-card overflow-hidden">
              <div className="p-4 border-b border-[var(--card-border)] flex items-center justify-between">
                <div className="text-sm font-medium">
                  {campaign.leads.length} lead{campaign.leads.length !== 1 ? "s" : ""}
                </div>
              </div>
              {campaign.leads.length === 0 ? (
                <div className="p-12 text-center">
                  <div className="text-3xl mb-3">📭</div>
                  <div className="text-sm" style={{ color: "var(--muted)" }}>
                    No leads yet. Upload a CSV from the Overview tab.
                  </div>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Email</th>
                        <th>Name</th>
                        <th>Company</th>
                        <th>Status</th>
                        <th>Sent At</th>
                      </tr>
                    </thead>
                    <tbody>
                      {campaign.leads.map((lead) => (
                        <tr key={lead.id}>
                          <td className="font-mono text-sm">{lead.email}</td>
                          <td>{[lead.firstName, lead.lastName].filter(Boolean).join(" ") || "—"}</td>
                          <td>{lead.company || "—"}</td>
                          <td>
                            <span className={`badge badge-${lead.status.toLowerCase()}`}>
                              {lead.status === "SENT" ? "✓ Sent" : lead.status === "FAILED" ? "✕ Failed" : "● Pending"}
                            </span>
                          </td>
                          <td className="text-sm" style={{ color: "var(--muted)" }}>
                            {lead.lastSentAt ? new Date(lead.lastSentAt).toLocaleString() : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* LOGS TAB */}
          {activeTab === "logs" && (
            <div className="glass-card overflow-hidden">
              <div className="p-4 border-b border-[var(--card-border)] flex items-center gap-3">
                <select
                  className="input-field"
                  style={{ width: "140px" }}
                  value={logFilter}
                  onChange={(e) => { setLogFilter(e.target.value); setLogPage(1); }}
                >
                  <option value="">All Status</option>
                  <option value="SENT">Sent</option>
                  <option value="FAILED">Failed</option>
                </select>
                <input
                  type="text"
                  className="input-field"
                  placeholder="Search by email..."
                  value={logSearch}
                  onChange={(e) => { setLogSearch(e.target.value); setLogPage(1); }}
                  style={{ maxWidth: "250px" }}
                />
                <div className="text-sm ml-auto" style={{ color: "var(--muted)" }}>
                  {logTotal} log{logTotal !== 1 ? "s" : ""}
                </div>
              </div>

              {logsLoading ? (
                <div className="p-8 space-y-3">
                  {[1, 2, 3].map((i) => <div key={i} className="skeleton h-12 w-full" />)}
                </div>
              ) : logs.length === 0 ? (
                <div className="p-12 text-center">
                  <div className="text-3xl mb-3">📋</div>
                  <div className="text-sm" style={{ color: "var(--muted)" }}>
                    No email logs yet. Activate the campaign and run the worker.
                  </div>
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Recipient</th>
                          <th>Subject</th>
                          <th>Status</th>
                          <th>Sent At</th>
                          <th>Error</th>
                        </tr>
                      </thead>
                      <tbody>
                        {logs.map((log) => (
                          <tr key={log.id}>
                            <td>
                              <div className="font-mono text-sm">{log.lead.email}</div>
                              <div className="text-xs" style={{ color: "var(--muted)" }}>
                                {[log.lead.firstName, log.lead.lastName].filter(Boolean).join(" ")}
                                {log.lead.company ? ` · ${log.lead.company}` : ""}
                              </div>
                            </td>
                            <td className="text-sm max-w-[200px] truncate">{log.subject}</td>
                            <td>
                              <span className={`badge badge-${log.status.toLowerCase()}`}>
                                {log.status === "SENT" ? "✓ Sent" : "✕ Failed"}
                              </span>
                            </td>
                            <td className="text-sm" style={{ color: "var(--muted)" }}>
                              {new Date(log.sentAt).toLocaleString()}
                            </td>
                            <td className="text-xs max-w-[200px] truncate" style={{ color: "var(--danger)" }}>
                              {log.errorMessage || "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination */}
                  {logTotal > 20 && (
                    <div className="p-4 border-t border-[var(--card-border)] flex items-center justify-center gap-2">
                      <button
                        onClick={() => setLogPage((p) => Math.max(1, p - 1))}
                        disabled={logPage === 1}
                        className="btn-secondary text-xs px-3 py-1.5"
                      >
                        ← Previous
                      </button>
                      <span className="text-sm px-3" style={{ color: "var(--muted)" }}>
                        Page {logPage} of {Math.ceil(logTotal / 20)}
                      </span>
                      <button
                        onClick={() => setLogPage((p) => p + 1)}
                        disabled={logPage >= Math.ceil(logTotal / 20)}
                        className="btn-secondary text-xs px-3 py-1.5"
                      >
                        Next →
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* SETTINGS TAB */}
          {activeTab === "settings" && (
            <div className="glass-card p-6 max-w-2xl">
              <h3 className="text-lg font-semibold mb-6">Campaign Settings</h3>
              <div className="space-y-5">
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--muted)" }}>
                    Campaign Name
                  </label>
                  <input
                    type="text"
                    className="input-field"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--muted)" }}>
                    Subject Template
                  </label>
                  <input
                    type="text"
                    className="input-field"
                    value={editSubject}
                    onChange={(e) => setEditSubject(e.target.value)}
                  />
                  <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
                    Placeholders: {"{{first_name}}"}, {"{{last_name}}"}, {"{{company}}"}, {"{{website}}"}, {"{{email}}"}, {"{{full_name}}"}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--muted)" }}>
                    Body Template
                  </label>
                  <textarea
                    className="input-field font-mono text-sm"
                    rows={8}
                    value={editBody}
                    onChange={(e) => setEditBody(e.target.value)}
                  />
                  <div className="mt-3">
                    <div className="text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: "var(--muted)" }}>
                      👁️ Live Formatted Output Preview:
                    </div>
                    <div
                      className="text-sm p-4 rounded-xl shadow-md border border-gray-200 overflow-auto max-h-60"
                      style={{ backgroundColor: "#ffffff", color: "#111827" }}
                      dangerouslySetInnerHTML={{
                        __html: formatBodyToHtml(editBody || campaign.bodyTemplate),
                      }}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--muted)" }}>
                    Daily Limit
                  </label>
                  <input
                    type="number"
                    className="input-field"
                    style={{ width: "120px" }}
                    min={1}
                    max={500}
                    value={editLimit}
                    onChange={(e) => setEditLimit(parseInt(e.target.value) || 30)}
                  />
                </div>
                <div className="flex items-center gap-3 pt-2">
                  <button onClick={handleSave} disabled={saving} className="btn-primary">
                    {saving ? "Saving..." : "Save Changes"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Send Test Email Modal */}
      {showTestModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="glass-card w-full max-w-md p-6 mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold">Send Test Email</h3>
              <button onClick={() => setShowTestModal(false)} className="text-[var(--muted)] hover:text-[var(--foreground)] text-xl">
                ✕
              </button>
            </div>
            <p className="text-xs mb-4" style={{ color: "var(--muted)" }}>
              Send a test email of this campaign template to your personal or secondary email address to verify line breaks, bullet points, and formatting.
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--muted)" }}>
                  Recipient Email Address
                </label>
                <input
                  type="email"
                  className="input-field"
                  placeholder="your.other.email@gmail.com"
                  value={testEmailAddress}
                  onChange={(e) => setTestEmailAddress(e.target.value)}
                />
              </div>
              <div className="flex items-center gap-3 pt-2">
                <button
                  onClick={handleSendTestEmail}
                  disabled={sendingTest || !testEmailAddress}
                  className="btn-primary flex-1 text-sm py-2.5"
                >
                  {sendingTest ? "Sending..." : "✉️ Send Test Email"}
                </button>
                <button
                  onClick={() => setShowTestModal(false)}
                  className="btn-secondary text-sm py-2.5"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
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
