---
name: NinzaSMS integration
description: How NinzaSMS SMS and WhatsApp OTP provider is integrated
---
Provider keys: `ninzasms` (SMS route) and `ninzasms_whatsapp` (WhatsApp route).
Endpoint: POST https://ninzasms.in.net/auth/send_sms
Auth: Authorization header = apiKey from otp_providers table
Body: {sender_id, numbers (10-digit, no 91 prefix), rout: "sms"|"waninza", variables_values: code}
Response: {status: "success", message_id}

Admin setup: Admin → OTP Providers → Add → select "NinzaSMS (SMS — Indian)" or "NinzaSMS WhatsApp"
Fields: API Key = full Authorization string, Sender ID = numeric user ID (e.g. 15716)

**Why:** Customer uses NinzaSMS for Indian OTP delivery; added as first-class provider.
**How to apply:** Both SMS and WhatsApp use same API key + sender_id; rout field is auto-set by provider name.
