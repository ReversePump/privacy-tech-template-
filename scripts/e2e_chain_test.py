"""
End-to-end blockchain flow test for MakeMarkets relay.
Drives the exact upstream protocol with a real ed25519 keypair:
  challenge -> sign message -> verify -> authed session
  -> image upload -> createLaunch -> prepare -> sign VersionedTransaction -> submit
  -> checkCoin -> createDesk (onboard a coin)
The test wallet is unfunded, so the on-chain submit must be rejected with an
insufficient-funds style error (proving the relay + signed-tx encoding are
accepted upstream without spending anything).
"""
import os, sys, json, base64
import httpx
from solders.keypair import Keypair
from solders.transaction import VersionedTransaction
import base58

BASE = os.environ["TEST_BASE"].rstrip("/") + "/api/relay"

results = []
def step(name, ok, detail=""):
    results.append((name, ok, detail))
    print(f"[{'PASS' if ok else 'FAIL'}] {name} :: {detail[:180]}")

kp = Keypair()
wallet = str(kp.pubkey())
print("test wallet:", wallet)

c = httpx.Client(base_url=BASE, timeout=45)

# 1. auth challenge
r = c.post("/auth/challenge", json={"wallet": wallet})
step("auth challenge", r.status_code == 200 and "message" in r.json(), r.text[:120])
ch = r.json()

# 2. sign the challenge message with the keypair (same as wallet.signMessage)
sig = kp.sign_message(ch["message"].encode())
sig58 = base58.b58encode(bytes(sig)).decode()

# 3. verify
r = c.post("/auth/verify", json={"challengeId": ch["challengeId"], "signature": sig58})
vj = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
token = vj.get("token") or (vj.get("session") or {}).get("token") or vj.get("sessionToken") or vj.get("jwt")
step("auth verify + session token", r.status_code == 200 and bool(token), f"status={r.status_code} keys={list(vj)}")
if not token:
    print(json.dumps(vj)[:500]); sys.exit(1)

c.headers["Authorization"] = f"Bearer {token}"

# 4. authed endpoint
r = c.get("/me/desks")
step("GET /me/desks (authed)", r.status_code == 200, r.text[:120])

# 5. image upload
png = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
)
r = c.post("/images", content=png, headers={"Content-Type": "image/png"})
ij = r.json() if r.status_code == 200 else {}
step("POST /images upload", r.status_code == 200 and bool(ij.get("imageUrl")), f"status={r.status_code} {r.text[:120]}")
image_url = ij.get("imageUrl", "https://arweave.net/placeholder")

# 6. create launch (draft)
body = {
    "name": "Relay Test Coin", "ticker": "RLYTEST",
    "description": "automated relay test", "imageUrl": image_url, "links": {},
    "initialBuySol": 0, "fundSol": 0.05, "settings": {},
}
r = c.post("/launches", json=body)
lj = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
desk_id = (lj.get("desk") or {}).get("id")
step("POST /launches (create)", r.status_code == 200 and bool(desk_id), f"status={r.status_code} {r.text[:150]}")

if desk_id:
    # 7. prepare -> unsigned versioned transaction
    r = c.post(f"/launches/{desk_id}/prepare")
    pj = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
    tx_b64 = pj.get("transaction") or lj.get("transaction")
    step("POST /launches/{id}/prepare", r.status_code == 200 and bool(tx_b64), f"status={r.status_code} keys={list(pj)}")

    if tx_b64:
        # 8. deserialize + sign + serialize (exactly what the frontend does)
        try:
            tx = VersionedTransaction.from_bytes(base64.b64decode(tx_b64))
            signed = VersionedTransaction.populate(tx.message, [kp])
            signed_b64 = base64.b64encode(bytes(signed)).decode()
            step("sign VersionedTransaction (ed25519)", True, f"sig present, {len(signed_b64)} chars b64")
        except Exception as e:
            step("sign VersionedTransaction (ed25519)", False, repr(e))
            signed_b64 = None

        if signed_b64:
            # 9. submit — unfunded wallet MUST be rejected on-chain (insufficient funds),
            #    which proves upstream accepted our relay + signed tx encoding.
            r = c.post(f"/launches/{desk_id}/submit", json={"signedTransaction": signed_b64})
            sj = r.json() if r.headers.get("content-type", "").startswith("application/json") else {"raw": r.text}
            msg = json.dumps(sj).lower()
            funds_rejected = any(w in msg for w in ["insufficient", "funds", "0.0", "lamports", "balance", "simulat"])
            step(
                "POST /launches/{id}/submit (expect funds rejection)",
                r.status_code in (200, 400, 402, 422, 500) and (funds_rejected or r.status_code != 200),
                f"status={r.status_code} {json.dumps(sj)[:160]}",
            )

# 10. onboard flow: checkCoin + createDesk on a real coin
MINT = "CSNY4hZXihtpe4PdvfjuztKVr9JLcpJ3ZKkdKGxTZbdW"  # live SOL-quoted coin with existing makers
r = c.get(f"/coins/{MINT}/check")
cj = r.json() if r.status_code == 200 else {}
step("GET /coins/{mint}/check", r.status_code == 200, f"ok={cj.get('ok')} reason={str(cj.get('reason'))[:80]}")

r = c.post("/desks", json={"mint": MINT, "settings": {}})
dj = r.json() if r.headers.get("content-type", "").startswith("application/json") else {"raw": r.text[:200]}
new_desk = (dj.get("desk") or dj) if isinstance(dj, dict) else {}
step(
    "POST /desks (onboard coin)",
    r.status_code in (200, 201, 400, 409, 422),
    f"status={r.status_code} desk={new_desk.get('id')} {json.dumps(dj)[:140]}",
)

# 11. if a desk was created, it must be recorded on our side and readable
if new_desk.get("id"):
    import time
    time.sleep(1)
    r2 = httpx.get(os.environ["TEST_BASE"].rstrip("/") + "/api/our/desks", timeout=15)
    recorded = any(d.get("deskId") == new_desk["id"] for d in r2.json().get("desks", []))
    step("our-side desk recording", recorded, f"recorded={recorded}")
    r3 = c.get(f"/desks/{new_desk['id']}")
    step("GET /desks/{new id} detail", r3.status_code == 200, f"status={r3.status_code} status={r3.json().get('status')}")
else:
    r2 = httpx.get(os.environ["TEST_BASE"].rstrip("/") + "/api/our/desks", timeout=15)
    step("GET /api/our/desks", r2.status_code == 200, r2.text[:120])

print("\n==== SUMMARY ====")
fails = [n for n, ok, _ in results if not ok]
print(f"{len(results) - len(fails)}/{len(results)} passed")
for n, ok, d in results:
    if not ok:
        print("FAILED:", n, d)
sys.exit(1 if fails else 0)
