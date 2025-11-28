"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter, usePathname } from "next/navigation";

export default function Navbar() {
    const [user, setUser] = useState<any>(null);
    const router = useRouter();
    const pathname = usePathname();

    useEffect(() => {
        // Check current session
        supabase.auth.getSession().then(({ data: { session } }) => {
            setUser(session?.user ?? null);
        });

        // Listen for auth changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setUser(session?.user ?? null);
        });

        return () => subscription.unsubscribe();
    }, []);

    async function handleLogout() {
        await supabase.auth.signOut();
        router.push("/");
    }

    return (
        <div
            style={{
                padding: "16px 32px",
                background: "#000",
                borderBottom: "1px solid #222",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
            }}
        >
            <Link href="/" style={{ textDecoration: "none" }}>
                <h2 style={{ color: "#fff", fontSize: "18px", margin: 0 }}>SimplHost</h2>
            </Link>

            <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                {user ? (
                    <>
                        {pathname !== "/dashboard" && (
                            <Link href="/dashboard" style={linkStyle}>Dashboard</Link>
                        )}
                        {pathname !== "/sites" && (
                            <Link href="/sites" style={linkStyle}>Manage Sites</Link>
                        )}
                        <span style={{ fontSize: "14px", color: "#aaa" }}>
                            {user.user_metadata?.full_name || user.email?.split('@')[0]}
                        </span>
                        <button onClick={handleLogout} style={logoutStyle}>Logout</button>
                    </>
                ) : (
                    <>
                        <Link href="/login" style={linkStyle}>Login</Link>
                        <Link href="/login" style={signupStyle}>Sign up free</Link>
                    </>
                )}
            </div>
        </div>
    );
}

const linkStyle = {
    color: "#aaa",
    textDecoration: "none",
    fontSize: "14px",
};

const logoutStyle = {
    color: "#fff",
    textDecoration: "none",
    fontSize: "14px",
    background: "transparent",
    border: "1px solid #333",
    padding: "6px 14px",
    borderRadius: "8px",
    cursor: "pointer",
};

const signupStyle = {
    color: "#fff",
    textDecoration: "none",
    fontSize: "14px",
    background: "#3b82f6",
    padding: "8px 16px",
    borderRadius: "8px",
    fontWeight: 600,
};
