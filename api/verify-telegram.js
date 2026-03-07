/**
 * Daladan — Telegram Login Verification  (Vercel Serverless Function)
 * =====================================================================
 * POST /api/verify-telegram
 *
 * Receives the Telegram Login Widget payload from the frontend,
 * verifies its HMAC-SHA-256 signature against BOT_TOKEN,
 * then writes the Telegram fields into public.users for the
 * authenticated Supabase user.
 *
 * Required env vars (set in Vercel Dashboard):
 *   TELEGRAM_BOT_TOKEN
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

// ──────────────────────────────────────────────────────────────
// Config
// ──────────────────────────────────────────────────────────────

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

// Service-role client — bypasses RLS
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ──────────────────────────────────────────────────────────────
// HMAC Verification  (per https://core.telegram.org/widgets/login)
// ──────────────────────────────────────────────────────────────

function verifyTelegramPayload(payload, botToken) {
    const { hash, ...data } = payload;

    if (!hash) return false;

    // 1. Build the data-check string (sorted key=value pairs joined by \n)
    const checkString = Object.keys(data)
        .sort()
        .map((key) => `${key}=${data[key]}`)
        .join("\n");

    // 2. Secret key = SHA-256 of the bot token
    const secretKey = crypto
        .createHash("sha256")
        .update(botToken)
        .digest();

    // 3. HMAC-SHA-256 of the check string
    const hmac = crypto
        .createHmac("sha256", secretKey)
        .update(checkString)
        .digest("hex");

    // 4. Constant-time comparison
    if (hmac.length !== hash.length) return false;
    return crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(hash));
}

// ──────────────────────────────────────────────────────────────
// Handler
// ──────────────────────────────────────────────────────────────

export default async function handler(req, res) {
    // Only POST
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    try {
        const { telegramData, supabaseUserId } = req.body;

        // --- Validate inputs ------------------------------------------------
        if (!telegramData || !supabaseUserId) {
            return res.status(400).json({
                error: "Missing telegramData or supabaseUserId in request body.",
            });
        }

        if (!BOT_TOKEN) {
            console.error("TELEGRAM_BOT_TOKEN is not set.");
            return res.status(500).json({ error: "Server misconfigured." });
        }

        // --- HMAC verification -----------------------------------------------
        const isValid = verifyTelegramPayload(telegramData, BOT_TOKEN);
        if (!isValid) {
            return res.status(403).json({ error: "Invalid Telegram data signature." });
        }

        // --- Freshness check (reject if auth_date > 5 min old) ---------------
        const authDate = Number(telegramData.auth_date);
        if (!authDate || Date.now() / 1000 - authDate > 300) {
            return res.status(403).json({ error: "Telegram auth data has expired." });
        }

        // --- Write Telegram fields to public.users ---------------------------
        const { error: updateErr } = await supabase
            .from("users")
            .update({
                telegram_id: telegramData.id,
                telegram_username: telegramData.username || null,
                telegram_first_name: telegramData.first_name || null,
                telegram_phone: telegramData.phone || null,
                is_bot_started: false, // will flip to true when they /start the bot
            })
            .eq("id", supabaseUserId);

        if (updateErr) {
            console.error("Supabase UPDATE error:", updateErr);

            // Unique constraint violation → telegram_id already linked to another account
            if (updateErr.code === "23505") {
                return res.status(409).json({
                    error: "This Telegram account is already linked to another Daladan account.",
                });
            }

            return res.status(500).json({ error: "Failed to save Telegram data." });
        }

        return res.status(200).json({ ok: true });
    } catch (err) {
        console.error("verify-telegram error:", err);
        return res.status(500).json({ error: "Internal server error." });
    }
}
