#!/usr/bin/env python3
"""Extrae la caja de Dragon Ball Legends del teléfono (ADB) y genera caja.json.

El guardado del juego es un JSON con los bytes invertidos (XOR 0xFF) dentro de
/sdcard/Android/data/com.bandainamcoent.dblegends_ww/files/ .

Uso:
    python scripts/extraer_caja.py                # detecta el móvil y genera ./caja.json
    python scripts/extraer_caja.py -o caja.json
    python scripts/extraer_caja.py --file guardado.bin   # sin ADB: decodifica un archivo ya copiado

Requisitos: adb (platform-tools) en el PATH, en $ADB o en rutas habituales.
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

PACKAGE = "com.bandainamcoent.dblegends_ww"
REMOTE_DIR = f"/sdcard/Android/data/{PACKAGE}/files"

# Umbrales de Z Power -> estrellas (los mismos que usa el juego/web)
STAR_THRESHOLDS = [100, 200, 400, 700, 1400, 1900, 2400, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 9999]


def log(msg: str) -> None:
    print(f"[caja] {msg}", file=sys.stderr, flush=True)


def find_adb() -> str:
    candidates = [
        os.environ.get("ADB", ""),
        shutil.which("adb") or "",
        str(Path.home() / "platform-tools" / "adb"),
        str(Path.home() / "Android" / "platform-tools" / "adb"),
        "/tmp/opencode/platform-tools/adb",
        "/usr/lib/android-sdk/platform-tools/adb",
    ]
    for c in candidates:
        if c and Path(c).exists() and os.access(c, os.X_OK):
            return c
    raise SystemExit(
        "No encontré adb. Instala Android platform-tools y agrégalo al PATH, "
        "o define la variable ADB=/ruta/a/adb"
    )


def adb(adb_path: str, *args: str, timeout: int = 120) -> str:
    res = subprocess.run([adb_path, *args], capture_output=True, text=True, timeout=timeout)
    if res.returncode != 0:
        raise RuntimeError(f"adb {' '.join(args)} falló: {res.stderr.strip()}")
    return res.stdout


def pick_device(adb_path: str) -> str:
    serial = os.environ.get("ANDROID_SERIAL")
    out = adb(adb_path, "devices")
    devices = []
    for line in out.splitlines()[1:]:
        parts = line.split()
        if len(parts) >= 2:
            devices.append((parts[0], parts[1]))
    authorized = [s for s, st in devices if st == "device"]
    if serial:
        if serial not in authorized:
            raise SystemExit(f"El dispositivo ANDROID_SERIAL={serial} no está conectado/autorizado.")
        return serial
    if not authorized:
        raise SystemExit(
            "No hay ningún dispositivo autorizado.\n"
            "Conecta el móvil por USB, activa la depuración USB y acepta el aviso en pantalla."
        )
    if len(authorized) > 1:
        raise SystemExit(f"Hay varios dispositivos ({', '.join(authorized)}). Usa ANDROID_SERIAL=<serial>.")
    return authorized[0]


def remote_files(adb_path: str, serial: str) -> list[tuple[str, int]]:
    """Devuelve [(nombre, tamaño)] de los archivos de nivel superior de la carpeta del juego."""
    out = adb(adb_path, "-s", serial, "shell", f"ls -l {REMOTE_DIR}")
    files: list[tuple[str, int]] = []
    for line in out.splitlines():
        parts = line.split()
        if len(parts) < 8 or not parts[0].startswith("-"):
            continue
        size = int(parts[4]) if parts[4].isdigit() else 0
        name = " ".join(parts[7:])
        files.append((name, size))
    return files


def decode_json(raw: bytes) -> Any | None:
    """El guardado va con los bytes invertidos (XOR 0xFF). Prueba JSON directo y XOR."""
    for data in (raw, bytes(b ^ 0xFF for b in raw)):
        try:
            txt = data.decode("utf-8")
        except UnicodeDecodeError:
            continue
        txt = txt.lstrip("\ufeff")
        if not txt or txt[0] not in "{[":
            continue
        try:
            return json.loads(txt)
        except json.JSONDecodeError:
            continue
    return None


def stars_from_zpower(zp: int) -> int:
    stars = 0
    for i, threshold in enumerate(STAR_THRESHOLDS):
        if zp >= threshold:
            stars = i
        else:
            break
    return stars


def parse_save(data: dict[str, Any]) -> dict[str, Any] | None:
    unit = data.get("unit")
    if not isinstance(unit, dict) or "unitInfo_" not in unit:
        return None
    items = data.get("item") or {}
    zp = {int(x["characterType"]): int(x.get("count") or 0) for x in items.get("characterShards_") or [] if "characterType" in x}
    plenty = {int(x["characterType"]): int(x.get("count") or 0) for x in items.get("characterPlentyShards_") or [] if "characterType" in x}

    units: dict[str, dict[str, int]] = {}
    for u in unit.get("unitInfo_") or []:
        cid = u.get("id", u.get("char_id"))
        if cid is None or int(cid) < 0:
            continue
        stars = stars_from_zpower(zp.get(int(cid), 0))
        zenkai = min(7, plenty.get(int(cid), 0) // 1000)
        units[str(int(cid))] = {"stars": stars, "zenkai": zenkai}

    parties = []
    party_data = data.get("party") or {}
    active = party_data.get("activePartyIndex_")
    for idx, party in enumerate(party_data.get("partyInfo_") or []):
        members = [int(c["characterId_"]) for c in party.get("characters_") or [] if int(c.get("characterId_", -1)) >= 0]
        if not members:
            continue
        parties.append({
            "name": party.get("partyName_") or f"Party{idx + 1}",
            "active": idx == active,
            "members": members,
        })

    equipment: dict[str, dict[str, Any]] = {}
    for item in items.get("equipItems_") or []:
        equip_id = item.get("equipId")
        if equip_id is None:
            continue
        key = str(int(equip_id))
        entry = equipment.setdefault(key, {"count": 0, "bestRank": None, "bestScore": None})
        entry["count"] += 1
        rank = item.get("rank")
        score = item.get("score")
        if isinstance(score, (int, float)):
            entry["bestScore"] = score if entry["bestScore"] is None else max(entry["bestScore"], score)
        if isinstance(rank, (int, float)):
            entry["bestRank"] = rank if entry["bestRank"] is None else max(entry["bestRank"], rank)

    ever_owned = (items.get("givenEquipInfo_") or {}).get("everGivenIdList") or []

    return {
        "format": "dbl-asistente/caja-v3",
        "generatedAt": datetime.now(tz=timezone.utc).isoformat(timespec="seconds"),
        "source": "adb",
        "romVersion": str(data.get("romVersion") or ""),
        "units": units,
        "equipment": equipment,
        "everOwnedEquipment": [int(x) for x in ever_owned],
        "parties": parties,
    }


def parse_account(data: dict[str, Any]) -> dict[str, Any] | None:
    if "playerName_" not in data:
        return None
    return {
        "name": data.get("playerName_") or "",
        "playerId": data.get("playerId_") or "",
        "friendCode": data.get("friendCode_") or "",
    }


def parse_missions(data: dict[str, Any]) -> dict[str, Any] | None:
    """Extrae el progreso de los grupos de misiones del archivo de estado de misiones."""
    if not isinstance(data, dict) or "missionDataBaseCache" not in data:
        return None

    sets: dict[int, dict[str, int]] = {}
    for entry in (data.get("missionDataBaseCache") or {}).get("mSetResponseList") or []:
        info = entry.get("info") or {}
        set_id = info.get("_missionSetId")
        if set_id is None:
            continue
        sets[int(set_id)] = {
            "completed": int(info.get("_missionCountCompleted") or 0),
            "total": int(info.get("_missionCountTotal") or 0),
        }

    groups: dict[str, dict[str, Any]] = {}
    for type_entry in data.get("missionViewGroupInfoList") or []:
        for group in type_entry.get("infoList") or []:
            group_id = int(group.get("groupId") or 0)
            if group_id <= 0:
                continue
            name_id = group.get("nameId")
            counts = sets.get(int(name_id)) if name_id is not None else None
            items = ((group.get("recommendItemData") or {}).get("itemDataList")) or []
            groups[str(group_id)] = {
                "completed": counts["completed"] if counts else None,
                "total": counts["total"] if counts else None,
                "clearCount": int(group.get("clearCount") or 0),
                "rewardsClaimed": sum(1 for it in items if int(it.get("gainStatus") or 0) == 1),
                "rewardsTotal": len(items),
            }

    return {"groups": groups}


def main() -> None:
    ap = argparse.ArgumentParser(description="Extrae la caja de DBL del móvil por ADB")
    ap.add_argument("-o", "--out", default="caja.json", help="archivo de salida (defecto: caja.json)")
    ap.add_argument("--file", help="en vez de ADB, decodifica este archivo ya copiado")
    ap.add_argument("--max-size-mb", type=float, default=2.0, help="tamaño máximo de archivo a copiar (MB)")
    ap.add_argument("--keep", action="store_true", help="conserva los archivos copiados del móvil")
    args = ap.parse_args()

    out_path = Path(args.out)
    save_data: dict[str, Any] | None = None
    account: dict[str, Any] | None = None
    missions_state: dict[str, Any] | None = None

    if args.file:
        log(f"leyendo {args.file}")
        data = decode_json(Path(args.file).read_bytes())
        if not data:
            raise SystemExit("El archivo no parece un JSON válido (ni normal ni XOR 0xFF).")
        save_data = parse_save(data) if isinstance(data, dict) else None
        if not save_data:
            raise SystemExit("El archivo no contiene una caja (falta unit.unitInfo_).")
    else:
        adb_path = find_adb()
        serial = pick_device(adb_path)
        log(f"dispositivo: {serial}")
        try:
            files = remote_files(adb_path, serial)
        except RuntimeError as exc:
            raise SystemExit(
                f"{exc}\n\nNo se pudo leer {REMOTE_DIR}.\n"
                "Comprueba que el juego está instalado, que el móvil está desbloqueado y que ADB tiene acceso."
            )
        log(f"{len(files)} archivos en la carpeta del juego")

        tmp = Path(tempfile.mkdtemp(prefix="dbl-save-"))
        max_bytes = int(args.max_size_mb * 1024 * 1024)
        try:
            # primero el guardado conocido; después los archivos pequeños hasta encontrarlo todo
            candidates = sorted(files, key=lambda f: (f[0] != "89bb4eb5637df3cd96c463a795005065", f[1] > max_bytes))
            for name, size in candidates:
                if save_data and account and missions_state:
                    break
                if size > max_bytes:
                    continue
                local = tmp / name
                try:
                    adb(adb_path, "-s", serial, "pull", f"{REMOTE_DIR}/{name}", str(local))
                except RuntimeError as exc:
                    log(f"aviso: no se pudo copiar {name}: {exc}")
                    continue
                data = decode_json(local.read_bytes())
                if not isinstance(data, dict):
                    continue
                if not save_data:
                    parsed = parse_save(data)
                    if parsed:
                        save_data = parsed
                        log(f"guardado encontrado: {name}")
                        continue
                if not account:
                    parsed_acc = parse_account(data)
                    if parsed_acc:
                        account = parsed_acc
                        log("datos de jugador encontrados")
                if not missions_state:
                    parsed_missions = parse_missions(data)
                    if parsed_missions:
                        missions_state = parsed_missions
                        log("estado de misiones encontrado")

            if not save_data:
                raise SystemExit(
                    "No se encontró el guardado en la carpeta del juego.\n"
                    "Abre Dragon Ball Legends una vez (y ciérralo) para que el juego escriba sus archivos, y reintenta."
                )
        finally:
            if args.keep:
                log(f"archivos conservados en {tmp}")
            else:
                shutil.rmtree(tmp, ignore_errors=True)

    save_data["player"] = account or {}
    if account and account.get("name"):
        save_data["playerName"] = account["name"]
    save_data["missions"] = missions_state or {"groups": {}}

    out_path.write_text(json.dumps(save_data, ensure_ascii=False, indent=1), encoding="utf-8")

    units = save_data["units"]
    s14 = sum(1 for u in units.values() if u["stars"] >= 14)
    zk = sum(1 for u in units.values() if u["zenkai"] >= 1)
    log("")
    log(f"✔ caja guardada en {out_path}")
    log(f"  jugador: {save_data.get('playerName') or '(sin nombre)'}")
    log(f"  unidades: {len(units)} | 14★: {s14} | zenkai: {zk} | equipos: {len(save_data['parties'])}")
    log(f"  equipamiento: {len(save_data.get('equipment') or {})} objetos distintos")
    log(f"  misiones: {len((save_data.get('missions') or {}).get('groups') or {})} grupos con estado")
    log(f"  romVersion: {save_data.get('romVersion')}")


if __name__ == "__main__":
    main()
