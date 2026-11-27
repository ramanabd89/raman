<?php
// RamanPhone settings. install.php writes config.php for you; you can also copy this file to config.php and fill it in.
// This file is never served to visitors (.htaccess blocks it).
return [
    // MySQL database (Hostinger → Databases → MySQL Databases)
    'db_host' => 'localhost',
    'db_name' => '',
    'db_user' => '',
    'db_pass' => '',

    // Secret address of the admin panel, e.g. '/my-panel-2026' (default '/admin')
    'admin_path' => '/admin',
    // Your site address, e.g. 'https://www.ramanphone.com' (used in links, previews and Telegram messages)
    'public_url' => '',

    // Verification codes: 'console' (codes only in the error log — testing), 'whatsapp' or 'twilio'
    'sms_provider' => 'console',
    'whatsapp_token' => '',
    'whatsapp_phone_number_id' => '',
    'whatsapp_template' => '',
    'whatsapp_template_lang' => 'en',
    'twilio_account_sid' => '',
    'twilio_auth_token' => '',
    'twilio_from' => '',
    'twilio_messaging_service_sid' => '',
    'otp_allowed_prefixes' => '+964',

    // Order / repair notifications to Telegram (from @BotFather), optional
    'telegram_bot_token' => '',
    'telegram_chat_id' => '',

    // Behind Cloudflare's orange-cloud proxy: true, so rate limits see the visitor's real IP
    'trust_proxy' => false,
    'backup_keep' => 14,
    'env' => 'production',
];
