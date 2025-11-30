"use client";
import { supabase } from "@/lib/supabase";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Site = {
    id: string;
    domain: string; // This stores the subdomain
    link: string;   // This stores the full URL
    created_at: string;
};

export default function ManageSites() {
    const [sites, setSites] = useState<Site[]>([]);
    const [loading, setLoading] = useState(true);
    const [accessToken, setAccessToken] = useState<string | null>(null);
    const [editing, setEditing] = useState<Site | null>(null);
    const [editSubdomain, setEditSubdomain] = useState("");
    const [editFile, setEditFile] = useState<File | null>(null);
    const [editSourceType, setEditSourceType] = useState<"file" | "html" | "text">("file");
    const [editHtmlContent, setEditHtmlContent] = useState("");
    const [editTextContent, setEditTextContent] = useState("");
    const [saving, setSaving] = useState(false);
    const router = useRouter();

    useEffect(() => {
        async function init() {
            // Check auth
            const { data } = await supabase.auth.getSession();
            if (!data.session) {
                router.push("/login");
                return;
            }
            setAccessToken(data.session.access_token);

            // Load sites
            await loadSites(data.session.access_token);
        }
        init();
    }, [router]);

    async function loadSites(token?: string) {
        setLoading(true);
        try {
            const authToken = token || accessToken;
            if (!authToken) {
                console.error("Missing session token");
                setSites([]);
                return;
            }

            const res = await fetch("/api/sites", {
                headers: {
                    Authorization: `Bearer ${authToken}`,
                },
            });
            const body = await res.json().catch(() => null);

            if (!res.ok) {
                console.error("Failed to load sites", body);
                setSites([]);
                return;
            }

            const parsedSites = Array.isArray(body) ? body : [];
            setSites(parsedSites);
        } catch (err) {
            console.error("Failed to load sites", err);
            setSites([]);
        } finally {
            setLoading(false);
        }
    }

    async function deleteSite(domain: string, id: string) {
        if (!confirm(`Delete ${domain}?`)) return;

        if (!accessToken) {
            alert("Session missing. Please log in again.");
            router.push("/login");
            return;
        }

        await fetch(`/api/delete?subdomain=${domain}&id=${id}`, {
            method: "DELETE",
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        });

        setSites((prev) => prev.filter((s) => s.id !== id));
    }

    function openEdit(site: Site) {
        setEditing(site);
        setEditSubdomain(site.domain);
        setEditFile(null);
        setEditSourceType("file");
        setEditHtmlContent("");
        setEditTextContent("");
    }

    async function saveEdit() {
        if (!editing) return;
        if (!accessToken) {
            alert("Session missing. Please log in again.");
            router.push("/login");
            return;
        }

        if (!editSubdomain.trim()) {
            alert("Enter a subdomain.");
            return;
        }

        const preparedFile = (() => {
            if (editSourceType === "file") return editFile;
            if (editSourceType === "html") {
                if (!editHtmlContent.trim()) return null;
                return new File([editHtmlContent], "index.html", { type: "text/html" });
            }
            if (!editTextContent.trim()) return null;
            return new File([editTextContent], "content.txt", { type: "text/plain" });
        })();

        if (editSourceType !== "file" && !preparedFile) {
            alert("Add content for the selected input type.");
            return;
        }

        setSaving(true);
        const form = new FormData();
        form.append("id", editing.id);
        form.append("subdomain", editSubdomain.trim());
        if (preparedFile) {
            form.append("file", preparedFile);
        }

        const res = await fetch("/api/sites", {
            method: "PUT",
            body: form,
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        });

        const body = await res.json().catch(() => null);
        setSaving(false);

        if (!res.ok) {
            alert(body?.error || "Update failed");
            return;
        }

        setSites((prev) =>
            prev.map((s) =>
                s.id === editing.id
                    ? {
                        ...s,
                        domain: editSubdomain.trim(),
                        link: `https://${editSubdomain.trim()}.simplhost.com`,
                    }
                    : s
            )
        );
        setEditing(null);
    }

    return (
        <div style={styles.page}>
            <div style={styles.container}>
                <h1 style={styles.title}>Manage Sites</h1>

                {loading ? (
                    <p style={{ opacity: 0.6 }}>Loading...</p>
                ) : sites.length === 0 ? (
                    <div style={styles.empty}>
                        <p style={{ fontSize: "16px", opacity: 0.7 }}>No sites deployed yet.</p>
                        <a href="/dashboard" style={styles.deployLink}>Deploy your first site →</a>
                    </div>
                ) : (
                    <table style={styles.table}>
                        <thead>
                            <tr>
                                <th style={styles.th}>Subdomain</th>
                                <th style={styles.th}>URL</th>
                                <th style={styles.th}>Created</th>
                                <th style={styles.th}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {sites.map((site) => (
                                <tr key={site.id}>
                                    <td style={styles.td}>{site.domain}</td>
                                    <td style={styles.td}>
                                        <a
                                            href={site.link}
                                            target="_blank"
                                            style={styles.link}
                                        >
                                            {site.link}
                                        </a>
                                    </td>
                                    <td style={styles.td}>
                                        {new Date(site.created_at).toLocaleDateString()}
                                    </td>
                                    <td style={styles.td}>
                                        <div style={{ display: "flex", gap: "8px" }}>
                                            <a
                                                href={site.link}
                                                target="_blank"
                                                style={styles.viewBtn}
                                        >
                                            View
                                        </a>
                                            <button
                                                onClick={() => openEdit(site)}
                                                style={styles.editBtn}
                                            >
                                                Edit
                                            </button>
                                            <button
                                                onClick={() => deleteSite(site.domain, site.id)}
                                                style={styles.deleteBtn}
                                            >
                                                Delete
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
        </div>
            {editing && (
                <div style={styles.modalBackdrop}>
                    <div style={styles.modal}>
                        <h3 style={{ marginTop: 0 }}>Edit Site</h3>
                        <label style={styles.label}>Subdomain</label>
                        <input
                            value={editSubdomain}
                            onChange={(e) => setEditSubdomain(e.target.value)}
                            style={styles.input}
                            placeholder="Subdomain (no spaces)"
                        />
                        <label style={styles.label}>New content (optional)</label>
                        <div style={styles.toggleGroup}>
                            <button
                                type="button"
                                onClick={() => setEditSourceType("file")}
                                style={editSourceType === "file" ? styles.toggleActive : styles.toggle}
                            >
                                Upload file
                            </button>
                            <button
                                type="button"
                                onClick={() => setEditSourceType("html")}
                                style={editSourceType === "html" ? styles.toggleActive : styles.toggle}
                            >
                                Paste HTML
                            </button>
                            <button
                                type="button"
                                onClick={() => setEditSourceType("text")}
                                style={editSourceType === "text" ? styles.toggleActive : styles.toggle}
                            >
                                Paste text
                            </button>
                        </div>
                        {editSourceType === "file" && (
                            <input
                                type="file"
                                accept="*/*"
                                onChange={(e) => setEditFile(e.target.files?.[0] || null)}
                                style={styles.input}
                            />
                        )}
                        {editSourceType === "html" && (
                            <textarea
                                placeholder="Paste your HTML code here..."
                                value={editHtmlContent}
                                onChange={(e) => setEditHtmlContent(e.target.value)}
                                style={styles.textarea}
                            />
                        )}
                        {editSourceType === "text" && (
                            <textarea
                                placeholder="Paste plain text (will be saved as content.txt)"
                                value={editTextContent}
                                onChange={(e) => setEditTextContent(e.target.value)}
                                style={styles.textarea}
                            />
                        )}
                        <p style={{ fontSize: "12px", color: "#aaa" }}>
                            You can rename only, redeploy with new content, or do both together.
                        </p>
                        <div style={{ display: "flex", gap: "10px", marginTop: "14px" }}>
                            <button
                                onClick={saveEdit}
                                disabled={saving}
                                style={styles.primaryBtn}
                            >
                                {saving ? "Saving..." : "Save changes"}
                            </button>
                            <button
                                onClick={() => setEditing(null)}
                                style={styles.cancelBtn}
                                disabled={saving}
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

const styles = {
    page: {
        minHeight: "100vh",
        background: "#000",
        color: "#fff",
        fontFamily: "system-ui",
        paddingTop: "40px",
        paddingBottom: "40px",
    },
    container: {
        maxWidth: "1000px",
        margin: "0 auto",
        padding: "0 20px",
    },
    title: {
        fontSize: "32px",
        marginBottom: "30px",
    },
    empty: {
        textAlign: "center" as const,
        padding: "60px 20px",
        background: "#111",
        borderRadius: "12px",
    },
    deployLink: {
        display: "inline-block",
        marginTop: "20px",
        color: "#3b82f6",
        textDecoration: "none",
        fontSize: "16px",
    },
    table: {
        width: "100%",
        borderCollapse: "collapse" as const,
        background: "#111",
        borderRadius: "12px",
        overflow: "hidden",
    },
    th: {
        padding: "16px",
        borderBottom: "1px solid #333",
        textAlign: "left" as const,
        fontSize: "14px",
        fontWeight: 600,
        color: "#aaa",
    },
    td: {
        padding: "16px",
        borderBottom: "1px solid #222",
        fontSize: "14px",
    },
    link: {
        color: "#3b82f6",
        textDecoration: "none",
    },
    viewBtn: {
        color: "#fff",
        textDecoration: "none",
        fontSize: "14px",
        background: "#333",
        padding: "6px 12px",
        borderRadius: "6px",
        display: "inline-block",
    },
    editBtn: {
        background: "#4b5563",
        border: "none",
        color: "#fff",
        borderRadius: "6px",
        padding: "6px 12px",
        cursor: "pointer",
        fontSize: "14px",
    },
    deleteBtn: {
        background: "#ff4242",
        border: "none",
        color: "#fff",
        borderRadius: "6px",
        padding: "6px 12px",
        cursor: "pointer",
        fontSize: "14px",
    },
    modalBackdrop: {
        position: "fixed" as const,
        inset: 0,
        background: "rgba(0,0,0,0.7)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
    },
    modal: {
        background: "#0f1115",
        padding: "20px",
        borderRadius: "12px",
        maxWidth: "420px",
        width: "100%",
        border: "1px solid #222",
    },
    label: {
        display: "block",
        color: "#aaa",
        fontSize: "12px",
        marginBottom: "6px",
        marginTop: "10px",
    },
    input: {
        width: "100%",
        padding: "12px",
        borderRadius: "10px",
        background: "#111",
        border: "1px solid #333",
        color: "#fff",
        marginBottom: "8px",
    },
    primaryBtn: {
        background: "#3b82f6",
        border: "none",
        color: "#fff",
        padding: "10px 14px",
        borderRadius: "8px",
        cursor: "pointer",
        fontSize: "14px",
    },
    cancelBtn: {
        background: "transparent",
        border: "1px solid #333",
        color: "#fff",
        padding: "10px 14px",
        borderRadius: "8px",
        cursor: "pointer",
        fontSize: "14px",
    },
    textarea: {
        width: "100%",
        minHeight: "160px",
        padding: "12px",
        borderRadius: "10px",
        background: "#111",
        border: "1px solid #333",
        color: "#fff",
        marginBottom: "8px",
        fontFamily: "monospace",
        fontSize: "14px",
    },
    toggleGroup: {
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gap: "8px",
        marginBottom: "10px",
    },
    toggle: {
        background: "#1f2937",
        color: "#cbd5e1",
        border: "1px solid #334155",
        borderRadius: "10px",
        padding: "10px",
        cursor: "pointer",
        fontSize: "12px",
    },
    toggleActive: {
        background: "#3b82f6",
        color: "#fff",
        border: "1px solid "#3b82f6",
        borderRadius: "10px",
        padding: "10px",
        cursor: "pointer",
        fontSize: "12px",
    },
};
