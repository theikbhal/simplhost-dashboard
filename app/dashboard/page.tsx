"use client";
import { supabase } from "@/lib/supabase";
import { useEffect, useState } from "react";

export default function Dashboard() {
    const [subdomain, setSubdomain] = useState("");
    const [file, setFile] = useState<File | null>(null);
    const [loading, setLoading] = useState(false);
    const [liveURL, setLiveURL] = useState("");
    const [userName, setUserName] = useState("");
    const [accessToken, setAccessToken] = useState<string | null>(null);

    useEffect(() => {
        async function protect() {
            const { data } = await supabase.auth.getSession();
            if (!data.session) {
                window.location.href = "/login";
            } else {
                // Get user name from session
                const name = data.session.user.user_metadata?.full_name ||
                    data.session.user.email?.split('@')[0] ||
                    "User";
                setUserName(name);
                setAccessToken(data.session.access_token);
            }
        }
        protect();
    }, []);

    async function deploySite() {
        if (!file || !subdomain) {
            alert("Enter subdomain and choose a ZIP");
            return;
        }

        if (!accessToken) {
            alert("Session missing. Please log in again.");
            window.location.href = "/login";
            return;
        }

        setLoading(true);
        setLiveURL("");

        const form = new FormData();
        form.append("subdomain", subdomain);
        form.append("file", file);

        const res = await fetch("/api/sites", {
            method: "POST",
            body: form,
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        });

        const data = await res.json();
        setLoading(false);

        if (data.success) {
            setLiveURL(data.url);
            setSubdomain("");
            setFile(null);
        } else {
            alert("Upload failed");
        }
    }



    return (
        <div style={styles.page}>
            {/* UPLOAD CARD */}
            <div style={styles.card}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
                    <h1 style={{ margin: 0 }}>Dashboard</h1>
                    <div style={{ fontSize: "14px", color: "#aaa" }}>
                        Welcome, <span style={{ color: "#fff", fontWeight: 600 }}>{userName}</span>
                    </div>
                </div>

                <input
                    placeholder="Subdomain"
                    value={subdomain}
                    onChange={(e) => setSubdomain(e.target.value)}
                    style={styles.input}
                />

                <input
                    type="file"
                    accept=".zip"
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                    style={styles.input}
                />

                <button onClick={deploySite} style={styles.button} disabled={loading}>
                    {loading ? "Deploying..." : "Deploy Site"}
                </button>

                {liveURL && (
                    <div style={styles.liveBox}>
                        ✅ Live URL:
                        <a href={liveURL} target="_blank" style={styles.liveLink}>
                            {liveURL}
                        </a>
                    </div>
                )}
            </div>
        </div>
    );
}

const styles = {
    page: {
        minHeight: "100vh",
        background: "#000",
        color: "#fff",
        fontFamily: "system-ui",
    },
    card: {
        margin: "60px auto 20px",
        width: "420px",
        background: "#111",
        padding: "30px",
        borderRadius: "16px",
        boxShadow: "0 0 20px rgba(255,255,255,0.05)",
    },

    input: {
        width: "100%",
        padding: "14px",
        borderRadius: "12px",
        background: "#000",
        border: "1px solid #333",
        color: "white",
        marginBottom: "12px",
    },

    button: {
        width: "100%",
        padding: "14px",
        borderRadius: "12px",
        background: "#3b82f6",
        color: "white",
        fontWeight: 600,
        border: "none",
        cursor: "pointer",
    },

    liveBox: {
        marginTop: "16px",
        color: "#7CFF9E",
    },

    liveLink: {
        display: "block",
        color: "#7CFF9E",
        marginTop: "6px",
    },

    tableWrap: {
        maxWidth: "900px",
        margin: "30px auto",
        padding: "0 20px",
    },

    table: {
        width: "100%",
        borderCollapse: "collapse" as const,
        background: "#111",
        borderRadius: "12px",
    },

    th: {
        padding: "12px",
        borderBottom: "1px solid #333",
        textAlign: "left" as const,
        fontSize: "14px",
    },

    td: {
        padding: "12px",
        borderBottom: "1px solid #222",
        fontSize: "14px",
    },

    deleteBtn: {
        background: "#ff4242",
        border: "none",
        color: "#fff",
        borderRadius: "8px",
        padding: "6px 12px",
        cursor: "pointer",
    },
};
