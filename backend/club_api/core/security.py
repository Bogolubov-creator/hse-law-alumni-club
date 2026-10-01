import hashlib
import hmac
import ipaddress
import time
from collections import defaultdict, deque

PROXY_NETWORKS = tuple(ipaddress.ip_network(value) for value in ("10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"))
YOOKASSA_NETWORKS = tuple(
    ipaddress.ip_network(value)
    for value in (
        "185.71.76.0/27",
        "185.71.77.0/27",
        "77.75.153.0/25",
        "77.75.154.128/25",
        "77.75.156.11/32",
        "77.75.156.35/32",
    )
)


def ipv4(address):
    try:
        value = ipaddress.ip_address(address.removeprefix("::ffff:"))
        return value if value.version == 4 else None
    except ValueError:
        return None


def trust_proxy(address, hop=0):
    value = ipv4(address)
    return hop == 0 and value is not None and any(value in network for network in PROXY_NETWORKS)


def client_ip(request):
    peer = request.META.get("REMOTE_ADDR", "")
    if trust_proxy(peer):
        forwarded = request.headers.get("x-forwarded-for", "").split(",")[-1].strip()
        try:
            return str(ipaddress.ip_address(forwarded))
        except ValueError:
            pass
    return peer


def yookassa_ip(address):
    value = ipv4(address)
    return value is not None and any(value in network for network in YOOKASSA_NETWORKS)


def constant_equal(supplied, expected):
    return bool(supplied and expected) and hmac.compare_digest(
        hashlib.sha256(supplied.encode()).digest(), hashlib.sha256(expected.encode()).digest()
    )


class LoginAttempts:
    WINDOW_SECONDS = 15 * 60

    def __init__(self, clock=time.monotonic):
        self.clock = clock
        self.email = {}
        self.ip = {}

    def cleanup(self):
        now = self.clock()
        for entries in (self.email, self.ip):
            for key, (_, first, until) in list(entries.items()):
                if until < now and now - first > self.WINDOW_SECONDS:
                    del entries[key]

    def locked(self, email, ip):
        self.cleanup()
        now = self.clock()
        return any(
            entries.get(key, (0, 0, 0))[2] > now for entries, key in ((self.email, email.lower()), (self.ip, ip))
        )

    def fail(self, email, ip):
        now = self.clock()
        for entries, key, maximum, duration in ((self.email, email.lower(), 10, 900), (self.ip, ip, 30, 1800)):
            fails, first, until = entries.get(key, (0, now, 0))
            if now - first > self.WINDOW_SECONDS:
                fails, first, until = 0, now, 0
            fails += 1
            entries[key] = fails, first, now + duration if fails >= maximum else until

    def success(self, email, ip):
        self.email.pop(email.lower(), None)
        self.ip.pop(ip, None)


class RateLimits:
    def __init__(self, clock=time.monotonic):
        self.clock = clock
        self.entries = defaultdict(deque)
        self.last_cleanup = clock()

    def check(self, key, maximum, window=60):
        now = self.clock()
        if now - self.last_cleanup >= 60:
            for item, attempts in list(self.entries.items()):
                if not attempts or now - attempts[-1] >= 600:
                    del self.entries[item]
            self.last_cleanup = now
        attempts = self.entries[key]
        while attempts and attempts[0] <= now - window:
            attempts.popleft()
        allowed = len(attempts) < maximum
        if len(attempts) < maximum:
            attempts.append(now)
        elif attempts:
            attempts[-1] = now
        return allowed
