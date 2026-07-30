from __future__ import annotations

from slowapi import Limiter
from slowapi.util import get_remote_address

# IP-based, in-memory (per-process) rate limiting on public/auth endpoints — registration, login,
# password reset. In-memory is an honest v1 given this app runs as short-lived Vercel serverless
# functions rather than one long-running process: limits are per-instance, not globally shared
# across every concurrent function invocation. That's still a real improvement over the previous
# "no limiting at all" state (registration in particular had zero throttling), and swapping the
# storage backend to something shared (e.g. Redis via `storage_uri=`) is a config-only change
# later if abuse patterns show the per-instance limit isn't enough.
limiter = Limiter(key_func=get_remote_address)
