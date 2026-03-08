/**
 * Daladan — Telegram OTP Verification  (Vercel Serverless Function)
 * ==================================================================
 * POST /api/verify-telegram-otp
 *
 * Accepts { code, supabaseUserId } in the request body.
 * Validates the OTP, links the telegram_id to the user's profile
 * in public.users, and deletes the OTP so it can't be reused.
 *
 * Required env vars:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from "@supabase/supabase-js";

// ──────────────────────────────────────────────────────────────
// Config
// ──────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

// Service-role client — bypasses RLS
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ──────────────────────────────────────────────────────────────
// Handler
// ──────────────────────────────────────────────────────────────

export default async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    try {
        const { code, supabaseUserId } = req.body || {};

        // --- Validate inputs ------------------------------------------------
        if (!code || typeof code !== "string" || code.length !== 6) {
            return res.status(400).json({ error: "A valid 6-digit code is required." });
        }

        if (!supabaseUserId) {
            return res.status(400).json({ error: "Missing supabaseUserId." });
        }

        // --- Look up the OTP -------------------------------------------------
        const { data: otpRow, error: selectErr } = await supabase
            .from("telegram_otps")
            .select("*")
            .eq("code", code)
            .maybeSingle();

        if (selectErr) {
            console.error("OTP lookup error:", selectErr);
            return res.status(500).json({ error: "Database error." });
        }

        if (!otpRow) {
            return res.status(400).json({ error: "Invalid code. Please request a new one from the bot." });
        }

        // --- Check expiry ----------------------------------------------------
        if (new Date(otpRow.expires_at) < new Date()) {
            await supabase.from("telegram_otps").delete().eq("id", otpRow.id);
            return res.status(400).json({ error: "Code expired. Please request a new one from the bot." });
        }

        // --- Link telegram_id to the user's profile -------------------------
        const { error: updateErr } = await supabase
            .from("users")
            .update({
                telegram_id: otpRow.telegram_id,
                telegram_first_name: otpRow.first_name || null,
                telegram_username: otpRow.telegram_username || null,
                is_bot_started: true,
            })
            .eq("id", supabaseUserId);

        if (updateErr) {
            console.error("Supabase UPDATE error:", updateErr);
            return res.status(500).json({ error: "Failed to link Telegram account." });
        }

        // --- Delete the OTP so it can't be reused ----------------------------
        await supabase.from("telegram_otps").delete().eq("id", otpRow.id);

        return res.status(200).json({ ok: true });
    } catch (err) {
        console.error("verify-telegram-otp error:", err);
        return res.status(500).json({ error: "Internal server error." });
    }
}
