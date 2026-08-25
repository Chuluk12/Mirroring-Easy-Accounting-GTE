import asyncio
import json
import os
import threading

try:
    import nats
except ImportError:
    nats = None


def _env_bool(name, default="0"):
    return os.getenv(name, default).strip().lower() in {"1", "true", "yes"}


class NATSPublisher:
    def __init__(self, url=None, user=None, password=None):
        self.url = url or os.getenv("NATS_URL", "nats://localhost:4222")
        self.user = user or os.getenv("NATS_USER", "").strip() or None
        self.password = password or os.getenv("NATS_PASSWORD", "").strip() or None
        self._nc = None
        self._loop = None
        self._thread = None
        self._lock = threading.Lock()
        self._closed = threading.Event()

    def _start(self):
        if nats is None:
            return False
        if self._thread is not None:
            return True
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()
        return True

    def _run(self):
        self._loop = asyncio.new_event_loop()
        asyncio.set_event_loop(self._loop)
        try:
            self._loop.run_until_complete(self._connect())
            self._loop.run_until_complete(self._wait_closed())
        except Exception as exc:
            self._loop.run_until_complete(self._on_error(exc))
        finally:
            try:
                self._loop.run_until_complete(self._disconnect())
            except Exception:
                pass
            self._loop.close()

    async def _connect(self):
        if self.user:
            self._nc = await nats.connect(
                self.url, user=self.user, password=self.password,
                allow_reconnect=True, max_reconnect_attempts=-1,
            )
        else:
            self._nc = await nats.connect(
                self.url, allow_reconnect=True, max_reconnect_attempts=-1,
            )

    async def _wait_closed(self):
        while not self._closed.is_set():
            await asyncio.sleep(0.5)

    async def _on_error(self, exc):
        pass

    async def _disconnect(self):
        if self._nc is not None:
            try:
                await self._nc.drain()
            except Exception:
                pass

    def publish(self, subject, payload):
        if nats is None:
            return False
        if not self._start():
            return False
        if self._loop is None or self._nc is None:
            return False
        try:
            asyncio.run_coroutine_threadsafe(
                self._publish(subject, payload), self._loop
            )
            return True
        except Exception:
            return False

    async def _publish(self, subject, payload):
        await self._nc.publish(subject, payload)

    def close(self):
        self._closed.set()
        if self._thread is not None:
            self._thread.join(timeout=5)
        self._thread = None


_publisher = None
_publisher_lock = threading.Lock()


def get_publisher():
    global _publisher
    if nats is None:
        return None
    with _publisher_lock:
        if _publisher is None:
            _publisher = NATSPublisher()
        return _publisher


def publish_json(subject, data):
    publisher = get_publisher()
    if publisher is None:
        return False
    payload = json.dumps(data, default=str).encode("utf-8")
    return publisher.publish(subject, payload)
