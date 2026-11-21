"""Buat barca.ics (semua laga FC Barcelona musim ini) dari API publik ESPN.

Dijalankan GitHub Action tiap 3 jam; file ikut terbit di GitHub Pages sehingga bisa
dilanggan di Google Calendar. Tanpa dependensi selain standard library.
"""
import json
import sys
import urllib.request
from datetime import datetime, timedelta, timezone

TEAM = "83"
COMPS = {
    "esp.1": "La Liga",
    "uefa.champions": "Liga Champions",
    "esp.copa_del_rey": "Copa del Rey",
    "esp.super_cup": "Supercopa",
    "club.friendly": "Uji coba",
}
BASE = "https://site.web.api.espn.com/apis/site/v2/sports/soccer"
WIB = timezone(timedelta(hours=7))


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "matchday-ics/1.0"})
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.load(r)


def score(c):
    s = c.get("score")
    if isinstance(s, dict):
        s = s.get("displayValue")
    return s if s not in (None, "") else None


def esc(s):
    return str(s).replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\n", "\\n")


def fold(line):
    out, b = [], line.encode("utf-8")
    while len(b) > 74:
        cut = 74
        while (b[cut] & 0xC0) == 0x80:  # jangan memotong karakter UTF-8
            cut -= 1
        out.append(b[:cut].decode("utf-8"))
        b = b" " + b[cut:]
    out.append(b.decode("utf-8"))
    return "\r\n".join(out)


def main(out_path):
    events, ok = {}, 0
    for league, comp in COMPS.items():
        for q in ("?fixture=true", ""):
            try:
                d = get(f"{BASE}/{league}/teams/{TEAM}/schedule{q}")
            except Exception as e:  # kompetisi kosong / error sementara
                print("lewati", league, q, e, file=sys.stderr)
                continue
            ok += 1
            for e in d.get("events", []):
                events[e["id"]] = (league, comp, e)
    if not ok or not events:
        sys.exit("Tidak ada data dari ESPN; barca.ics tidak diubah.")

    now = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    lines = [
        "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//matchday//barca//ID", "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH", "X-WR-CALNAME:Barça · Matchday", "X-WR-TIMEZONE:Asia/Jakarta",
        "REFRESH-INTERVAL;VALUE=DURATION:PT6H", "X-PUBLISHED-TTL:PT6H",
    ]
    for eid, (league, comp, e) in sorted(events.items(), key=lambda x: x[1][2].get("date", "")):
        c = e["competitions"][0]
        cs = c.get("competitors", [])
        home = next((x for x in cs if x.get("homeAway") == "home"), cs[0])
        away = next((x for x in cs if x.get("homeAway") == "away"), cs[1])
        hn, an = home["team"]["displayName"], away["team"]["displayName"]
        st = c.get("status", {}).get("type", {})
        start = datetime.fromisoformat(e["date"].replace("Z", "+00:00"))
        tbd = e.get("timeValid") is False or "TBD" in (st.get("shortDetail") or "")
        if st.get("completed") and score(home) is not None:
            title = f"{hn} {score(home)}–{score(away)} {an}"
        else:
            title = f"{hn} vs {an}"
        venue = (c.get("venue") or {}).get("fullName", "")
        lines += ["BEGIN:VEVENT", f"UID:espn-{eid}@matchday", f"DTSTAMP:{now}"]
        if tbd:
            d0 = start.astimezone(WIB).date()
            lines += [f"DTSTART;VALUE=DATE:{d0:%Y%m%d}", f"DTEND;VALUE=DATE:{d0 + timedelta(days=1):%Y%m%d}"]
            title += " (jam belum pasti)"
        else:
            lines += [f"DTSTART:{start:%Y%m%dT%H%M%SZ}", f"DTEND:{start + timedelta(minutes=115):%Y%m%dT%H%M%SZ}"]
        lines.append(fold(f"SUMMARY:⚽ {esc(title)}"))
        lines.append(fold(f"DESCRIPTION:{esc(comp)}\\nhttps://khairuddin-n.github.io/matchday/#/laga/{league}/{eid}"))
        if venue:
            lines.append(fold(f"LOCATION:{esc(venue)}"))
        if not tbd and not st.get("completed"):
            lines += ["BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:Kick-off 1 jam lagi", "TRIGGER:-PT1H", "END:VALARM"]
        lines.append("END:VEVENT")
    lines.append("END:VCALENDAR")
    with open(out_path, "w", encoding="utf-8", newline="") as f:
        f.write("\r\n".join(lines) + "\r\n")
    print(f"{len(events)} laga ditulis ke {out_path}")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "barca.ics")
