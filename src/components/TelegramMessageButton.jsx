import React from 'react';

/**
 * "Message on Telegram" button for user profile pages.
 *
 * @param {{ telegramUsername: string|null, telegramPhone: string|null }} props
 */
export default function TelegramMessageButton({ telegramUsername, telegramPhone }) {
    // Nothing to link to → render nothing
    if (!telegramUsername && !telegramPhone) return null;

    // Prefer username, fall back to phone
    const href = telegramUsername
        ? `https://t.me/${telegramUsername}`
        : `https://t.me/${telegramPhone}`;

    return (
        <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="
                inline-flex items-center justify-center gap-2
                px-5 py-2.5 rounded-xl
                text-white font-semibold text-sm
                shadow-md hover:shadow-lg
                transform hover:-translate-y-0.5
                transition-all duration-200
                focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#2AABEE]
                active:scale-[0.97]
                w-full sm:w-auto
            "
            style={{ backgroundColor: '#2AABEE' }}
            aria-label="Message on Telegram"
        >
            {/* Official Telegram paper-plane SVG */}
            <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="w-5 h-5 shrink-0"
                aria-hidden="true"
            >
                <path d="M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3 3.64 12c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71L12.6 16.3l-1.99 1.93c-.23.23-.42.42-.83.42z" />
            </svg>
            Message on Telegram
        </a>
    );
}
