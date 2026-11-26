#!/usr/bin/env python3
"""Raspador de es.dblegends.net -> JSON estático para la PWA.

Uso:
    python scraper/scrape.py --out app/public/data
    python scraper/scrape.py --out app/public/data --skip-details   # solo listados
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx
from lxml import html as LH

BASE = "https://es.dblegends.net"
UA = "dbl-asistente/1.0 (proyecto personal; +https://github.com/)"

ELEMENTS = ["RED", "YEL", "PUR", "GRN", "BLU", "LGT", "DRK"]
RARITIES = ["LEGEND", "ULTRA", "SPARKING", "EXTREME", "HERO"]


def log(msg: str) -> None:
    print(f"[scrape] {msg}", file=sys.stderr, flush=True)


def now_ts() -> int:
    return int(datetime.now(tz=timezone.utc).timestamp())


class Client:
    def __init__(self, delay: float = 0.4) -> None:
        self.http = httpx.Client(
            base_url=BASE,
            headers={"User-Agent": UA, "Accept-Language": "es-ES,es;q=0.9"},
            timeout=60,
            follow_redirects=True,
        )
        self.delay = delay
        self._last = 0.0

    def get(self, path: str) -> httpx.Response:
        wait = self.delay - (time.time() - self._last)
        if wait > 0:
            time.sleep(wait)
        for attempt in range(3):
            try:
                r = self.http.get(path)
                self._last = time.time()
                if r.status_code == 200:
                    return r
                log(f"HTTP {r.status_code} en {path} (intento {attempt + 1})")
            except httpx.HTTPError as exc:  # pragma: no cover - red
                log(f"error de red en {path}: {exc} (intento {attempt + 1})")
            time.sleep(1.5 * (attempt + 1))
        raise RuntimeError(f"No se pudo obtener {path}")

    def get_asset(self, path: str) -> bytes:
        """Descarga un recurso estático (iconos) con pausa mínima."""
        time.sleep(0.03)
        r = self.http.get(path)
        if r.status_code != 200:
            raise RuntimeError(f"HTTP {r.status_code} en {path}")
        return r.content

    def doc(self, path: str) -> LH.HtmlElement:
        return LH.fromstring(self.get(path).content)


def json_blob(doc: LH.HtmlElement, sid: str) -> Any:
    nodes = doc.xpath(f'//script[@id="{sid}"]')
    if not nodes or not nodes[0].text:
        raise RuntimeError(f"falta el bloque JSON #{sid}")
    return json.loads(nodes[0].text)


def game_data_version(doc: LH.HtmlElement) -> str:
    nodes = doc.xpath('//*[contains(@class,"ft-ver")]//b/text()')
    return nodes[0].strip() if nodes else ""


def text_of(node: LH.HtmlElement | None) -> str:
    if node is None:
        return ""
    return re.sub(r"\s+", " ", " ".join(node.itertext())).strip()


def parse_character_cards(doc: LH.HtmlElement) -> list[dict[str, Any]]:
    out: dict[int, dict[str, Any]] = {}
    for a in doc.xpath('//a[contains(concat(" ", normalize-space(@class), " "), " chara-list ")]'):
        href = a.get("href") or ""
        m = re.search(r"character/(\d+)", href)
        if not m:
            continue
        cid = int(m.group(1))
        name = (a.get("data-charaname") or text_of(a.xpath('.//*[contains(@class,"card-header")]')[0] if a.xpath('.//*[contains(@class,"card-header")]') else None)).strip()
        if not name:
            continue
        icons = a.xpath('.//img[contains(@src,"card_icons/")]/@src')
        icon = icons[0].rsplit("/", 1)[-1] if icons else ""
        tags = [int(t) for t in (a.get("data-tags") or "").split() if t.lstrip("-").isdigit()]
        out[cid] = {
            "id": cid,
            "name": name,
            "form": (a.get("data-charaformname") or "").strip(),
            "element": a.get("data-element") or "",
            "rarity": a.get("data-rarity") or "",
            "zenkai": a.get("data-zenkai") == "1",
            "lf": a.get("data-lf") == "1",
            "tags": tags,
            "card": (a.xpath(".//*[@title]/@title") or [""])[0],
            "icon": icon,
        }
    return [out[k] for k in sorted(out)]


def save_asset(client: Client, remote_path: str, dest: Path, stats: dict[str, int]) -> None:
    if dest.exists() and dest.stat().st_size > 0:
        stats["cached"] = stats.get("cached", 0) + 1
        return
    try:
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(client.get_asset(remote_path))
        stats["downloaded"] = stats.get("downloaded", 0) + 1
    except Exception as exc:  # pragma: no cover - tolerante
        stats["failed"] = stats.get("failed", 0) + 1
        log(f"aviso: no se pudo descargar {remote_path}: {exc}")


def scrape_characters(
    client: Client,
    img_dir: Path | None = None,
    cache_dir: Path | None = None,
    refresh_details: bool = False,
) -> dict[str, Any]:
    log("personajes: descargando listado")
    doc = client.doc("/characters")
    chars = parse_character_cards(doc)

    log("personajes: descargando extras (enemigos de eventos)")
    try:
        extras = parse_character_cards(client.doc("/extras"))
        known = {c["id"] for c in chars}
        for c in extras:
            if c["id"] not in known:
                c["extra"] = True
                chars.append(c)
        chars.sort(key=lambda c: c["id"])
        log(f"personajes: {len(extras)} extras añadidos")
    except Exception as exc:  # pragma: no cover
        log(f"aviso: no se pudieron leer los extras: {exc}")
    picks = json_blob(doc, "picks")
    rel = json_blob(doc, "rel")
    relz = json_blob(doc, "relzk")

    for c in chars:
        c["release"] = rel.get(str(c["id"]), -1)
        c["releaseZenkai"] = relz.get(str(c["id"]), c["release"])

    def pick_list(key: str) -> list[dict[str, Any]]:
        return [{"id": pid, "name": name} for pid, name, *_ in picks.get(key, [])]

    if img_dir is not None:
        stats: dict[str, int] = {}
        for c in chars:
            if c.get("icon"):
                save_asset(client, f"/assets/card_icons/{c['icon']}", img_dir / "chars" / f"{c['id']}.webp", stats)
        log(f"iconos de personajes: {stats}")

    if cache_dir is not None:
        char_cache = cache_dir / "characters"
        tag_lookup: dict[str, int] = {}
        for key in ("tg", "ep"):
            for pid, name, *_ in picks.get(key, []):
                tag_lookup[norm_key(name)] = pid
        main_chars = [c for c in chars if not c.get("extra")]
        pending = [
            c["id"]
            for c in main_chars
            if refresh_details or not (char_cache / f"{c['id']}.json").exists()
        ]
        log(f"personajes: {len(pending)} fichas por descargar (de {len(main_chars)})")

        details: dict[int, dict[str, Any]] = {}
        if pending:
            thread_local = threading.local()
            progress = {"done": 0}

            def work(cid: int) -> tuple[int, dict[str, Any]]:
                worker_client = getattr(thread_local, "client", None)
                if worker_client is None:
                    worker_client = Client(delay=max(0.15, client.delay * 0.6))
                    thread_local.client = worker_client
                return cid, parse_character_detail(worker_client, cid, tag_lookup, char_cache, refresh=refresh_details)

            with ThreadPoolExecutor(max_workers=3) as pool:
                for cid, detail in pool.map(work, pending):
                    details[cid] = detail
                    progress["done"] += 1
                    if progress["done"] % 100 == 0:
                        log(f"personajes: {progress['done']}/{len(pending)} fichas")

        for c in main_chars:
            detail = details.get(c["id"])
            if detail is None:
                cache_file = char_cache / f"{c['id']}.json"
                if cache_file.exists():
                    try:
                        detail = json.loads(cache_file.read_text(encoding="utf-8"))
                    except json.JSONDecodeError:
                        detail = None
            if detail:
                c.update({
                    "maxStats": detail.get("maxStats") or {},
                    "mechanics": detail.get("mechanics") or [],
                    "abilities": detail.get("abilities") or [],
                    "zAbility": detail.get("zAbility") or "",
                    "zAbilityTags": detail.get("zAbilityTags") or [],
                })

    return {
        "generatedAt": datetime.now(tz=timezone.utc).isoformat(timespec="seconds"),
        "gameDataVersion": game_data_version(doc),
        "count": len(chars),
        "characters": chars,
        "tags": pick_list("tg"),
        "traits": pick_list("tr"),
        "episodes": pick_list("ep"),
    }


def parse_stage(stg: LH.HtmlElement) -> dict[str, Any]:
    summary = stg.xpath('.//*[contains(@class,"stg-nm")]')
    meta: dict[str, int] = {}
    for span in stg.xpath('.//*[contains(@class,"stg-meta")]/span'):
        raw = text_of(span)
        m = re.match(r"(\w+)\s*([\d,.]+)", raw)
        if m:
            meta[m.group(1).lower()] = int(re.sub(r"[^\d]", "", m.group(2)) or 0)

    enemies = []
    for u in stg.xpath('.//*[contains(@class,"stg-u")]'):
        a = u.xpath(".//a[contains(@href,'character/')]")
        cid = int(re.search(r"\d+", a[0].get("href")).group()) if a else None
        name_nodes = u.xpath('.//*[contains(@class,"card-header")]')
        lvl = text_of(u.xpath('.//*[contains(@class,"stg-lv")]')[0]) if u.xpath('.//*[contains(@class,"stg-lv")]') else ""
        stats: dict[str, str] = {}
        for pair in u.xpath('.//dl[contains(@class,"stg-st")]/div'):
            dt = text_of(pair.xpath("./dt")[0]) if pair.xpath("./dt") else ""
            dd = text_of(pair.xpath("./dd")[0]) if pair.xpath("./dd") else ""
            if dt:
                stats[dt] = dd
        enemies.append({
            "id": cid,
            "name": text_of(name_nodes[0]) if name_nodes else "",
            "level": lvl,
            "stats": stats,
        })

    drops = []
    for it in stg.xpath('.//*[contains(@class,"stg-items")]//*[contains(@class,"stg-it")]'):
        title = it.get("title") or text_of(it)
        count = text_of(it.xpath(".//b")[0]) if it.xpath(".//b") else ""
        if title:
            drops.append({"name": title, "count": count})

    challenges = []
    for li in stg.xpath('.//*[contains(@class,"stg-chal")]/li'):
        reward_nodes = li.xpath('.//*[contains(@class,"stg-it")]')
        reward = {}
        if reward_nodes:
            reward = {
                "name": reward_nodes[0].get("title") or text_of(reward_nodes[0]),
                "count": text_of(reward_nodes[0].xpath(".//b")[0]) if reward_nodes[0].xpath(".//b") else "",
            }
        challenges.append({"text": text_of(li.xpath("./span[1]")[0]) if li.xpath("./span[1]") else text_of(li), "reward": reward})

    return {
        "n": int(re.sub(r"\D", "", text_of(stg.xpath('.//*[contains(@class,"stg-n")]')[0])) or 0) if stg.xpath('.//*[contains(@class,"stg-n")]') else 0,
        "name": text_of(summary[0]) if summary else "",
        "meta": meta,
        "enemies": enemies,
        "drops": drops,
        "challenges": challenges,
    }


def scrape_event_detail(client: Client, event_id: int) -> dict[str, Any]:
    doc = client.doc(f"/event/{event_id}")
    title_nodes = doc.xpath('//*[contains(@class,"bv-name")]')
    stages = [parse_stage(s) for s in doc.xpath('//details[contains(@class,"stg")]')]
    info = text_of(doc.xpath('//*[contains(@class,"bv-info")]')[0]) if doc.xpath('//*[contains(@class,"bv-info")]') else ""
    return {
        "title": text_of(title_nodes[0]) if title_nodes else "",
        "info": info[:600],
        "stages": stages,
    }


def parse_banner_pools(doc: LH.HtmlElement) -> list[dict[str, Any]]:
    pools = []
    for section in doc.xpath('//*[contains(@class,"bv-pool")]//section'):
        head = section.xpath('.//*[contains(@class,"bv-h")]')
        raw_title = text_of(head[0]) if head else ""
        title, count, rate = raw_title, None, ""
        m = re.match(r"^(.*?)\s+(\d+)\s+([\d.]+%\s.*)$", raw_title)
        if m:
            title, count, rate = m.group(1).strip(), int(m.group(2)), m.group(3)
        units = []
        for a in section.xpath('.//a[contains(@class,"chara-list")]'):
            cid_m = re.search(r"character/(\d+)", a.get("href") or "")
            if not cid_m:
                continue
            units.append({
                "id": int(cid_m.group(1)),
                "name": (a.get("data-charaname") or "").strip(),
                "element": a.get("data-element") or "",
                "rarity": a.get("data-rarity") or "",
                "card": (a.xpath(".//*[@title]/@title") or [""])[0],
            })
        if "unfeatured" in title.lower():
            continue
        if units:
            pools.append({"title": title, "count": count, "rate": rate, "units": units})
    # fallback: si no hay pools, captura la sección "Featured Units"
    if not pools:
        units = []
        for a in doc.xpath('//a[contains(@class,"chara-list")]'):
            cid_m = re.search(r"character/(\d+)", a.get("href") or "")
            if cid_m:
                units.append({"id": int(cid_m.group(1)), "name": (a.get("data-charaname") or "").strip(),
                              "element": a.get("data-element") or "", "rarity": a.get("data-rarity") or ""})
        if units:
            pools.append({"title": "Featured Units", "units": units})
    return pools


def scrape_banner_detail(client: Client, banner_id: int) -> dict[str, Any]:
    doc = client.doc(f"/banner/{banner_id}")
    info = text_of(doc.xpath('//*[contains(@class,"bv-info")]')[0]) if doc.xpath('//*[contains(@class,"bv-info")]') else ""
    return {"info": info[:1200], "pools": parse_banner_pools(doc)}


EQUIP_RARITY = {5: "Platinum", 4: "Unique", 3: "Gold", 2: "Silver", 1: "Bronze", 0: "Iron", 6: "Event"}
EFFECT_RE = re.compile(r"^(.*?)\s*([+-]?\d+(?:[.,]\d+)?)%\s*(?:[~-]\s*(\d+(?:[.,]\d+)?)%)?\s*(.*)$")

MECHANIC_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("Cambio Protector", re.compile(r"cambio protector", re.I)),
    ("Resurrección", re.compile(r"resurrecci[oó]n", re.I)),
    ("Medidor único", re.compile(r"medidor [uú]nico", re.I)),
    ("Anulación", re.compile(r"anulaci[oó]n", re.I)),
    ("Robo de cartas", re.compile(r"robo de \d+ cartas?", re.I)),
    ("Contraataque", re.compile(r"contraataque", re.I)),
    ("Destrucción de cartas", re.compile(r"destrucci[oó]n de .{0,30}cartas?", re.I)),
    ("Inamovible", re.compile(r"inamovible", re.I)),
    ("Curación", re.compile(r"recuperaci[oó]n de salud", re.I)),
    ("Tiempo de espera", re.compile(r"tiempo de espera", re.I)),
]

TAG_ICON_RE = re.compile(r"\{\{ICN:(ChaTag|Epi)\}\}")


def norm_key(value: str) -> str:
    import unicodedata

    return unicodedata.normalize("NFD", value or "").encode("ascii", "ignore").decode().lower().strip()


def detect_mechanics(text: str) -> list[str]:
    return [name for name, pattern in MECHANIC_PATTERNS if pattern.search(text or "")]


def z_tags_from_text(text: str, lookup: dict[str, int]) -> list[int]:
    """Extrae los tags/episodios que buffea una Habilidad Z a partir de su texto."""
    cleaned = TAG_ICON_RE.sub("", text or "")
    candidates: list[str] = []
    for line in cleaned.splitlines():
        head = line.split("·")[0]
        if ":" in head:
            candidates.append(head.split(":")[0])
    for match in re.finditer(r"para (?:la )?etiqueta ([^\r\n·]+)", cleaned):
        candidates.append(match.group(1))

    ids: list[int] = []
    for chunk in candidates:
        for part in re.split(r",| o | y ", chunk):
            name = norm_key(part)
            if not name:
                continue
            tag_id = lookup.get(name)
            if tag_id is not None and tag_id not in ids:
                ids.append(tag_id)
    return ids


def parse_character_detail(
    client: Client,
    char_id: int,
    tag_lookup: dict[str, int],
    cache_dir: Path | None,
    refresh: bool = False,
) -> dict[str, Any]:
    cache = cache_dir / f"{char_id}.json" if cache_dir else None
    if cache and cache.exists() and not refresh:
        try:
            return json.loads(cache.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            pass

    doc = client.doc(f"/character/{char_id}")
    data = json_blob(doc, "data")
    record: dict[str, Any] = {}
    if isinstance(data, dict):
        record = data.get(str(char_id)) or (next(iter(data.values())) if data else {})
    elif isinstance(data, list):
        record = next((r for r in data if isinstance(r, dict) and int(r.get("id", -1)) == char_id), {})
        if not record:
            record = next((r for r in data if isinstance(r, dict)), {})
    abilities_blob = json_blob(doc, "ab") or {}

    ids = record.get("ab") or {}
    ability_ids = [ids.get("m")] + list(ids.get("p") or []) + list(ids.get("llz") or [])
    abilities: list[dict[str, str]] = []
    for aid in ability_ids:
        if aid in (None, -1):
            continue
        entry = abilities_blob.get(str(aid))
        if entry and entry[0]:
            abilities.append({"name": entry[0], "text": (entry[1] or "")[:1200]})

    z_ids = list(ids.get("z") or [])
    z_texts = []
    for zid in z_ids:
        entry = abilities_blob.get(str(zid))
        if entry and entry[1]:
            z_texts.append(entry[1])
    z_combined = "\n".join(z_texts)

    all_text = " ".join(a["text"] for a in abilities)
    detail = {
        "maxStats": record.get("max") or {},
        "mechanics": detect_mechanics(all_text),
        "abilities": abilities[:6],
        "zAbility": z_combined[:600],
        "zAbilityTags": z_tags_from_text(z_combined, tag_lookup),
    }
    if cache:
        cache.parent.mkdir(parents=True, exist_ok=True)
        cache.write_text(json.dumps(detail, ensure_ascii=False), encoding="utf-8")
    return detail


def num(value: str | None) -> float | None:
    if value is None:
        return None
    try:
        return float(value.replace(",", "."))
    except ValueError:
        return None


def parse_effect_lines(raw: str) -> list[dict[str, Any]]:
    """Convierte el texto de un efecto en líneas normalizadas (nombre, min, max, nota)."""
    out: list[dict[str, Any]] = []
    for part in re.split(r"\s*\|\s*|\n+", raw):
        part = re.sub(r"\s+", " ", part).strip()
        if not part:
            continue
        m = EFFECT_RE.match(part)
        if m and m.group(1).strip():
            out.append({
                "name": m.group(1).strip(" +·"),
                "min": num(m.group(2)),
                "max": num(m.group(3) or m.group(2)),
                "note": m.group(4).strip()[:160],
            })
        else:
            out.append({"name": part[:220], "min": None, "max": None, "note": ""})
    return out


def parse_equipment_detail(client: Client, equip_id: int, cache_dir: Path | None, refresh: bool = False) -> dict[str, Any]:
    cache = cache_dir / f"{equip_id}.json" if cache_dir else None
    if cache and cache.exists() and not refresh:
        try:
            return json.loads(cache.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            pass

    doc = client.doc(f"/equip/{equip_id}")
    desc = text_of(doc.xpath('//*[contains(@class,"eqd-desc")]')[0]) if doc.xpath('//*[contains(@class,"eqd-desc")]') else ""
    equippable = text_of(doc.xpath('//*[contains(@class,"eqd-req")]')[0]) if doc.xpath('//*[contains(@class,"eqd-req")]') else ""

    slots = []
    slot_nodes = doc.xpath('//*[contains(concat(" ", normalize-space(@class), " "), " eqd-slot ")]')
    for slot in slot_nodes:
        n = slot.get("data-s") or "0"
        options = []
        for opt in slot.xpath('.//*[contains(@class,"eqd-optc")]'):
            effs = opt.xpath('.//*[contains(@class,"eqd-eff")]')
            if effs:
                text = " | ".join(t for t in (text_of(e) for e in effs) if t)
            else:
                text = re.sub(r"^Option \d+ of \d+\s*", "", text_of(opt))
            if text:
                options.append(text)
        if not options:
            # equipos sin variantes: el slot trae el texto directamente
            direct = re.sub(r"^Slot \d+\s*", "", text_of(slot))
            if direct:
                options.append(direct)
        slots.append({"n": int(n), "options": options})

    obtain = []
    for art in doc.xpath('//*[contains(@class,"obt-grid")]//article'):
        name_node = art.xpath('.//*[contains(@class,"obt-nm")]')
        obtain.append({
            "kind": art.get("data-k") or "",
            "name": text_of(name_node[0]) if name_node else "",
            "href": (name_node[0].get("href") if name_node else "") or "",
            "note": text_of(art.xpath('.//*[contains(@class,"obt-ln")]')[0]) if art.xpath('.//*[contains(@class,"obt-ln")]') else "",
        })

    detail = {
        "desc": desc[:300],
        "equippable": equippable[:220],
        "slots": slots,
        "obtain": obtain[:6],
    }
    if cache:
        cache.parent.mkdir(parents=True, exist_ok=True)
        cache.write_text(json.dumps(detail, ensure_ascii=False), encoding="utf-8")
    return detail


def scrape_equipment(
    client: Client,
    img_dir: Path | None = None,
    cache_dir: Path | None = None,
    skip_details: bool = False,
    refresh: bool = False,
) -> dict[str, Any]:
    log("equipamiento: descargando listado")
    doc = client.doc("/equipment")
    blob = json_blob(doc, "eqdata")
    conds: dict[str, str] = {str(k): v for k, v in (blob.get("conds") or {}).items()}
    rows: list[list[Any]] = blob.get("items") or []

    cards: dict[int, dict[str, Any]] = {}
    for a in doc.xpath('//a[contains(@class,"eqc")]'):
        m = re.search(r"/equip/(\d+)", a.get("href") or "")
        if not m:
            continue
        img = a.xpath(".//img/@src")
        cards[int(m.group(1))] = {
            "name": (a.get("title") or "").strip(),
            "rarity": int(a.get("data-r") or 0),
            "icon": img[0].rsplit("/", 1)[-1] if img else "",
        }

    items: list[dict[str, Any]] = []
    char_names = {str(c[1]).strip().lower() for c in (blob.get("chars") or []) if isinstance(c, list) and len(c) > 1}
    for i, row in enumerate(rows, 1):
        if not row:
            continue
        equip_id = int(row[0])
        base = int(row[3]) if len(row) > 3 and isinstance(row[3], int) else 0
        groups = row[4] if len(row) > 4 and isinstance(row[4], list) else []
        cond_ids: list[int] = []
        for group in groups:
            if isinstance(group, list):
                cond_ids.extend(int(x) for x in group)
        card = cards.get(equip_id, {})
        rarity = int(row[10]) if len(row) > 10 and isinstance(row[10], int) else int(card.get("rarity") or 0)
        labels = [conds.get(str(c), "") for c in cond_ids]
        exclusive = any(label and (label.upper().startswith("DBL") or label.strip().lower() in char_names) for label in labels)
        item: dict[str, Any] = {
            "id": equip_id,
            "name": card.get("name") or f"Equipamiento {equip_id}",
            "rarity": rarity,
            "rarityLabel": EQUIP_RARITY.get(rarity, str(rarity)),
            "icon": card.get("icon") or "",
            "conditions": cond_ids,
            "conditionLabels": labels,
            "exclusive": exclusive,
            "awakenedFrom": base,
            "release": int(row[11]) if len(row) > 11 and isinstance(row[11], int) else 0,
        }
        if not skip_details:
            item["_needs_detail"] = True
        items.append(item)
        if i % 100 == 0:
            log(f"equipamiento: {i}/{len(rows)}")

    if not skip_details:
        pending: list[int] = []
        for item in items:
            cache_file = cache_dir / f"{item['id']}.json" if cache_dir else None
            if refresh or cache_file is None or not cache_file.exists():
                pending.append(item["id"])
        log(f"equipamiento: {len(pending)} fichas por descargar")

        details: dict[int, dict[str, Any]] = {}
        if pending:
            thread_local = threading.local()
            progress = {"done": 0}

            def work(equip_id: int) -> tuple[int, dict[str, Any]]:
                worker_client = getattr(thread_local, "client", None)
                if worker_client is None:
                    worker_client = Client(delay=max(0.15, client.delay * 0.6))
                    thread_local.client = worker_client
                detail = parse_equipment_detail(worker_client, equip_id, cache_dir, refresh=refresh)
                progress["done"] += 1
                if progress["done"] % 100 == 0:
                    log(f"equipamiento: {progress['done']}/{len(pending)} fichas")
                return equip_id, detail

            with ThreadPoolExecutor(max_workers=3) as pool:
                for equip_id, detail in pool.map(work, pending):
                    details[equip_id] = detail

        for item in items:
            item.pop("_needs_detail", None)
            if item["id"] in details:
                item.update(details[item["id"]])
            else:
                try:
                    item.update(parse_equipment_detail(client, item["id"], cache_dir))
                except Exception as exc:  # pragma: no cover
                    log(f"aviso: sin detalle para equip {item['id']}: {exc}")

    if img_dir is not None:
        stats: dict[str, int] = {}
        for item in items:
            if item.get("icon"):
                save_asset(client, f"/assets/equips/{item['icon']}", img_dir / "equips" / f"{item['id']}.webp", stats)
        log(f"iconos de equipamiento: {stats}")

    return {
        "generatedAt": datetime.now(tz=timezone.utc).isoformat(timespec="seconds"),
        "gameDataVersion": game_data_version(doc),
        "count": len(items),
        "rarityLabels": EQUIP_RARITY,
        "conditions": conds,
        "items": items,
    }


TIERLIST_URL = "https://dblegends.app/data/tierlist.json"


def scrape_meta() -> dict[str, Any]:
    log("meta: descargando tier list de dblegends.app")
    r = httpx.get(TIERLIST_URL, headers={"User-Agent": UA}, timeout=60, follow_redirects=True)
    r.raise_for_status()
    data = r.json()

    tiers: dict[str, dict[str, Any]] = {}
    for unit in data.get("units") or []:
        card = (unit.get("id") or "").strip()
        if not card:
            continue
        entry: dict[str, Any] = {}
        for key in ("tier", "rank", "score", "boost", "new", "zenkai"):
            if unit.get(key) is not None:
                entry[key] = unit[key]
        if entry:
            tiers[card] = entry

    return {
        "generatedAt": datetime.now(tz=timezone.utc).isoformat(timespec="seconds"),
        "source": TIERLIST_URL,
        "lastUpdated": data.get("last_updated") or "",
        "tierOrder": data.get("tier_order") or [],
        "tiers": tiers,
        "boost": data.get("boost") or {},
    }


def event_status(ev: dict[str, Any], now: int) -> str:
    if ev.get("perm"):
        return "permanent"
    begin, end = ev.get("begin") or 0, ev.get("end") or 0
    if begin and now < begin:
        return "upcoming"
    if end and now >= end:
        return "ended"
    return "active"


def scrape_events(client: Client, skip_details: bool = False, horizon_days: int = 14) -> dict[str, Any]:
    log("actos: descargando listado")
    doc = client.doc("/events")
    raw = json_blob(doc, "events")
    now = now_ts()
    horizon = now + horizon_days * 86400

    keep = []
    for ev in raw:
        st = event_status(ev, now)
        if st not in ("active", "upcoming"):
            continue
        end = ev.get("end") or 0
        begin = ev.get("begin") or 0
        if st == "active" and end and end > now + 60 * 86400:
            continue  # acto de larga duración: no es un "live" que caduque pronto
        if st == "upcoming" and begin > horizon:
            continue
        ev2 = dict(ev)
        ev2["status"] = st
        keep.append(ev2)

    keep.sort(key=lambda e: (e["status"] != "active", e.get("begin") or 0, e.get("end") or 0))
    log(f"actos: {len(keep)} vigentes/próximos de {len(raw)}")

    if not skip_details:
        for i, ev in enumerate(keep, 1):
            if ev["status"] in ("active", "upcoming"):
                log(f"actos: detalle {i}/{len(keep)} -> #{ev['id']} {ev['name'][:40]}")
                try:
                    ev["detail"] = scrape_event_detail(client, ev["id"])
                except Exception as exc:  # pragma: no cover - tolerante a fallos
                    log(f"  aviso: sin detalle para #{ev['id']}: {exc}")

    return {
        "generatedAt": datetime.now(tz=timezone.utc).isoformat(timespec="seconds"),
        "gameDataVersion": game_data_version(doc),
        "events": keep,
    }


def scrape_banners(client: Client, skip_details: bool = False) -> dict[str, Any]:
    log("invocaciones: descargando listado")
    doc = client.doc("/summons")
    raw = json_blob(doc, "gacha")
    now = now_ts()

    keep = []
    for b in raw:
        st = event_status(b, now)
        if st not in ("active", "upcoming"):
            continue
        if (b.get("type_label") or "") not in ("Crystal", "Ticket"):
            continue
        end = b.get("end") or 0
        begin = b.get("begin") or 0
        if st == "active" and end and end > now + 60 * 86400:
            continue
        if st == "upcoming" and begin > now + 30 * 86400:
            continue
        b2 = dict(b)
        b2["status"] = st
        keep.append(b2)

    keep.sort(key=lambda b: (b["status"] != "active", b.get("end") or 0))
    log(f"invocaciones: {len(keep)} vigentes/próximas de {len(raw)}")

    if not skip_details:
        for i, b in enumerate(keep, 1):
            log(f"invocaciones: detalle {i}/{len(keep)} -> #{b['id']} {b['name'][:40]}")
            try:
                b.update(scrape_banner_detail(client, b["id"]))
            except Exception as exc:  # pragma: no cover
                log(f"  aviso: sin detalle para #{b['id']}: {exc}")

    return {
        "generatedAt": datetime.now(tz=timezone.utc).isoformat(timespec="seconds"),
        "gameDataVersion": game_data_version(doc),
        "banners": keep,
    }


def main() -> None:
    ap = argparse.ArgumentParser(description="Raspa es.dblegends.net a JSON")
    ap.add_argument("--out", default="app/public/data", help="directorio de salida de los JSON")
    ap.add_argument("--img-dir", default=None, help="directorio de imágenes (defecto: <out>/../img)")
    ap.add_argument("--cache-dir", default="scraper/.cache", help="caché de detalles de equipamiento")
    ap.add_argument("--delay", type=float, default=0.4, help="segundos entre peticiones")
    ap.add_argument("--skip-details", action="store_true", help="no descargar detalles de actos/invocaciones/equipos")
    ap.add_argument("--refresh-equipment", action="store_true", help="ignora la caché de detalles de equipamiento")
    ap.add_argument("--refresh-characters", action="store_true", help="ignora la caché de fichas de personajes")
    ap.add_argument("--no-images", action="store_true", help="no descargar iconos")
    ap.add_argument("--only", choices=["characters", "events", "banners", "equipment", "meta"], help="raspar sólo una sección")
    args = ap.parse_args()

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    img_dir = None if args.no_images else Path(args.img_dir) if args.img_dir else out.parent / "img"
    cache_dir = None if args.skip_details else Path(args.cache_dir)
    client = Client(delay=args.delay)

    if args.only in (None, "characters"):
        data = scrape_characters(
            client,
            img_dir=img_dir,
            cache_dir=cache_dir,
            refresh_details=args.refresh_characters,
        )
        (out / "characters.json").write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        log(f"personajes: {data['count']} guardados")
    if args.only in (None, "meta"):
        data = scrape_meta()
        (out / "meta.json").write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        log(f"meta: {len(data['tiers'])} unidades con tier")
    if args.only in (None, "equipment"):
        data = scrape_equipment(
            client,
            img_dir=img_dir,
            cache_dir=cache_dir,
            skip_details=args.skip_details,
            refresh=args.refresh_equipment,
        )
        (out / "equipment.json").write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        log(f"equipamiento: {data['count']} guardados")
    if args.only in (None, "events"):
        data = scrape_events(client, skip_details=args.skip_details)
        (out / "events.json").write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        log(f"actos: {len(data['events'])} guardados")
    if args.only in (None, "banners"):
        data = scrape_banners(client, skip_details=args.skip_details)
        (out / "banners.json").write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        log(f"invocaciones: {len(data['banners'])} guardadas")

    run = {
        "generatedAt": datetime.now(tz=timezone.utc).isoformat(timespec="seconds"),
        "source": BASE,
    }
    (out / "run.json").write_text(json.dumps(run, ensure_ascii=False, indent=2), encoding="utf-8")
    log(f"listo -> {out}")


if __name__ == "__main__":
    main()
