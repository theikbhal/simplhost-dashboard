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

type Domain = {
    id: string;
    hostname: string;
    site_id: string;
    status?: string | null;
    verification_method?: string | null;
    verification_value?: string | null;
    created_at?: string;
};

export default function ManageSites() {
    const [sites, setSites] = useState<Site[]>([]);
    const [domains, setDomains] = useState<Domain[]>([]);
    const [loading, setLoading] = useState(true);
    const [domainsLoading, setDomainsLoading] = useState(true);
    const [accessToken, setAccessToken] = useState<string | null>(null);
    const [editing, setEditing] = useState<Site | null>(null);
    const [editSubdomain, setEditSubdomain] = useState("");
    const [editFile, setEditFile] = useState<File | null>(null);
    const [saving, setSaving] = useState(false);
    const [domainModalSite, setDomainModalSite] = useState<Site | null>(null);
    const [newDomain, setNewDomain] = useState("");
    const [addingDomain, setAddingDomain] = useState(false);
    const [dnsTip, setDnsTip] = useState<string | null>(null);
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
            await loadDomains(data.session.access_token);
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

    async function loadDomains(token?: string) {
        setDomainsLoading(true);
        try {
            const authToken = token || accessToken;
            if (!authToken) {
                setDomains([]);
                return;
            }
            const res = await fetch("/api/domains", {
                headers: {
                    Authorization: `Bearer ${authToken}`,
                },
            });
            const body = await res.json().catch(() => null);
            if (!res.ok) {
                console.error("Failed to load domains", body);
                setDomains([]);
                return;
            }
            const parsed = Array.isArray(body) ? body : [];
            setDomains(parsed);
        } catch (err) {
            console.error("Failed to load domains", err);
            setDomains([]);
        } finally {
            setDomainsLoading(false);
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
    }

    function openDomains(site: Site) {
        setDomainModalSite(site);
        setNewDomain("");
        setDnsTip(null);
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

        setSaving(true);
        const form = new FormData();
        form.append("id", editing.id);
        form.append("subdomain", editSubdomain.trim());
        if (editFile) {
            form.append("file", editFile);
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

    async function addCustomDomain() {
        if (!domainModalSite) return;
        if (!newDomain.trim()) {
            alert("Enter a hostname (e.g. example.com)");
            return;
        }
        if (!accessToken) {
            alert("Session missing. Please log in again.");
            router.push("/login");
            return;
        }
        setAddingDomain(true);
        setDnsTip(null);
        const res = await fetch("/api/domains", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({
                siteId: domainModalSite.id,
                hostname: newDomain.trim(),
            }),
        });
        const body = await res.json().catch(() => null);
        setAddingDomain(false);

        if (!res.ok) {
            alert(body?.error || "Failed to add domain");
            return;
        }

        if (body?.domain) {
            setDomains((prev) => [body.domain as Domain, ...prev]);
        }
        const dnsText = formatDnsTip(body);
        setDnsTip(dnsText);
        setNewDomain("");
    }

    async function refreshDomain(id: string) {
        if (!accessToken) {
            alert("Session missing. Please log in again.");
            router.push("/login");
            return;
        }
        const res = await fetch("/api/domains", {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({ id }),
        });
        const body = await res.json().catch(() => null);
        if (!res.ok) {
            alert(body?.error || "Failed to refresh");
            return;
        }
        if (body?.domain) {
            setDomains((prev) =>
                prev.map((d) => (d.id === id ? (body.domain as Domain) : d))
            );
            const dnsText = formatDnsTip(body);
            setDnsTip(dnsText);
        }
    }

    async function deleteDomain(id: string) {
        if (!confirm("Remove this custom domain?")) return;
        if (!accessToken) {
            alert("Session missing. Please log in again.");
            router.push("/login");
            return;
        }
        const res = await fetch("/api/domains", {
            method: "DELETE",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({ id }),
        });
        if (!res.ok) {
            const body = await res.json().catch(() => null);
            alert(body?.error || "Failed to delete domain");
            return;
        }
        setDomains((prev) => prev.filter((d) => d.id !== id));
    }

    function formatDnsTip(body: any) {
        const record = body?.dnsRecords?.[0];
        if (record?.cname_name && record?.cname_target) {
            return `Create CNAME ${record.cname_name} -> ${record.cname_target}`;
        }
        if (body?.cnameTarget && body?.domain?.hostname) {
            return `Point ${body.domain.hostname} to ${body.cnameTarget}`;
        }
        if (record?.txt_name && record?.txt_value) {
            return `Add TXT ${record.txt_name} with value ${record.txt_value}`;
        }
        return null;
    }

    function renderStatusBadge(status?: string | null) {
        const text = status || "pending";
        const isActive = text.toLowerCase() === "active";
        const bg = isActive ? "#16a34a" : "#f59e0b";
        return (
            <span style={{ ...styles.badge, background: bg }}>
                {text}
            </span>
        );
    }

    function siteDomains(siteId: string) {
        return domains.filter((d) => d.site_id === siteId);
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
                                                onClick={() => openDomains(site)}
                                                style={styles.secondaryBtn}
                                            >
                                                Domains
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
                        <label style={styles.label}>Upload new ZIP / file (optional)</label>
                        <input
                            type="file"
                            accept=".zip,.html"
                            onChange={(e) => setEditFile(e.target.files?.[0] || null)}
                            style={styles.input}
                        />
                        <p style={{ fontSize: "12px", color: "#aaa" }}>
                            You can: 1) rename only, 2) redeploy with a new file only, or 3) do both at once.
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
            {domainModalSite && (
                <div style={styles.modalBackdrop}>
                    <div style={styles.modalWide}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <h3 style={{ margin: 0 }}>Custom domains for {domainModalSite.domain}</h3>
                            <button
                                onClick={() => { setDomainModalSite(null); setDnsTip(null); }}
                                style={styles.cancelBtn}
                            >
                                Close
                            </button>
                        </div>
                        <p style={{ color: "#9ca3af", marginTop: "8px" }}>
                            Point your DNS to the worker (CNAME to edge) and wait for Cloudflare SSL to activate.
                        </p>
                        <div style={{ marginTop: "16px", marginBottom: "12px" }}>
                            <label style={styles.label}>New hostname</label>
                            <input
                                value={newDomain}
                                onChange={(e) => setNewDomain(e.target.value)}
                                style={styles.input}
                                placeholder="example.com"
                            />
                            <button
                                onClick={addCustomDomain}
                                style={styles.primaryBtn}
                                disabled={addingDomain}
                            >
                                {addingDomain ? "Adding..." : "Add domain"}
                            </button>
                        </div>
                        {dnsTip && (
                            <div style={styles.dnsBox}>
                                <strong>DNS:</strong> {dnsTip}
                            </div>
                        )}
                        <div style={{ marginTop: "12px" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                                <span style={{ color: "#9ca3af" }}>
                                    Existing domains {domainsLoading ? "(loading...)" : ""}
                                </span>
                                <button
                                    onClick={() => loadDomains()}
                                    style={styles.smallGhost}
                                >
                                    Refresh list
                                </button>
                            </div>
                            {siteDomains(domainModalSite.id).length === 0 ? (
                                <p style={{ color: "#9ca3af", marginTop: "6px" }}>No custom domains yet.</p>
                            ) : (
                                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                                    {siteDomains(domainModalSite.id).map((d) => (
                                        <div key={d.id} style={styles.domainRow}>
                                            <div>
                                                <div style={{ fontWeight: 600 }}>{d.hostname}</div>
                                                <div style={{ color: "#9ca3af", fontSize: "12px" }}>
                                                    {renderStatusBadge(d.status)}
                                                    {d.verification_method && d.verification_value && (
                                                        <span style={{ marginLeft: "8px" }}>
                                                            {d.verification_method.toUpperCase()}: {d.verification_value}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            <div style={{ display: "flex", gap: "8px" }}>
                                                <button
                                                    onClick={() => refreshDomain(d.id)}
                                                    style={styles.smallGhost}
                                                >
                                                    Refresh
                                                </button>
                                                <button
                                                    onClick={() => deleteDomain(d.id)}
                                                    style={styles.dangerOutline}
                                                >
                                                    Remove
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
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
    secondaryBtn: {
        background: "#1f2937",
        border: "1px solid #374151",
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
    modalWide: {
        background: "#0f1115",
        padding: "20px",
        borderRadius: "12px",
        maxWidth: "720px",
        width: "100%",
        border: "1px solid #222",
    },
    dnsBox: {
        background: "#111827",
        border: "1px solid #1f2937",
        color: "#e5e7eb",
        padding: "10px 12px",
        borderRadius: "8px",
        marginTop: "8px",
    },
    domainRow: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "12px",
        border: "1px solid #1f2937",
        borderRadius: "10px",
        background: "#0b0d12",
    },
    badge: {
        display: "inline-block",
        padding: "3px 8px",
        borderRadius: "999px",
        fontSize: "12px",
        color: "#fff",
    },
    smallGhost: {
        background: "transparent",
        border: "1px solid #374151",
        color: "#fff",
        padding: "6px 10px",
        borderRadius: "6px",
        cursor: "pointer",
        fontSize: "12px",
    },
    dangerOutline: {
        background: "transparent",
        border: "1px solid #f87171",
        color: "#f87171",
        padding: "6px 10px",
        borderRadius: "6px",
        cursor: "pointer",
        fontSize: "12px",
    },
};
