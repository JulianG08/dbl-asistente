# DBL Asistente

Asistente personal para **Dragon Ball Legends**: lee tu caja real desde el móvil, la cruza con los datos de
[es.dblegends.net](https://es.dblegends.net) y te dice **qué equipos montar, qué actos priorizar y en qué
invocaciones tirar**.

**App publicada**: https://juliang08.github.io/dbl-asistente/ (se actualiza sola a diario).

Todo corre en tu navegador (PWA instalable); tu caja no se sube a ningún sitio.

## Qué hace

- **Mi caja**: importa tu cuenta real (629 personajes, estrellas, Zenkai **y tu inventario de equipamiento**) o edítala a mano.
- **Equipos**: recomienda combinaciones por tags compartidos, Z Ability aproximada, cobertura de elementos,
  estrellas y Zenkai. Incluye tus 7 equipos guardados del juego.
- **Constructor de equipo**: elige 1–6 personajes y completa el resto por sinergia; añade **equipamiento recomendado
  por personaje** (lo que ya tienes + lo mejor posible con cómo conseguirlo).
- **Mejorar equipo**: cada equipo guardado propone cambios concretos (*cambia X por Y*) con su equipamiento.
- **Actos**: prioriza los eventos activos por tiempo restante, recompensas y dificultad, con equipo sugerido
  según los elementos de los enemigos, etapas, drops y retos.
- **Invocaciones**: veredicto *TIRAR / CONSIDERAR / AHORRA* según las unidades destacadas que ya tienes.
- **Guías**: recomendaciones generadas (equipo estrella, acto urgente, siguiente mejora de tu caja).
- **Tu plan**: acciones concretas (qué subir a 14★, qué Zenkai despertar, qué unidad buscar en banners).
- **Tu cuenta vs. el meta**: cuántas unidades tier Z tienes y cuáles te faltan con su banner.
- **Avisos**: actos que cierran en las próximas 48 h (“Se te escapa”).
- **Misiones**: catálogo de grupos de misiones activos con sus recompensas (Z Power, cristales…).
- **Ability Bonus**: estimación del bonus real de tu equipo a partir de las Habilidades Z por nivel.
- **Imágenes**: iconos de personajes y equipamiento empaquetados en el repo (cargan offline).

## Estructura

```
scraper/            Raspador de es.dblegends.net -> JSON + imágenes (Python + httpx + lxml)
scripts/            Extracción de la caja desde el móvil (ADB) + decodificador del guardado
app/                PWA (TypeScript + Vite + Preact + Tailwind + vite-plugin-pwa)
app/public/data/    JSON generados (personajes, equipamiento, actos, invocaciones)
app/public/img/     Iconos de personajes y equipamiento
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
lo decodifica (JSON con bytes invertidos XOR 0xFF) y extrae unidades, estrellas, Zenkai, equipos y tu
**inventario de equipamiento** (formato `caja-v2`). Si tu móvil no permite ADB, también puedes usar la app sin extracción:

- Export de **“Mi Caja”** de dblegends.net → **Importar** (formato propio del sitio).
- Carga manual tocando personajes en la pestaña **Mi caja**.

También se acepta el archivo de guardado crudo del juego si lo copias a mano.

### Exportar tu caja

En **Mi caja → Exportar** obtienes `dbl-caja-*.json` (formato de la app) y **Exportar a dblegends** genera un
archivo compatible con “Mi Caja” de dblegends.net.

## Cómo se calculan las recomendaciones

- **Puntuación de unidad (v2)**: rareza × recencia (con `releaseZenkai`, así un Zenkai reciente cuenta como
  renovación) + stats máximos (ataque físico + energía) + número de mecánicas modernas (Cambio Protector,
  Resurrección, Medidor único, Robo de cartas…) + tier meta (Z/S/A/B/C de dblegends.app, con bonus de boost) +
  estrellas y Zenkai. Esto evita que un SP antiguo a 14★ desplace a una ULTRA/LEGEND reciente.
- **Equipos**: para cada tag con 6+ unidades tuyas se eligen los 3 mejores para el **núcleo** y el **banquillo**
  se escoge por puntuación + **Habilidad Z que buffea los tags del núcleo**; se premia la cobertura de elementos.
- **Constructor**: parte de los personajes que elijas y añade el resto maximizando tag, elementos nuevos y
  puntuación; luego propone equipamiento compatible (tags, episodios o exclusivo de personaje).
- **Equipamiento**: cada efecto del slot se parsea por separado (rango incluido). El **núcleo** prioriza daño
  infligido y el ataque de su rol (físico o energía según sus stats) y el **banquillo** prioriza salud/defensa.
  Selector **“Mejor ataque” / “Mejor equilibrio”** para cambiar el criterio.
- **Ability Bonus (estimado)**: se parsean las Habilidades Z (tags/episodios que buffean y valor por nivel,
  con nivel según estrellas) y se suman los buffs que cada miembro aplica a sus aliados; el Líder recibe todo.
  No incluye la Z Ability extra del Zenkai (pendiente de datos).
- **Actos**: urgencia por tiempo restante + valor de recompensas + etapas. Equipo sugerido con el elemento que
  contrarresta a los enemigos (Rojo > Amarillo > Morado > Verde > Azul > Rojo).
- **Invocaciones**: valor de las destacadas que te faltan (ULTRA/LEGEND pesan más) contra las que ya tienes.

> Las fichas de personaje y de equipamiento se cachean en `scraper/.cache/` (y en GitHub Actions): sólo se
> descargan las unidades nuevas cada día.

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

- Calcular el "combat rank" del equipamiento al estilo de dblegends.net.
- Notificaciones de actos a punto de terminar.
- Calcular el Z Ability exacto (multiplicadores) combinando textos y tags.
- Historial de meta: evolución de tiers entre temporadas.
