import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getTokenFromRequest(req: Request) {
    const header = req.headers.get("authorization") || "";
    const [, token] = header.split(" ");
    return token || null;
}

function getSupabaseWithToken(accessToken: string) {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            global: {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                },
            },
        }
    );
}

export async function DELETE(req: Request) {
    try {
        const token = getTokenFromRequest(req);
        if (!token) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const supabase = getSupabaseWithToken(token);
        const { data: { user }, error: userError } = await supabase.auth.getUser();

        if (userError || !user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const url = new URL(req.url);
        const subdomain = url.searchParams.get("subdomain");
        const id = url.searchParams.get("id");

        if (!subdomain || !id) {
            return NextResponse.json({ error: "Missing subdomain or id" }, { status: 400 });
        }

        // Delete from Supabase (only if user owns it)
        const { error: deleteError } = await supabase
            .from("sites")
            .delete()
            .eq("id", id)
            .eq("user_id", user.id);

        if (deleteError) {
            console.error("Delete failed:", deleteError);
            return NextResponse.json({ error: "Failed to delete from database" }, { status: 500 });
        }

        // �o. Delete from Cloudflare Worker storage
        // This removes all files associated with the subdomain from R2
        const workerDeleteUrl = `https://calm-rice-1449.simplhost.workers.dev/delete?subdomain=${subdomain}`;
        try {
            const workerRes = await fetch(workerDeleteUrl, { method: "DELETE" });
            if (!workerRes.ok) {
                console.error("Worker delete failed:", await workerRes.text());
                // We don't fail the request if worker delete fails, as DB delete was successful
            } else {
                console.log("Worker delete successful");
            }
        } catch (workerErr) {
            console.error("Worker delete error:", workerErr);
        }

        return NextResponse.json({ success: true });
    } catch (err: any) {
        console.error("Delete failed:", err);
        return NextResponse.json(
            { error: err.message || "Delete failed" },
            { status: 500 }
        );
    }
}
