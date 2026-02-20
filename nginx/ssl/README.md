# SSL Certificates

Place your SSL certificates here:
- cert.pem — Full chain certificate
- key.pem — Private key

For local development, generate self-signed certs:
  openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout key.pem -out cert.pem \
    -subj "/CN=localhost"

For production, use Let's Encrypt with certbot.
