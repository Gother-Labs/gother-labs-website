from __future__ import annotations

from functools import partial
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


ROOT = Path(__file__).resolve().parent
NOT_FOUND = ROOT / "404.html"


class Custom404Handler(SimpleHTTPRequestHandler):
    def send_error(self, code: int, message: str | None = None, explain: str | None = None) -> None:
        if code != HTTPStatus.NOT_FOUND or not NOT_FOUND.exists():
            super().send_error(code, message, explain)
            return

        body = NOT_FOUND.read_bytes()
        self.send_response(HTTPStatus.NOT_FOUND)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()

        if self.command != "HEAD":
            self.wfile.write(body)


def main() -> None:
    server = ThreadingHTTPServer(
        ("127.0.0.1", 4173),
        partial(Custom404Handler, directory=str(ROOT)),
    )
    print("Serving custom 404 preview at http://127.0.0.1:4173")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
