import functools
import http.server
import ssl
import argparse
from pathlib import Path


parser = argparse.ArgumentParser()
parser.add_argument('--http', action='store_true', help='Desktop-only HTTP preview on loopback')
args = parser.parse_args()
PORT = 5173 if args.http else 8443
ROOT_DIR = Path(__file__).resolve().parents[1]
CERT_FILE = ROOT_DIR / "certs/localhost.pem"
KEY_FILE = ROOT_DIR / "certs/localhost-key.pem"


class PublicFilesOnly(http.server.SimpleHTTPRequestHandler):
    def send_head(self):
        path = Path(self.translate_path(self.path)).resolve()
        try:
            relative = path.relative_to(ROOT_DIR)
        except ValueError:
            self.send_error(404)
            return None
        allowed = {'src', 'model', 'vendor', 'capture'}
        validation_script = len(relative.parts) == 2 and relative.parts[0] == 'scripts' and (relative.name.startswith('validate-') or relative.name == 'looper-playback-fixture.mjs') and relative.suffix == '.mjs'
        if relative.parts and relative.parts[0] not in allowed and str(relative) not in {'index.html', 'style.css'} and not validation_script:
            self.send_error(404)
            return None
        if any(part.startswith('.') for part in relative.parts) or path.suffix.lower() in {'.pem', '.key', '.p12', '.pfx'}:
            self.send_error(404)
            return None
        return super().send_head()

    def list_directory(self, path):
        self.send_error(404)
        return None


handler = functools.partial(PublicFilesOnly, directory=ROOT_DIR)
server = http.server.ThreadingHTTPServer(("127.0.0.1" if args.http else "0.0.0.0", PORT), handler)
if not args.http:
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.load_cert_chain(certfile=CERT_FILE, keyfile=KEY_FILE)
    server.socket = context.wrap_socket(server.socket, server_side=True)

print(f"Serving {'HTTP' if args.http else 'HTTPS'} on port {PORT}. Use npm run capture:serve for recording.")
server.serve_forever()
