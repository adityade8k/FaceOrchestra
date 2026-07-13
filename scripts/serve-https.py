import functools
import http.server
import ssl
from pathlib import Path


PORT = 8443
ROOT_DIR = Path(__file__).resolve().parents[1]
CERT_FILE = ROOT_DIR / "certs/localhost.pem"
KEY_FILE = ROOT_DIR / "certs/localhost-key.pem"


handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=ROOT_DIR)
server = http.server.ThreadingHTTPServer(("0.0.0.0", PORT), handler)
context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
context.load_cert_chain(certfile=CERT_FILE, keyfile=KEY_FILE)
server.socket = context.wrap_socket(server.socket, server_side=True)

print(f"Serving HTTPS on https://0.0.0.0:{PORT}/")
server.serve_forever()
