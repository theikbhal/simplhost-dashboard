import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

// �o. CHANGE THIS to your worker URL
const WORKER_UPLOAD_URL =
    "https://calm-rice-1449.simplhost.workers.dev/upload";
const WORKER_DELETE_URL =
    "https://calm-rice-1449.simplhost.workers.dev/delete";
const WORKER_RENAME_URL =
    "https://calm-rice-1449.simplhost.workers.dev/rename";

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

async function ensureUser(req: Request) {
    const token = getTokenFromRequest(req);
    if (!token) return { error: "Unauthorized" as const };
    const supabase = getSupabaseWithToken(token);
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) return { error: "Unauthorized" as const };
    return { supabase, user };
}

async function uploadToWorker(subdomain: string, file: File) {
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const workerForm = new FormData();
    const blob = new Blob([buffer]);
    workerForm.append("subdomain", subdomain);
    workerForm.append("file", blob, file.name);

    const uploadRes = await fetch(WORKER_UPLOAD_URL, {
        method: "POST",
        body: workerForm
    });

    const result = await uploadRes.json();
    return { ok: uploadRes.ok, result };
}

async function wipeFromWorker(subdomain: string) {
    try {
        await fetch(`${WORKER_DELETE_URL}?subdomain=${encodeURIComponent(subdomain)}`, {
            method: "DELETE",
        });
    } catch (err) {
        console.error("Worker delete failed (non-blocking):", err);
    }
}

async function renameInWorker(oldSub: string, newSub: string) {
    const form = new FormData();
    form.append("old_subdomain", oldSub);
    form.append("new_subdomain", newSub);

    const res = await fetch(WORKER_RENAME_URL, {
        method: "POST",
        body: form,
    });
    const result = await res.json().catch(() => null);
    return { ok: res.ok, result };
}

export async function POST(req: Request) {
    try {
        const auth = await ensureUser(req);
        if ("error" in auth) {
            return NextResponse.json({ error: auth.error }, { status: 401 });
        }
        const { supabase, user } = auth;

        const form = await req.formData();

        const file = form.get("file") as File | null;
        const subdomain = form.get("subdomain") as string | null;

        if (!file || !subdomain) {
            return NextResponse.json({ error: "Missing file or subdomain" }, { status: 400 });
        }

        await wipeFromWorker(subdomain);
        const upload = await uploadToWorker(subdomain, file);

        if (!upload.ok) {
            return NextResponse.json({ error: upload.result }, { status: 500 });
        }

        // �o. Save to Supabase using authenticated client
        const { error: insertError } = await supabase
            .from("sites")
            .insert({
                user_id: user.id,
                domain: subdomain, // DB 'domain' column stores the subdomain
                link: `https://${subdomain}.simplhost.com`, // DB 'link' column stores full URL
                created_at: new Date().toISOString()
            });

        if (insertError) {
            console.error("Supabase insert failed:", insertError);
            return NextResponse.json(
                { error: "Site deployed but failed to save to database: " + insertError.message },
                { status: 500 }
            );
        }

        return NextResponse.json({
            success: true,
            url: `https://${subdomain}.simplhost.com`
        });

    } catch (err: any) {
        console.error("Upload failed:", err);
        return NextResponse.json(
            { error: err.message || "Upload failed" },
            { status: 500 }
        );
    }
}

export async function PUT(req: Request) {
    try {
        const auth = await ensureUser(req);
        if ("error" in auth) {
            return NextResponse.json({ error: auth.error }, { status: 401 });
        }
        const { supabase, user } = auth;

        const form = await req.formData();
        const id = (form.get("id") as string | null)?.trim();
        const subdomain = (form.get("subdomain") as string | null)?.trim();
        const file = form.get("file") as File | null;

        if (!id || !subdomain) {
            return NextResponse.json({ error: "Missing id or subdomain" }, { status: 400 });
        }

        const { data: existing, error: fetchError } = await supabase
            .from("sites")
            .select("*")
            .eq("id", id)
            .eq("user_id", user.id)
            .maybeSingle();

        if (fetchError || !existing) {
            return NextResponse.json({ error: "Site not found" }, { status: 404 });
        }

        const oldSubdomain = existing.domain as string;
        const isRename = oldSubdomain !== subdomain;

        // Clean + redeploy scenarios
        if (isRename && !file) {
            // Move existing assets to the new prefix
            const rename = await renameInWorker(oldSubdomain, subdomain);
            if (!rename.ok) {
                return NextResponse.json({ error: rename.result || "Rename failed" }, { status: 500 });
            }
        } else if (isRename && file) {
            await wipeFromWorker(oldSubdomain);
            await wipeFromWorker(subdomain);
            const upload = await uploadToWorker(subdomain, file);
            if (!upload.ok) {
                return NextResponse.json({ error: upload.result }, { status: 500 });
            }
        } else if (!isRename && file) {
            await wipeFromWorker(subdomain);
            const upload = await uploadToWorker(subdomain, file);
            if (!upload.ok) {
                return NextResponse.json({ error: upload.result }, { status: 500 });
            }
        }

        const { error: updateError } = await supabase
            .from("sites")
            .update({
                domain: subdomain,
                link: `https://${subdomain}.simplhost.com`,
                updated_at: new Date().toISOString(),
            })
            .eq("id", id)
            .eq("user_id", user.id);

        if (updateError) {
            console.error("Supabase update failed:", updateError);
            return NextResponse.json(
                { error: "Updated content but failed to save to database: " + updateError.message },
                { status: 500 }
            );
        }

        return NextResponse.json({
            success: true,
            url: `https://${subdomain}.simplhost.com`
        });
    } catch (err: any) {
        console.error("Update failed:", err);
        return NextResponse.json(
            { error: err.message || "Update failed" },
            { status: 500 }
        );
    }
}

export async function GET(req: Request) {
    try {
        const auth = await ensureUser(req);
        if ("error" in auth) {
            return NextResponse.json({ error: auth.error }, { status: 401 });
        }
        const { supabase, user } = auth;

        const { data, error } = await supabase
            .from("sites")
            .select("*")
            .eq("user_id", user.id)
            .order("created_at", { ascending: false });

        if (error) {
            console.error("Fetch sites failed:", error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        const sites = Array.isArray(data) ? data : [];
        return NextResponse.json(sites);
    } catch (err: any) {
        console.error("Fetch sites failed:", err);
        return NextResponse.json(
            { error: err.message || "Failed to fetch sites" },
            { status: 500 }
        );
    }
}
