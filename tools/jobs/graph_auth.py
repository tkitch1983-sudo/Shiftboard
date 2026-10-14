#!/usr/bin/env python3
"""Sign in once to Tony's Outlook using delegated Microsoft Graph Mail.Read.

Do NOT paste codes or tokens into ChatGPT or source control.
Requires: pip install msal
Set GRAPH_CLIENT_ID and GRAPH_TENANT_ID to Entra App registration IDs.
Store GRAPH_TOKEN_CACHE only on a trusted, access-controlled machine.
"""
import argparse
import json
import os
from pathlib import Path
from urllib.request import Request, urlopen

SCOPES = ["Mail.Read", "User.Read"]
DEFAULT_CACHE = Path.home() / ".shiftboard-jobs-graph-token-cache.json"


class GraphAuth:
    def __init__(self, client_id, tenant_id, cache_path=None, allow_interactive=False,
                 expected_user="tony@neautoservices.com"):
        if not client_id or not tenant_id:
            raise ValueError("GRAPH_CLIENT_ID and GRAPH_TENANT_ID are required")
        try:
            import msal
        except ImportError as exc:
            raise RuntimeError("Install dependency: python -m pip install msal") from exc
        self.cache_path = Path(cache_path or os.environ.get("GRAPH_TOKEN_CACHE") or DEFAULT_CACHE)
        self.cache = msal.SerializableTokenCache()
        self.expected_user = expected_user.strip().lower()
        self.allow_interactive = allow_interactive
        if self.cache_path.exists():
            # Deny permissive files on POSIX; MSAL token caches contain refresh tokens.
            if os.name == "posix" and (self.cache_path.stat().st_mode & 0o077):
                raise ValueError("Token cache is accessible to other users; set chmod 600")
            self.cache.deserialize(self.cache_path.read_text(encoding="utf-8"))
        self.app = msal.PublicClientApplication(
            client_id=client_id,
            authority="https://login.microsoftonline.com/" + tenant_id,
            token_cache=self.cache,
        )

    def save(self):
        if not self.cache.has_state_changed:
            return
        self.cache_path.parent.mkdir(parents=True, exist_ok=True)
        # Restrict file permissions before writing sensitive serialized refresh tokens.
        fd = os.open(str(self.cache_path), os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as out:
                out.write(self.cache.serialize())
        finally:
            if os.name == "posix":
                os.chmod(self.cache_path, 0o600)

    def acquire(self):
        accounts = self.app.get_accounts()
        if len(accounts) > 1:
            raise RuntimeError("More than one cached Microsoft account; use a dedicated token cache")
        result = self.app.acquire_token_silent(SCOPES, account=accounts[0]) if accounts else None
        if not result and self.allow_interactive:
            flow = self.app.initiate_device_flow(scopes=SCOPES)
            if "user_code" not in flow:
                raise RuntimeError("Unable to start Microsoft sign-in")
            print(flow["message"], flush=True)
            result = self.app.acquire_token_by_device_flow(flow)
        if not result or "access_token" not in result:
            raise RuntimeError("Tony's Outlook must be authorised: run graph_auth.py --sign-in")
        self.save()
        return result["access_token"]

    def verify_owner(self):
        token = self.acquire()
        req = Request("https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName",
                      headers={"Authorization": "Bearer " + token})
        with urlopen(req, timeout=30) as response:
            identity = json.load(response)
        values = {str(identity.get(k) or "").strip().lower() for k in ("mail", "userPrincipalName")}
        if self.expected_user and self.expected_user not in values:
            raise RuntimeError("Wrong account signed in. Expected Tony's mailbox.")
        return identity


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--sign-in", action="store_true",
                   help="Allow a one-time sign-in using Microsoft's browser device-code flow")
    args = p.parse_args()
    auth = GraphAuth(
        os.environ.get("GRAPH_CLIENT_ID"), os.environ.get("GRAPH_TENANT_ID"),
        allow_interactive=args.sign_in,
        expected_user=os.environ.get("GRAPH_EXPECTED_USER", "tony@neautoservices.com"))
    identity = auth.verify_owner()
    print("Microsoft Graph read-only access ready for: " +
          str(identity.get("mail") or identity.get("userPrincipalName")))
    print("Token cache stored privately at: " + str(auth.cache_path))
    print("Do not send this cache file or any codes/tokens to ChatGPT.")


if __name__ == "__main__":
    main()
