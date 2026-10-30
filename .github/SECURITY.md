# Security Policy

## Reporting Security Issues

Do not open public issues containing secrets, private keys, real zone exports, credentials, or exploitable details.

Use GitHub private vulnerability reporting if it is enabled for this repository. If it is not available, open a minimal public issue asking for a private contact path without including sensitive details.

## Sensitive Data

Never commit:

- `.env` files
- database files or dumps
- BIND zone exports from production
- SSH private keys
- TSIG secrets
- backups
- screenshots showing real infrastructure details

## Supported Branch

Security fixes target the default branch unless a maintained release branch exists.

