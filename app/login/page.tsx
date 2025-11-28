"use client";

import { supabase } from "@/lib/supabase";

export default function LoginPage() {
    async function loginWithGoogle() {
        await supabase.auth.signInWithOAuth({
            provider: "google",
            options: {
                redirectTo: `${window.location.origin}/auth/callback`,
                flowType: "pkce",
            },
        });
    }

    return (
        <div style={styles.page}>
            <h1 style={styles.title}>Login to SimplHost</h1>

            <button onClick={loginWithGoogle} style={styles.googleBtn}>
                Continue with Google
            </button>
        </div>
    );
}

const styles = {
    page: {
        minHeight: "100vh",
        background: "#000",
        color: "#fff",
        display: "flex",
        flexDirection: "column" as const,
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "system-ui",
    },
    title: { fontSize: "32px", marginBottom: "30px" },
    googleBtn: {
        padding: "16px 28px",
        background: "#fff",
        color: "#000",
        borderRadius: "12px",
        fontSize: "16px",
        fontWeight: 600,
        border: "none",
        cursor: "pointer",
    },
};
