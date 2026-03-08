/**
 * Daladan — Telegram OTP Verification (Vercel Serverless Function)
 * =================================================================
 * POST /api/verify-telegram-otp
 *
 * Accepts { code } in the request body.
 * Validates the OTP against telegram_otps, auto-creates or updates
 * a Supabase Auth user, and returns { email, password } for the
 * frontend to call signInWithPassword().
 *
 * Required env vars:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

// ──────────────────────────────────────────────────────────────
// Config
// ──────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

// Service-role client — bypasses RLS, has admin powers
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ──────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────

/** Generate a 48-char random password */
function generateSecurePassword() {
    return crypto.randomBytes(32).toString("base64url");
}

/** Map telegram_id → deterministic dummy email */
function telegramEmail(telegramId) {
    return `telegram_${telegramId}@daladan.app`;
}

// ──────────────────────────────────────────────────────────────
// Handler
// ──────────────────────────────────────────────────────────────

export default async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    try {
        const { code } = req.body || {};

        if (!code || typeof code !== "string" || code.length !== 6) {
            return res.status(400).json({ error: "A valid 6-digit code is required." });
        }

        // 1. Look up code in telegram_otps
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

        // 2. Check expiry
        if (new Date(otpRow.expires_at) < new Date()) {
            // Clean up expired OTP
            await supabase.from("telegram_otps").delete().eq("id", otpRow.id);
            return res.status(400).json({ error: "Code expired. Please request a new one from the bot." });
        }

        // 3. Build credentials
        const email = telegramEmail(otpRow.telegram_id);
        const password = generateSecurePassword();

        // 4. Check if a Supabase Auth user with this email already exists
        const { data: existingUsers } = await supabase.auth.admin.listUsers();
        const existingUser = existingUsers?.users?.find((u) => u.email === email);

        if (existingUser) {
            // Update password so the frontend can sign in
            const { error: updateErr } = await supabase.auth.admin.updateUserById(
                existingUser.id,
                { password }
            );
            if (updateErr) {
                console.error("Failed to update user password:", updateErr);
                return res.status(500).json({ error: "Failed to prepare sign-in." });
            }
        } else {
            // Create new auth user — the DB trigger will create the public.users row
            const { error: createErr } = await supabase.auth.admin.createUser({
                email,
                password,
                email_confirm: true,
                user_metadata: {
                    full_name: otpRow.first_name || "Telegram User",
                    phone_number: "",
                    region: "",
                    role: "buyer",
                },
            });

            if (createErr) {
                console.error("Failed to create user:", createErr);
                return res.status(500).json({ error: "Failed to create account." });
            }

            // Also store the telegram_id in the public.users table
            // (wait a moment for the trigger to create the row)
            await new Promise((r) => setTimeout(r, 500));

            // Find the newly created user
            const { data: newUsers } = await supabase.auth.admin.listUsers();
            const newUser = newUsers?.users?.find((u) => u.email === email);

            if (newUser) {
                await supabase
                    .from("users")
                    .update({
                        telegram_id: otpRow.telegram_id,
                        telegram_first_name: otpRow.first_name || null,
                    })
                    .eq("id", newUser.id);
            }
        }

        // 5. Delete the OTP so it can't be reused
        await supabase.from("telegram_otps").delete().eq("id", otpRow.id);

        // 6. Return credentials to frontend
        return res.status(200).json({ email, password });
    } catch (err) {
        console.error("verify-telegram-otp error:", err);
        return res.status(500).json({ error: "Internal server error." });
    }
}
