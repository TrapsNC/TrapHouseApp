# Owner order alerts

Owner-only alerts use SendGrid. No customer emails or texts are sent.

Before activation, confirm SendGrid accepts this store's transactional email use and verify the sender address or domain. Add the following server-only environment variables to Vercel (never use NEXT_PUBLIC prefixes):

- SENDGRID_API_KEY: a key with Mail Send permission only.
- ORDER_ALERT_FROM_EMAIL: the verified sender address.
- ORDER_ALERT_TO_EMAIL: traphousenc919@gmail.com.
- ENABLE_OWNER_ORDER_EMAILS: true only after configuration and a real inbox test.

Redeploy after changing environment variables. Keep ENABLE_ORDER_REQUESTS and NEXT_PUBLIC_ENABLE_ORDER_REQUESTS false during setup.

Each successfully created order with its ID attached triggers one send attempt. Rejected, duplicate and disabled requests do not send alerts. Alerts contain only the order number, fulfillment method, total, pending payment/ID notice and the admin dashboard link. No ID files, customer contact details or tracking tokens are included.

Sending is disabled by default. Missing configuration, provider rejection or a five-second timeout logs a generic error and does not fail an already saved order. SendGrid accepting a message is not proof of inbox delivery. This initial integration has no durable retry queue; check the admin dashboard for orders if an alert is missed.

After a synthetic alert reaches the owner's inbox, enable notifications for the store Gmail account on the owner's phone. Email delivery and phone notification settings must be verified separately before relying on alerts.
