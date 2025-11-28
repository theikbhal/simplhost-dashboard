"use client";

import { useState } from "react";

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [subdomain, setSubdomain] = useState("");
  const [loading, setLoading] = useState(false);
  const [url, setUrl] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !subdomain) return alert("Missing inputs");

    setLoading(true);
    setUrl("");

    const formData = new FormData();
    formData.append("file", file);
    formData.append("subdomain", subdomain);

    const res = await fetch("/api/sites", {
      method: "POST",
      body: formData,
    });

    const data = await res.json();
    setLoading(false);

    if (data?.url) {
      setUrl(data.url);
    }
  }

  return (
    <div style={styles.page}>
      <main style={styles.wrapper}>
        <h1 style={styles.heroTitle}>Deploy Static Sites Instantly</h1>
        <p style={styles.heroSubtitle}>
          Upload a ZIP or HTML file and deploy within seconds.
        </p>

        {/* UPLOAD FORM */}
        <form onSubmit={handleSubmit} style={styles.form}>
          <input
            type="text"
            placeholder="Enter subdomain (ex: demo123)"
            value={subdomain}
            onChange={(e) => setSubdomain(e.target.value)}
            style={styles.input}
          />

          <input
            type="file"
            accept=".zip,.html"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            style={styles.input}
          />

          <button type="submit" style={styles.button}>
            {loading ? "Uploading..." : "Deploy Site"}
          </button>
        </form>

        {url && (
          <div style={styles.result}>
            ✅ Live URL:
            <a href={url} target="_blank" style={styles.liveLink}>
              {url}
            </a>
          </div>
        )}
      </main>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background: "#000",
    color: "white",
    fontFamily: "system-ui",
  },

  wrapper: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: "40px",
    paddingBottom: "40px",
  },

  heroTitle: {
    fontSize: "32px",
    marginBottom: "8px",
    fontWeight: 700,
    textAlign: "center" as const,
  },

  heroSubtitle: {
    opacity: 0.7,
    marginBottom: "32px",
    fontSize: "14px",
    textAlign: "center" as const,
  },

  form: {
    width: "100%",
    maxWidth: "400px",
    display: "flex",
    flexDirection: "column" as const,
    gap: "10px",
    padding: "0 20px",
  },

  input: {
    padding: "10px 12px",
    borderRadius: "8px",
    background: "#111",
    border: "1px solid #333",
    color: "white",
    fontSize: "14px",
  },

  button: {
    background: "#3b82f6",
    border: "none",
    padding: "12px",
    borderRadius: "8px",
    color: "white",
    fontWeight: 600,
    cursor: "pointer",
    fontSize: "14px",
  },

  result: {
    marginTop: "20px",
    textAlign: "center" as const,
    fontSize: "14px",
  },

  liveLink: {
    display: "block",
    color: "#22c55e",
    marginTop: "6px",
    textDecoration: "underline",
    fontSize: "14px",
  },
};
