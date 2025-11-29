import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

type DomainPayload = {
    siteId?: string;
    hostname?: string;
    id?: string;
};

const CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const CLOUDFLARE_ZONE_ID = process.env.CLOUDFLARE_ZONE_ID;
const CLOUDFLARE_CNAME_TARGET =
    process.env.CLOUDFLARE_CNAME_TARGET || "edge.simplhost.com";

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

function normalizeHostname(hostname: string) {
    return hostname
        .toLowerCase()
        .replace(/^https?:\/\//, "")
        .replace(/\/+$/, "");
}

async function ensureUser(req: Request) {
    const token = getTokenFromRequest(req);
    if (!token) return { error: "Unauthorized" as const };
    const supabase = getSupabaseWithToken(token);
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) return { error: "Unauthorized" as const };
    return { supabase, user };
}

async function createCustomHostname(hostname: string) {
    if (!CLOUDFLARE_API_TOKEN || !CLOUDFLARE_ZONE_ID) {
        throw new Error("Cloudflare environment variables are not configured");
    }

    const body = {
        hostname,
        ssl: {
            method: "http",
            type: "dv",
        },
        // Cloudflare will route to the worker you have set as fallback/origin.
    };

    const res = await fetch(
        `https://api.cloudflare.com/client/v4/zones/${CLOUDFLARE_ZONE_ID}/custom_hostnames`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}`,
            },
            body: JSON.stringify(body),
        }
    );

    const json = await res.json();
    if (!res.ok) {
        const reason = json?.errors?.[0]?.message || "Cloudflare create failed";
        throw new Error(reason);
    }

    const result = json?.result || {};
    const ssl = result.ssl || {};
    const validationRecords = Array.isArray(ssl.validation_records)
        ? ssl.validation_records
        : [];

    const record = validationRecords[0] || {};
    const verification =
        record.cname_target ||
        record.txt_value ||
        record.http_url ||
        null;

    return {
        id: result.id as string,
        status: (ssl.status as string) || "pending",
        verification_method: record.cname_target
            ? "cname"
            : record.txt_value
                ? "txt"
                : record.http_url
                    ? "http"
                    : null,
        verification_value: verification,
        validation_records: validationRecords,
    };
}

async function fetchCustomHostnameStatus(customHostnameId: string) {
    if (!CLOUDFLARE_API_TOKEN || !CLOUDFLARE_ZONE_ID) {
        throw new Error("Cloudflare environment variables are not configured");
    }

    const res = await fetch(
        `https://api.cloudflare.com/client/v4/zones/${CLOUDFLARE_ZONE_ID}/custom_hostnames/${customHostnameId}`,
        {
            headers: {
                Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}`,
            },
        }
    );

    const json = await res.json();
    if (!res.ok) {
        const reason = json?.errors?.[0]?.message || "Cloudflare fetch failed";
        throw new Error(reason);
    }

    const result = json?.result || {};
    const ssl = result.ssl || {};
    const validationRecords = Array.isArray(ssl.validation_records)
        ? ssl.validation_records
        : [];

    const record = validationRecords[0] || {};
    const verification =
        record.cname_target ||
        record.txt_value ||
        record.http_url ||
        null;

    return {
        status: (ssl.status as string) || "pending",
        verification_method: record.cname_target
            ? "cname"
            : record.txt_value
                ? "txt"
                : record.http_url
                    ? "http"
                    : null,
        verification_value: verification,
        validation_records: validationRecords,
    };
}

export async function GET(req: Request) {
    try {
        const auth = await ensureUser(req);
        if ("error" in auth) {
            return NextResponse.json({ error: auth.error }, { status: 401 });
        }
        const { supabase, user } = auth;

        const { data, error } = await supabase
            .from("domains")
            .select("*")
            .eq("user_id", user.id)
            .order("created_at", { ascending: false });

        if (error) {
            console.error("Fetch domains failed:", error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json(Array.isArray(data) ? data : []);
    } catch (err: any) {
        console.error("Domains GET failed:", err);
        return NextResponse.json(
            { error: err.message || "Failed to fetch domains" },
            { status: 500 }
        );
    }
}

export async function POST(req: Request) {
    try {
        const auth = await ensureUser(req);
        if ("error" in auth) {
            return NextResponse.json({ error: auth.error }, { status: 401 });
        }
        const { supabase, user } = auth;

        const body = (await req.json().catch(() => null)) as DomainPayload | null;
        const siteId = body?.siteId?.trim();
        const rawHostname = body?.hostname?.trim();

        if (!siteId || !rawHostname) {
            return NextResponse.json({ error: "Missing siteId or hostname" }, { status: 400 });
        }

        const hostname = normalizeHostname(rawHostname);

        const { data: site, error: siteError } = await supabase
            .from("sites")
            .select("id, domain, user_id")
            .eq("id", siteId)
            .eq("user_id", user.id)
            .maybeSingle();

        if (siteError || !site) {
            return NextResponse.json({ error: "Site not found" }, { status: 404 });
        }

        const { data: existing, error: existingError } = await supabase
            .from("domains")
            .select("id")
            .eq("hostname", hostname)
            .maybeSingle();

        if (existingError) {
            console.error("Check domain uniqueness failed:", existingError);
            return NextResponse.json({ error: "Failed to validate domain" }, { status: 500 });
        }
        if (existing) {
            return NextResponse.json({ error: "Hostname already in use" }, { status: 409 });
        }

        const cf = await createCustomHostname(hostname);

        const { data: inserted, error: insertError } = await supabase
            .from("domains")
            .insert({
                site_id: site.id,
                user_id: user.id,
                hostname,
                cf_custom_hostname_id: cf.id,
                status: cf.status || "pending",
                verification_method: cf.verification_method,
                verification_value: cf.verification_value,
            })
            .select("*")
            .maybeSingle();

        if (insertError || !inserted) {
            console.error("Insert domain failed:", insertError);
            return NextResponse.json(
                { error: "Created in Cloudflare but failed to save to database" },
                { status: 500 }
            );
        }

        return NextResponse.json({
            success: true,
            domain: inserted,
            dnsRecords: cf.validation_records || [],
            cnameTarget: CLOUDFLARE_CNAME_TARGET,
        });
    } catch (err: any) {
        console.error("Domain POST failed:", err);
        return NextResponse.json(
            { error: err.message || "Failed to create domain" },
            { status: 500 }
        );
    }
}

export async function PATCH(req: Request) {
    try {
        const auth = await ensureUser(req);
        if ("error" in auth) {
            return NextResponse.json({ error: auth.error }, { status: 401 });
        }
        const { supabase, user } = auth;

        const body = (await req.json().catch(() => null)) as DomainPayload | null;
        const id = body?.id?.trim();

        if (!id) {
            return NextResponse.json({ error: "Missing domain id" }, { status: 400 });
        }

        const { data: domain, error: fetchError } = await supabase
            .from("domains")
            .select("*")
            .eq("id", id)
            .eq("user_id", user.id)
            .maybeSingle();

        if (fetchError || !domain) {
            return NextResponse.json({ error: "Domain not found" }, { status: 404 });
        }

        if (!domain.cf_custom_hostname_id) {
            return NextResponse.json({ error: "Missing Cloudflare mapping for this domain" }, { status: 400 });
        }

        const cf = await fetchCustomHostnameStatus(domain.cf_custom_hostname_id as string);

        const { data: updated, error: updateError } = await supabase
            .from("domains")
            .update({
                status: cf.status || domain.status,
                verification_method: cf.verification_method ?? domain.verification_method,
                verification_value: cf.verification_value ?? domain.verification_value,
                updated_at: new Date().toISOString(),
            })
            .eq("id", id)
            .eq("user_id", user.id)
            .select("*")
            .maybeSingle();

        if (updateError || !updated) {
            console.error("Update domain failed:", updateError);
            return NextResponse.json({ error: "Failed to update domain status" }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            domain: updated,
            dnsRecords: cf.validation_records || [],
            cnameTarget: CLOUDFLARE_CNAME_TARGET,
        });
    } catch (err: any) {
        console.error("Domain PATCH failed:", err);
        return NextResponse.json(
            { error: err.message || "Failed to refresh domain" },
            { status: 500 }
        );
    }
}

export async function DELETE(req: Request) {
    try {
        const auth = await ensureUser(req);
        if ("error" in auth) {
            return NextResponse.json({ error: auth.error }, { status: 401 });
        }
        const { supabase, user } = auth;

        const body = (await req.json().catch(() => null)) as DomainPayload | null;
        const id = body?.id?.trim();

        if (!id) {
            return NextResponse.json({ error: "Missing domain id" }, { status: 400 });
        }

        const { data: domain, error: fetchError } = await supabase
            .from("domains")
            .select("*")
            .eq("id", id)
            .eq("user_id", user.id)
            .maybeSingle();

        if (fetchError || !domain) {
            return NextResponse.json({ error: "Domain not found" }, { status: 404 });
        }

        if (domain.cf_custom_hostname_id && CLOUDFLARE_API_TOKEN && CLOUDFLARE_ZONE_ID) {
            try {
                await fetch(
                    `https://api.cloudflare.com/client/v4/zones/${CLOUDFLARE_ZONE_ID}/custom_hostnames/${domain.cf_custom_hostname_id}`,
                    {
                        method: "DELETE",
                        headers: {
                            Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}`,
                        },
                    }
                );
            } catch (cfErr) {
                console.error("Cloudflare delete failed (non-blocking):", cfErr);
            }
        }

        const { error: deleteError } = await supabase
            .from("domains")
            .delete()
            .eq("id", id)
            .eq("user_id", user.id);

        if (deleteError) {
            console.error("Delete domain failed:", deleteError);
            return NextResponse.json({ error: "Failed to delete domain" }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (err: any) {
        console.error("Domain DELETE failed:", err);
        return NextResponse.json(
            { error: err.message || "Failed to delete domain" },
            { status: 500 }
        );
    }
}
