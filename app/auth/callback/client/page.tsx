"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function CallbackClientPage() {
    const router = useRouter();

    useEffect(() => {
        async function handleCallback() {
            // Get session from hash tokens (implicit flow)
            const { data, error } = await supabase.auth.getSession();

            if (error) {
                console.error("Session error:", error);
                router.push("/login?error=session_failed");
                return;
            }

            if (data.session) {
                router.push("/dashboard");
            } else {
                router.push("/login?error=no_session");
            }
        }

        handleCallback();
    }, [router]);

    return (
        <div style={{
            minHeight: "100vh",
            background: "#000",
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "system-ui"
        }}>
            <p>Completing sign in...</p>
        </div>
    );
}
