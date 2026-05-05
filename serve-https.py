import http.server
import ssl


PORT = 8443
CERT_FILE = "certs/localhost.pem"
KEY_FILE = "certs/localhost-key.pem"


handler = http.server.SimpleHTTPRequestHandler
server = http.server.ThreadingHTTPServer(("0.0.0.0", PORT), handler)
context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
context.load_cert_chain(certfile=CERT_FILE, keyfile=KEY_FILE)
server.socket = context.wrap_socket(server.socket, server_side=True)

print(f"Serving HTTPS on https://0.0.0.0:{PORT}/")
server.serve_forever()
