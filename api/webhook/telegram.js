/**
 * Daladan — Telegram Webhook (Vercel Serverless Function)
 * ========================================================
 * POST /api/webhook/telegram
 *
 * Receives updates pushed by the Telegram Bot API, handles `/start`,
 * generates a 6-digit OTP, stores it in `telegram_otps`, and sends
 * the code back to the user via Telegram.
 *
 * Environment variables required (set in Vercel Dashboard → Settings → Env Vars):
 *   TELEGRAM_BOT_TOKEN
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY   (service role, NOT anon — bypasses RLS)
 */

import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

// ──────────────────────────────────────────────────────────────
// Configuration
// ──────────────────────────────────────────────────────────────

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

// Service-role client → bypasses RLS so we can read/write any row.
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ──────────────────────────────────────────────────────────────
// Telegram helper — send a text message
// ──────────────────────────────────────────────────────────────

async function sendMessage(chatId, text) {
    const res = await fetch(`${TELEGRAM_API}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            chat_id: chatId,
            text,
            parse_mode: "HTML",
        }),
    });

    if (!res.ok) {
        const body = await res.text();
        console.error("Telegram sendMessage failed:", res.status, body);
    }
}

// ──────────────────────────────────────────────────────────────
// /start handler — generate OTP and send to user
// ──────────────────────────────────────────────────────────────

async function handleStart(chatId, telegramId, firstName) {
    try {
        // 1. Generate a cryptographically secure 6-digit code
        const code = String(crypto.randomInt(100000, 999999));

        // 2. Upsert into telegram_otps (one active OTP per telegram_id)
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

        const { error: upsertErr } = await supabase
            .from("telegram_otps")
            .upsert(
                {
                    telegram_id: telegramId,
                    first_name: firstName || null,
                    code,
                    expires_at: expiresAt,
                },
                { onConflict: "telegram_id" }
            );

        if (upsertErr) {
            console.error("Supabase UPSERT error:", upsertErr);
            await sendMessage(
                chatId,
                "⚠️ Sorry, we're having trouble generating your code. Please try again shortly."
            );
            return;
        }

        // 3. Send the code to the user via Telegram
        await sendMessage(
            chatId,
            `👋 <b>Welcome to Daladan!</b>\n\n` +
            `Your login code is: <code>${code}</code>\n\n` +
            `This code expires in <b>5 minutes</b>.\n\n` +
            `Enter this code on the Daladan website to sign in.`
        );
    } catch (err) {
        console.error("handleStart error:", err);
        await sendMessage(
            chatId,
            "⚠️ Something went wrong. Please try again in a moment."
        );
    }
}

// ──────────────────────────────────────────────────────────────
// Vercel Serverless Handler
// ──────────────────────────────────────────────────────────────

export default async function handler(req, res) {
    // Only accept POST
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    try {
        const update = req.body;

        // Telegram sends various update types — we only care about messages
        const message = update?.message;
        if (!message) {
            return res.status(200).json({ ok: true });
        }

        const chatId = message.chat.id;
        const text = (message.text || "").trim();
        const telegramId = message.from.id;
        const firstName = message.from.first_name || "";

        if (text === "/start" || text.startsWith("/start ")) {
            await handleStart(chatId, telegramId, firstName);
        }

        // Always return 200 to Telegram — otherwise it retries
        return res.status(200).json({ ok: true });
    } catch (err) {
        console.error("Webhook handler error:", err);
        // Still 200 so Telegram doesn't keep retrying
        return res.status(200).json({ ok: true, error: "internal" });
    }
}
