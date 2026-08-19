#!/usr/bin/env python3
"""Print a fresh 256-bit hex secret for FAV_SALT (piped into wrangler secret put)."""
import secrets

print(secrets.token_hex(32))
