"""Smoke tests para la API de SecureVault. Solo librería estándar (unittest).

Ejecutar desde backend/: python -m unittest discover -s tests -v
"""

import http.client
import json
import os
import sys
import tempfile
import threading
import time
import unittest
from urllib.parse import parse_qs, urlparse

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

os.environ["ADMIN_USERNAME"] = "admin.test"
os.environ["ADMIN_PASSWORD"] = "test-password-1234"
os.environ["SESSION_SECRET"] = "test-session-secret-which-is-at-least-32-bytes"

_db_file = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
_db_file.close()
os.environ["DB_PATH"] = _db_file.name

from app import main as app_main  # noqa: E402


class FakeVault:
    """Sustituto en memoria de vault_client para tests sin Vault real."""

    def __init__(self):
        self.store: dict[int, str] = {}

    def put_portal_password(self, portal_id, password):
        self.store[portal_id] = password

    def get_portal_password(self, portal_id):
        return self.store.get(portal_id)

    def delete_portal_password(self, portal_id):
        self.store.pop(portal_id, None)


class ApiSmokeTest(unittest.TestCase):
    server = None
    thread = None
    _known_secret = None

    @classmethod
    def setUpClass(cls):
        cls.fake_vault = FakeVault()
        app_main.vault_client.put_portal_password = cls.fake_vault.put_portal_password
        app_main.vault_client.get_portal_password = cls.fake_vault.get_portal_password
        app_main.vault_client.delete_portal_password = cls.fake_vault.delete_portal_password

        conn = app_main.get_db()
        app_main.init_db(conn)
        app_main.seed(conn)
        cls.server = app_main.ThreadingHTTPServer(("127.0.0.1", 0), app_main.Handler)
        cls.port = cls.server.server_address[1]
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        try:
            os.unlink(_db_file.name)
        except OSError:
            pass  # en Windows el archivo puede seguir bloqueado por hilos de sqlite

    def request(self, method, path, body=None, cookie=None, csrf=True):
        conn = http.client.HTTPConnection("127.0.0.1", self.port)
        headers = {"Content-Type": "application/json"}
        if csrf and method in ("POST", "PATCH", "DELETE"):
            headers[app_main.CSRF_HEADER] = app_main.CSRF_HEADER_VALUE
        if cookie:
            headers["Cookie"] = cookie
        payload = json.dumps(body).encode() if body is not None else None
        conn.request(method, path, body=payload, headers=headers)
        resp = conn.getresponse()
        data = resp.read()
        parsed = json.loads(data) if data else None
        set_cookie = resp.getheader("Set-Cookie")
        conn.close()
        return resp.status, parsed, set_cookie

    def login(self):
        status, payload, _ = self.request(
            "POST", "/api/auth/login", {"username": "admin.test", "password": "test-password-1234"}
        )
        self.assertEqual(status, 200, payload)
        self.assertTrue(payload.get("mfaSetupRequired") or payload.get("mfaRequired"), payload)
        if "otpauthUrl" in payload:
            secret = parse_qs(urlparse(payload["otpauthUrl"]).query)["secret"][0]
            type(self)._known_secret = secret
        else:
            secret = type(self)._known_secret
        code = app_main.totp_code_at(secret, int(time.time()) // app_main.TOTP_STEP)
        status, confirmed, set_cookie = self.request(
            "POST", "/api/auth/mfa/confirm", {"pendingToken": payload["pendingToken"], "code": code}
        )
        self.assertEqual(status, 200, confirmed)
        cookie = set_cookie.split(";", 1)[0]
        return cookie

    def reauth(self, cookie, action="reveal"):
        code = app_main.totp_code_at(type(self)._known_secret, int(time.time()) // app_main.TOTP_STEP)
        status, payload, _ = self.request("POST", "/api/auth/mfa/reauth", {"code": code, "action": action}, cookie=cookie)
        self.assertEqual(status, 200, payload)

    def test_health(self):
        status, payload, _ = self.request("GET", "/health")
        self.assertEqual(status, 200)
        self.assertEqual(payload["status"], "ok")

    def test_me_requires_session(self):
        status, _, _ = self.request("GET", "/api/auth/me")
        self.assertEqual(status, 401)

    def test_login_wrong_password(self):
        status, payload, _ = self.request(
            "POST", "/api/auth/login", {"username": "admin.test", "password": "wrong"}
        )
        self.assertEqual(status, 401)

    def test_login_and_me(self):
        cookie = self.login()
        status, payload, _ = self.request("GET", "/api/auth/me", cookie=cookie)
        self.assertEqual(status, 200)
        self.assertEqual(payload["username"], "admin.test")

    def test_post_without_csrf_header_rejected(self):
        cookie = self.login()
        status, payload, _ = self.request(
            "POST", "/api/portals/1/open", cookie=cookie, csrf=False
        )
        self.assertEqual(status, 403)

    def test_list_and_create_portal(self):
        cookie = self.login()
        status, payload, _ = self.request("GET", "/api/portals", cookie=cookie)
        self.assertEqual(status, 200)
        self.assertGreaterEqual(len(payload), 3)

        status, payload, _ = self.request(
            "POST",
            "/api/portals",
            {"name": "Test Portal", "category": "Aplicación", "url": "https://demo.local/x", "username": "u"},
            cookie=cookie,
        )
        self.assertEqual(status, 201, payload)
        self.assertEqual(payload["name"], "Test Portal")

    def test_create_portal_rejects_javascript_url(self):
        cookie = self.login()
        status, payload, _ = self.request(
            "POST",
            "/api/portals",
            {"name": "Malo", "category": "Aplicación", "url": "javascript:alert(1)", "username": "u"},
            cookie=cookie,
        )
        self.assertEqual(status, 422)

    def test_update_and_delete_portal(self):
        cookie = self.login()
        status, created, _ = self.request(
            "POST",
            "/api/portals",
            {"name": "Editable", "category": "Aplicación", "url": "https://demo.local/e", "username": "u"},
            cookie=cookie,
        )
        self.assertEqual(status, 201, created)
        portal_id = created["id"]

        status, updated, _ = self.request(
            "PATCH",
            f"/api/portals/{portal_id}",
            {"name": "Editado", "category": "Aplicación", "url": "https://demo.local/e2", "username": "u2", "status": "Inactivo"},
            cookie=cookie,
        )
        self.assertEqual(status, 200, updated)
        self.assertEqual(updated["name"], "Editado")
        self.assertEqual(updated["status"], "Inactivo")

        status, payload, _ = self.request("DELETE", f"/api/portals/{portal_id}", cookie=cookie)
        self.assertEqual(status, 200, payload)

        status, payload, _ = self.request("GET", "/api/portals", cookie=cookie)
        self.assertFalse(any(p["id"] == portal_id for p in payload))

    def test_update_nonexistent_portal_404(self):
        cookie = self.login()
        status, payload, _ = self.request(
            "PATCH",
            "/api/portals/999999",
            {"name": "X", "category": "Aplicación", "url": "https://demo.local/x", "username": "u"},
            cookie=cookie,
        )
        self.assertEqual(status, 404)

    def test_create_and_reveal_portal_password(self):
        cookie = self.login()
        status, created, _ = self.request(
            "POST",
            "/api/portals",
            {"name": "Con Clave", "category": "Aplicación", "url": "https://demo.local/k", "username": "u", "password": "MiClaveReal123"},
            cookie=cookie,
        )
        self.assertEqual(status, 201, created)
        self.assertTrue(created["hasPassword"])
        # el listado nunca debe incluir la contraseña ni el cifrado
        self.assertNotIn("password", created)
        self.assertNotIn("password_encrypted", created)

        status, denied, _ = self.request(
            "POST", f"/api/portals/{created['id']}/reveal-password", cookie=cookie
        )
        self.assertEqual(status, 403, denied)
        self.reauth(cookie)
        status, revealed, _ = self.request("POST", f"/api/portals/{created['id']}/reveal-password", cookie=cookie)
        self.assertEqual(status, 200, revealed)
        self.assertEqual(revealed["password"], "MiClaveReal123")
        status, denied_again, _ = self.request("POST", f"/api/portals/{created['id']}/reveal-password", cookie=cookie)
        self.assertEqual(status, 403, denied_again)

    def test_reveal_password_without_password_404(self):
        cookie = self.login()
        status, created, _ = self.request(
            "POST",
            "/api/portals",
            {"name": "Sin Clave", "category": "Aplicación", "url": "https://demo.local/n", "username": "u"},
            cookie=cookie,
        )
        self.assertEqual(status, 201, created)
        self.assertFalse(created["hasPassword"])
        self.reauth(cookie)
        status, payload, _ = self.request(
            "POST", f"/api/portals/{created['id']}/reveal-password", cookie=cookie
        )
        self.assertEqual(status, 404)

    def test_mfa_wrong_code_rejected(self):
        status, payload, _ = self.request(
            "POST", "/api/auth/login", {"username": "admin.test", "password": "test-password-1234"}
        )
        self.assertEqual(status, 200, payload)
        status, err, _ = self.request(
            "POST", "/api/auth/mfa/confirm", {"pendingToken": payload["pendingToken"], "code": "000000"}
        )
        self.assertEqual(status, 401, err)

    def test_settings_logo_roundtrip(self):
        cookie = self.login()
        status, settings, _ = self.request("GET", "/api/settings")
        self.assertEqual(status, 200)
        self.assertIsNone(settings["logoDataUrl"])

        tiny_png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
        status, updated, _ = self.request("POST", "/api/settings/logo", {"dataUrl": tiny_png}, cookie=cookie)
        self.assertEqual(status, 200, updated)

        status, settings, _ = self.request("GET", "/api/settings")
        self.assertEqual(settings["logoDataUrl"], tiny_png)

    def test_settings_logo_rejects_bad_data(self):
        cookie = self.login()
        status, payload, _ = self.request("POST", "/api/settings/logo", {"dataUrl": "not-an-image"}, cookie=cookie)
        self.assertEqual(status, 422, payload)

    def test_reset_mfa(self):
        cookie = self.login()
        status, users, _ = self.request("GET", "/api/users", cookie=cookie)
        admin_id = users[0]["id"]
        status, payload, _ = self.request("POST", f"/api/users/{admin_id}/reset-mfa", cookie=cookie)
        self.assertEqual(status, 200, payload)
        status, users_after, _ = self.request("GET", "/api/users", cookie=cookie)
        self.assertEqual(status, 401)
        # el próximo login vuelve a pedir configurar MFA desde cero
        status, relog, _ = self.request(
            "POST", "/api/auth/login", {"username": "admin.test", "password": "test-password-1234"}
        )
        self.assertTrue(relog.get("mfaSetupRequired"))

    def test_activity_and_users(self):
        cookie = self.login()
        status, payload, _ = self.request("GET", "/api/activity", cookie=cookie)
        self.assertEqual(status, 200)
        self.assertTrue(any(log["type"] == "auth" for log in payload))

        status, payload, _ = self.request("GET", "/api/users", cookie=cookie)
        self.assertEqual(status, 200)
        self.assertEqual(payload[0]["username"], "admin.test")

    def test_logout_clears_cookie(self):
        cookie = self.login()
        status, _, set_cookie = self.request("POST", "/api/auth/logout", cookie=cookie)
        self.assertEqual(status, 200)
        self.assertIn("Max-Age=0", set_cookie)
        cleared_cookie = set_cookie.split(";", 1)[0]
        status, _, _ = self.request("GET", "/api/auth/me", cookie=cleared_cookie)
        self.assertEqual(status, 401)
        status, _, _ = self.request("GET", "/api/auth/me", cookie=cookie)
        self.assertEqual(status, 401)

    def test_viewer_cannot_reveal_password(self):
        cookie = self.login()
        conn = app_main.get_db()
        conn.execute(
            "INSERT INTO users (username, display_name, password_hash, role, is_active, auth_method) VALUES (?,?,?,?,?,?)",
            ("viewer.test", "Viewer", app_main.password_hash("viewer-password-1234"), "Visor", 1, "Local"),
        )
        conn.commit()
        status, created, _ = self.request(
            "POST", "/api/portals",
            {"name": "Solo operadores", "category": "Aplicación", "url": "https://demo.local/secret", "username": "u", "password": "MiClaveReal123"},
            cookie=cookie,
        )
        self.assertEqual(status, 201, created)
        viewer = app_main.make_token(conn.execute("SELECT id FROM users WHERE username = ?", ("viewer.test",)).fetchone()["id"])
        viewer_cookie = f"{app_main.COOKIE}={viewer}"
        status, _, _ = self.request("POST", f"/api/portals/{created['id']}/reveal-password", cookie=viewer_cookie)
        self.assertEqual(status, 403)


if __name__ == "__main__":
    unittest.main()
