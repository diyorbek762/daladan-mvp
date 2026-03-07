/**
 * Daladan — Telegram Webhook (Vercel Serverless Function)
 * ========================================================
 * POST /api/webhook/telegram
 *
 * Receives updates pushed by the Telegram Bot API, handles `/start`,
 * links telegram_id in public.users, and replies via the Telegram HTTP API.
 *
 * Environment variables required (set in Vercel Dashboard → Settings → Env Vars):
 *   TELEGRAM_BOT_TOKEN
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY   (service role, NOT anon — bypasses RLS)
 */

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
// /start handler
// ──────────────────────────────────────────────────────────────

async function handleStart(chatId, telegramId, firstName) {
    try {
        // 1. Look up the user by telegram_id
        const { data: user, error: selectErr } = await supabase
            .from("users")
            .select("id, full_name, is_bot_started")
            .eq("telegram_id", telegramId)
            .maybeSingle();

        if (selectErr) {
            console.error("Supabase SELECT error:", selectErr);
            await sendMessage(
                chatId,
                "⚠️ Sorry, we're having trouble reaching the database. Please try again shortly."
            );
            return;
        }

        // 2a. User NOT found
        if (!user) {
            await sendMessage(
                chatId,
                `👋 Welcome, ${firstName || "there"}!\n\n` +
                "We don't recognize this account yet. " +
                "Please log in to the <b>Daladan</b> website first to link your Telegram.\n\n" +
                "Once linked, come back and press /start again."
            );
            return;
        }

        // 2b. User found → flip is_bot_started
        if (!user.is_bot_started) {
            const { error: updateErr } = await supabase
                .from("users")
                .update({ is_bot_started: true })
                .eq("telegram_id", telegramId);

            if (updateErr) {
                console.error("Supabase UPDATE error:", updateErr);
                // Non-fatal — still greet the user
            }
        }

        const name = user.full_name || firstName || "there";
        await sendMessage(
            chatId,
            `✅ Welcome to <b>Daladan</b>, ${name}!\n\n` +
            "Your account is successfully linked. " +
            "You will receive your logistics and harvest updates here."
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
