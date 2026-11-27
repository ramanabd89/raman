# RamanPhone — نسخة PHP + MySQL (لـ Hostinger وأي استضافة PHP)

نفس المتجر ولوحة الإدارة بالضبط، بس السيرفر مكتوب بـ **PHP صافي + MySQL** بدون Composer وبدون أي مكتبات خارجية.
الواجهة (`public/`) مشتركة مع نسخة Node، فأي تعديل على الواجهة يطلع بالنسختين.

## المتطلبات
- PHP **8.1** أو أحدث، فيه: `pdo_mysql`، `gd`، `curl`، `mbstring` (كلها موجودة بـ Hostinger)
- MySQL 8 أو MariaDB 10.3+
- Apache أو LiteSpeed (يقرأ `.htaccess`)

## التنصيب على Hostinger (10 دقايق)
1. **سوّي قاعدة بيانات:** hPanel ← **Databases ← MySQL Databases** ← اكتب اسم قاعدة بيانات + مستخدم + كلمة سر ← **Create**. احفظ الأسماء الثلاثة.
2. **ارفع الملفات:** hPanel ← **Files ← File Manager** ← ادخل `public_html` ← امسح أي `index.html` قديم ← **Upload** ← ارفع `ramanphone-php.zip` ← كليك يمين ← **Extract** ← انقل **محتويات** مجلد `ramanphone` إلى `public_html` مباشرة (لازم يكون `public_html/index.php` موجود).
3. **نصّب:** افتح `https://دومينك/install.php` ← عبّي معلومات قاعدة البيانات ورقمك وكلمة سر قوية ← **نصّب المتجر**.
4. **امسح `install.php`** من File Manager (هو يقفل نفسه، بس الأفضل تمسحه).
5. hPanel ← **Security ← SSL** ← فعّل الشهادة و **Force HTTPS**.
6. ادخل لوحة الإدارة من الرابط السري الي اخترته بالتنصيب، وفعّل **التحقق بخطوتين**.

## الإعدادات (`config.php`)
التنصيب يكتب `config.php` بنفسه. تكدر تعدله من File Manager:
- `admin_path` — رابط لوحة الإدارة السري
- `public_url` — رابط موقعك (مثل `https://www.ramanphone.com`)
- `sms_provider` — `console` (تجربة)، `whatsapp` أو `twilio` + مفاتيحها
- `telegram_bot_token` و `telegram_chat_id` — إشعارات الطلبات
- `trust_proxy` — خليها `true` إذا الدومين يمر من Cloudflare بالغيمة البرتقالية

`config.php` و `app/` و `data/` محمية من الزوار بـ `.htaccess`.

## الصور والنسخ الاحتياطي
- الصور تنحفظ بـ `uploads/` (تتصغر لـ 1400px وتتحول WebP وتنشال منها معلومات GPS).
- نسخة احتياطية من قاعدة البيانات تنكتب كل يوم بـ `data/backups/` (آخر 14 يوم)، وتنزلها من لوحة الإدارة ← الأمان والنسخ.
- Hostinger هم ياخذ نسخ احتياطية تلقائية (hPanel ← Files ← Backups).

## للمطورين
```bash
bash php/build.sh                 # يبني php/dist/ramanphone-php.zip (الواجهة من public/ + السيرفر من php/src/)
DB_USER=root bash php/tools/test.sh   # نفس فحوصات test/api.test.js على نسخة PHP بقاعدة بيانات تجريبية
node php/tools/export-schema.js <store.db> <uploads>   # يحدّث schema.sql و seed.sql من قاعدة بيانات Node جديدة
php -S localhost:8080 -t php/dist/ramanphone php/tools/dev-router.php   # تشغيل محلي
```
الملفات: `php/src/index.php` (الموجّه)، `php/src/app/lib/` (الأساسيات، البحث، الخدمات)، `php/src/app/routes/` (الـ API)، `php/src/install.php`.
