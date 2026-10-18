"""
REAL on-chain round trip for the MakeMarkets mobile vault + native launch.
Uses the funded treasury wallet and the throwaway test wallet. No mocks.
  1. treasury -> test wallet funding transfer (real SOL)
  2. test wallet -> treasury deposit, recorded via /api/vault/deposit (backend verifies on-chain)
  3. /api/vault/balance reflects the deposit
  4. withdraw: signMessage proof -> treasury pays out 90% (real SOL back to test wallet)
  5. native launch: upload artwork -> metadata -> PumpPortal build -> dual-sign -> broadcast -> record
  6. cleanup: delist the test coin from /api/our/launches (coin itself stays on-chain)
"""
import os, sys, json, base64, time, asyncio
import httpx
import base58
from dotenv import load_dotenv
from solders.keypair import Keypair
from solders.pubkey import Pubkey
from solders.hash import Hash
from solders.system_program import transfer, TransferParams
from solders.message import Message
from solders.transaction import Transaction, VersionedTransaction

load_dotenv("/app/backend/.env")
BASE = None
for line in open("/app/frontend/.env"):
    if line.startswith("REACT_APP_BACKEND_URL="):
        BASE = line.strip().split("=", 1)[1]
BASE = BASE.rstrip("/")
RPC = os.environ["SOLANA_RPC"]

TREASURY = Keypair.from_base58_string(os.environ["TREASURY_PRIVATE_KEY"])
TEST = Keypair.from_bytes(bytes(json.load(open("/app/scripts/test_wallet.json"))))
TW = str(TEST.pubkey())
MINT_TAG = "VaultRoundtripTest11111111111111111111111111"

c = httpx.Client(timeout=60, headers={"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126 Safari/537.36"})

results = []
def step(name, ok, detail=""):
    results.append((name, ok))
    print(f"[{'PASS' if ok else 'FAIL'}] {name} :: {detail[:200]}", flush=True)

def rpc(method, params):
    d = c.post(RPC, json={"jsonrpc": "2.0", "id": 1, "method": method, "params": params}).json()
    if d.get("error"):
        raise RuntimeError(d["error"].get("message"))
    return d["result"]

def rpc_canonical(method, params):
    # canonical endpoint for reads that must not be stale (public RPCs cache aggressively)
    d = c.post("https://api.mainnet-beta.solana.com", json={"jsonrpc": "2.0", "id": 1, "method": method, "params": params}).json()
    if d.get("error"):
        raise RuntimeError(d["error"].get("message"))
    return d["result"]

def balance(addr):
    return rpc("getBalance", [addr])["value"] / 1e9

def send_sol(kp, to, lamports):
    last = None
    for _ in range(4):
        try:
            bh = rpc("getLatestBlockhash", [{"commitment": "finalized"}])["value"]["blockhash"]
            ix = transfer(TransferParams(from_pubkey=kp.pubkey(), to_pubkey=Pubkey.from_string(to), lamports=lamports))
            h = Hash.from_string(bh)
            tx = Transaction.new_unsigned(Message.new_with_blockhash([ix], kp.pubkey(), h))
            tx.sign([kp], h)
            return rpc("sendTransaction", [base64.b64encode(bytes(tx)).decode(), {"encoding": "base64"}])
        except Exception as e:
            last = e
            time.sleep(2)
    raise last

def confirm(sig):
    for _ in range(40):
        v = rpc("getSignatureStatuses", [[sig], {"searchTransactionHistory": True}])["value"][0]
        if v and v.get("confirmationStatus") in ("confirmed", "finalized"):
            return True, v.get("err")
        time.sleep(2)
    return False, "timeout"

print("treasury:", str(TREASURY.pubkey()), balance(str(TREASURY.pubkey())), "SOL")
print("test wallet:", TW, balance(TW), "SOL", flush=True)

# reset any previous run's vault records for this mint tag
async def reset_vault():
    from motor.motor_asyncio import AsyncIOMotorClient
    mc = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = mc[os.environ["DB_NAME"]]
    await db.vault_deposits.delete_many({"mint": MINT_TAG})
    await db.vault_withdrawals.delete_many({"mint": MINT_TAG})
asyncio.run(reset_vault())

# 1. fund the test wallet from the treasury (only if needed)
if balance(TW) < 0.015:
    sig1 = send_sol(TREASURY, TW, 10_000_000)
    ok, err = confirm(sig1)
    step("treasury funds test wallet (0.01 SOL)", ok and not err, sig1)
    time.sleep(2)
else:
    step("treasury funds test wallet", True, "already funded")

# 2. real deposit: test wallet -> treasury, then record via backend (on-chain verified)
sig2 = send_sol(TEST, str(TREASURY.pubkey()), 10_000_000)
ok, err = confirm(sig2)
step("deposit tx on chain (0.01 SOL)", ok and not err, sig2)
r = c.post(f"{BASE}/api/vault/deposit", json={"wallet": TW, "mint": MINT_TAG, "signature": sig2, "amountSol": 0.01})
step("backend verifies + records deposit", r.status_code == 200 and r.json().get("ok"), f"{r.status_code} {r.text[:100]}")
r = c.post(f"{BASE}/api/vault/deposit", json={"wallet": TW, "mint": MINT_TAG, "signature": sig2, "amountSol": 0.01})
step("replay deposit rejected", r.status_code == 409, f"{r.status_code}")

# 3. balance
r = c.get(f"{BASE}/api/vault/balance/{TW}?mint={MINT_TAG}")
step("balance shows 0.01", abs(r.json().get("balanceSol", 0) - 0.01) < 1e-6, r.text[:80])
r = c.get(f"{BASE}/api/vault/positions/{TW}")
step("positions list includes the mint", any(p.get("mint") == MINT_TAG for p in r.json().get("positions", [])), r.text[:120])

# 4. withdraw: wallet signature proof -> treasury pays 90%
ts = int(time.time() * 1000)
msg = f"MakeMarkets vault withdrawal\nwallet: {TW}\nmint: {MINT_TAG}\nts: {ts}".encode()
sig = base58.b58encode(bytes(TEST.sign_message(msg))).decode()
r = c.post(f"{BASE}/api/vault/withdraw", json={"wallet": TW, "mint": MINT_TAG, "ts": ts, "signature": sig})
wj = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
step("withdraw accepted + broadcast", r.status_code == 200 and wj.get("ok"), f"{r.status_code} {r.text[:150]}")
if wj.get("signature"):
    ok, err = confirm(wj["signature"])
    # verify the payout delta from the transaction itself (balance reads lag on public RPCs)
    try:
        txd = rpc_canonical("getTransaction", [wj["signature"], {"encoding": "json", "maxSupportedTransactionVersion": 0}])
        keys = txd["transaction"]["message"]["accountKeys"]
        i = keys.index(TW)
        got = (int(txd["meta"]["postBalances"][i]) - int(txd["meta"]["preBalances"][i])) / 1e9
    except Exception:
        got = 0
    step("90% landed on chain (0.009 SOL)", ok and not err and abs(got - 0.009) < 0.0005, f"tx delta {got:+.5f} SOL, sig {wj['signature'][:20]}…")
r = c.get(f"{BASE}/api/vault/balance/{TW}?mint={MINT_TAG}")
step("vault balance back to 0", abs(r.json().get("balanceSol", -1)) < 1e-9, r.text[:80])

# 5. native launch through the site's own API (mobile path) — real mint on mainnet
if balance(TW) > 0.02:
    png = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==")
    up = c.post(f"{BASE}/api/uploads/image", content=png, headers={"Content-Type": "image/png"})
    upj = up.json()
    step("artwork hosted", up.status_code == 200 and "preview.emergentagent.com" in upj.get("url", ""), upj.get("url", "")[:90])
    meta = c.post(f"{BASE}/api/launch/metadata", json={"name": "MM System Check", "symbol": "MMCHK", "description": "automated on-chain verification", "imageId": upj["id"], "links": {}}).json()
    mint_kp = Keypair()
    built = c.post(f"{BASE}/api/launch/build", json={
        "publicKey": TW, "mint": str(mint_kp.pubkey()),
        "name": "MM System Check", "symbol": "MMCHK", "uri": meta["uri"], "amountSol": 0,
    })
    bj = built.json() if built.headers.get("content-type", "").startswith("application/json") else {}
    step("unsigned create tx built", built.status_code == 200 and bool(bj.get("transaction")), f"{built.status_code} {built.text[:100]}")
    if bj.get("transaction"):
        # byte-exact splice: sign the ORIGINAL message bytes (solders populate() mangles v0/ALT messages)
        raw = base64.b64decode(bj["transaction"])
        def read_compact_u16(b, off):
            val = 0; shift = 0
            while True:
                x = b[off]; off += 1
                val |= (x & 0x7F) << shift
                if not (x & 0x80): break
                shift += 7
            return val, off
        n_sigs, off = read_compact_u16(raw, 0)
        msg_bytes = raw[off + 64 * n_sigs:]
        vtx = VersionedTransaction.from_bytes(raw)
        sig_bytes = []
        for pk in list(vtx.message.account_keys)[:n_sigs]:
            for cand in (TEST, mint_kp):
                if str(pk) == str(cand.pubkey()):
                    sig_bytes.append(bytes(cand.sign_message(msg_bytes))); break
            else:
                raise RuntimeError(f"unexpected required signer {pk}")
        signed_b64 = base64.b64encode(raw[:off] + b"".join(sig_bytes) + msg_bytes).decode()
        try:
            sig3 = None
            for _attempt in range(5):
                try:
                    sig3 = rpc("sendTransaction", [signed_b64, {"encoding": "base64", "skipPreflight": True, "maxRetries": 5}])
                except Exception as e:
                    print("  send attempt failed:", str(e)[:120]); time.sleep(2); continue
                ok, err = confirm(sig3)
                if ok and not err:
                    break
                print("  dropped/errored, resending…"); sig3 = None; time.sleep(2)
            if not sig3:
                raise RuntimeError("mint tx never landed")
            ok, err = True, None
            step("COIN MINTED ON MAINNET", True, f"mint {mint_kp.pubkey()} sig {sig3[:24]}…")
            if ok and not err:
                rec = c.post(f"{BASE}/api/our/launches", json={
                    "mint": str(mint_kp.pubkey()), "name": "MM System Check", "ticker": "MMCHK",
                    "imageUrl": upj["url"], "creator": TW, "signature": sig3,
                })
                lst = c.get(f"{BASE}/api/our/launches").json().get("launches", [])
                step("launch recorded + listed", rec.status_code == 200 and any(l.get("mint") == str(mint_kp.pubkey()) for l in lst), f"{len(lst)} launches")
                # delist the test coin from the UI (it stays on-chain)
                async def delist():
                    from motor.motor_asyncio import AsyncIOMotorClient
                    mc = AsyncIOMotorClient(os.environ["MONGO_URL"])
                    await mc[os.environ["DB_NAME"]].our_launches.delete_one({"mint": str(mint_kp.pubkey())})
                asyncio.run(delist())
                step("test coin delisted from UI", True, "our_launches record removed")
        except Exception as e:
            step("COIN MINTED ON MAINNET", False, repr(e)[:180])
else:
    step("native launch skipped", False, f"test wallet too low: {balance(TW)}")

print("\ntreasury after:", balance(str(TREASURY.pubkey())), "SOL")
print("test wallet after:", balance(TW), "SOL")
print("\n==== SUMMARY ====")
fails = [n for n, ok in results if not ok]
print(f"{len(results) - len(fails)}/{len(results)} passed")
for n, ok in results:
    if not ok:
        print("FAILED:", n)
sys.exit(1 if fails else 0)
