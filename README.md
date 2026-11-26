# DBL Asistente

Asistente personal para **Dragon Ball Legends**: lee tu caja real desde el móvil, la cruza con los datos de
[es.dblegends.net](https://es.dblegends.net) y te dice **qué equipos montar, qué actos priorizar y en qué
invocaciones tirar**.

**App publicada**: https://juliang08.github.io/dbl-asistente/ (se actualiza sola a diario).

Todo corre en tu navegador (PWA instalable); tu caja no se sube a ningún sitio.

## Qué hace

- **Mi caja**: importa tu cuenta real (629 personajes, estrellas y Zenkai) o edítala a mano.
- **Equipos**: recomienda combinaciones por tags compartidos, Z Ability aproximada, cobertura de elementos,
  estrellas y Zenkai. Incluye tus 7 equipos guardados del juego.
- **Actos**: prioriza los eventos activos por tiempo restante, recompensas y dificultad, con equipo sugerido
  según los elementos de los enemigos, etapas, drops y retos.
- **Invocaciones**: veredicto *TIRAR / CONSIDERAR / AHORRA* según las unidades destacadas que ya tienes.
- **Guías**: recomendaciones generadas (equipo estrella, acto urgente, siguiente mejora de tu caja).

## Estructura

```
scraper/            Raspador de es.dblegends.net -> JSON (Python + httpx + lxml)
scripts/            Extracción de la caja desde el móvil (ADB) + decodificador del guardado
app/                PWA (TypeScript + Vite + Preact + Tailwind + vite-plugin-pwa)
app/public/data/    JSON generados (personajes, actos, invocaciones)
.github/workflows/  Raspado diario + despliegue en GitHub Pages
```

## Puesta en marcha

Requisitos: **Python 3.11+**, **Node 20+** y (para la caja) **adb** de Android platform-tools.

```bash
# 1. Datos del juego
python3 -m venv .venv
./.venv/bin/pip install -r scraper/requirements.txt
./.venv/bin/python scraper/scrape.py --out app/public/data

# 2. App
cd app
npm install
npm run dev        # http://localhost:5173
```

### Extraer tu caja del móvil

1. Activa **Opciones de desarrollador → Depuración USB** en el móvil y conecta el cable.
2. Acepta el aviso “¿Permitir depuración USB?” en la pantalla del teléfono.
3. Ejecuta:

```bash
./scripts/extraer-caja.sh          # genera caja.json en la raíz del repo
```

4. En la app: **Importar** → selecciona `caja.json`.

El script localiza el guardado del juego (`/sdcard/Android/data/com.bandainamcoent.dblegends_ww/files/`),
lo decodifica (JSON con bytes invertidos XOR 0xFF) y extrae unidades, estrellas, Zenkai y equipos.
Si tu móvil no permite ADB, también puedes usar la app sin extracción:

- Export de **“Mi Caja”** de dblegends.net → **Importar** (formato propio del sitio).
- Carga manual tocando personajes en la pestaña **Mi caja**.

También se acepta el archivo de guardado crudo del juego si lo copias a mano.

### Exportar tu caja

En **Mi caja → Exportar** obtienes `dbl-caja-*.json` (formato de la app) y **Exportar a dblegends** genera un
archivo compatible con “Mi Caja” de dblegends.net.

## Cómo se calculan las recomendaciones

- **Puntuación de unidad**: rareza + estrellas + nivel Zenkai (+ bonus Legends Limited).
- **Equipos**: para cada tag con 6+ unidades tuyas se toman los 3 mejores núcleo y 3 banquillo; se suman
  sinergias de tags secundarios y se premia la cobertura de elementos. Se descartan equipos casi idénticos.
- **Actos**: urgencia por tiempo restante + valor de recompensas (cristales, Z Power, tickets…) + etapas.
  El equipo sugerido usa el elemento que contrarresta a los enemigos (Rojo > Amarillo > Morado > Verde > Azul > Rojo).
- **Invocaciones**: valor de las destacadas que te faltan (ULTRA/LEGEND pesan más) contra las que ya tienes.

## Despliegue gratis (GitHub Pages)

El workflow `.github/workflows/deploy.yml` raspa los datos a diario y publica la app. Ya está configurado y
funcionando: **https://juliang08.github.io/dbl-asistente/**.

Para republicar desde cero (otra máquina, otro fork, etc.) hay un script idempotente:

```bash
gh auth login --web --scopes repo,workflow   # solo la primera vez
./scripts/publicar-github.sh
```

El script crea el repo si no existe, sube `main`, activa Pages con GitHub Actions y lanza el primer deploy.

La PWA se puede instalar desde Chrome en Android (“Añadir a pantalla de inicio”).

## Privacidad y aviso legal

- `caja.json` contiene datos de tu cuenta y está en `.gitignore`: **no se sube**.
- La app guarda la caja en `localStorage` de tu navegador; no hay backend ni analítica.
- Proyecto de fans sin afiliación con Bandai Namco, DIMPS ni Shueisha. Los datos del juego pertenecen a sus dueños.

## Roadmap

- Mapeo de equipamiento (los IDs de equipo del guardado) a la base de datos de equips.
- Z Ability exacta por unidad (requiere raspar la ficha de cada personaje).
- Notificaciones de actos a punto de terminar.
- Comparador de equipos vs. el meta (tier lists de la comunidad).
