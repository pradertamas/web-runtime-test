# Browser Runtime Test

## Purpose

Static browser runtime and Web API compatibility test for evaluating JavaScript, rendering, storage, input, WebSocket and page lifecycle behavior under changing runtime conditions.

A Browser Runtime and Web API Compatibility Test önálló, dependency-free HTML/CSS/vanilla JavaScript diagnosztikai oldal. A vizsgált runtime/browser körülmények megváltoztatása és a vizuális megfigyelés manuális. Canvas/WebGL kizárólag egyszerű tesztanimációt rajzol.

## Local testing

A négy fájlt tartsd ugyanabban a könyvtárban: `index.html`, `style.css`, `app.js`, `README.md`. Nincs build, npm, Node.js, modul vagy backend.

Az `index.html` közvetlenül is megnyitható; a böngésző file:// szabályai korlátozhatják a clipboardot vagy a localStorage-t. Ajánlott bármely egyszerű statikus webszerver. Ha Python már telepítve van, a projekt könyvtárából:

```sh
python -m http.server 8000
```

Nyisd meg a `http://localhost:8000/` címet. A Python kizárólag opcionális helyi kiszolgáló, nem az alkalmazás függősége. A clipboard jellemzően HTTPS-en vagy localhoston érhető el; hiba esetén kijelölhető textarea jelenik meg.

## GitHub Pages deployment

1. Hozz létre egy GitHub repositoryt.
2. Pushold a négy fájlt a `main` branch gyökerébe.
3. Nyisd meg a repository **Settings → Pages** menüjét.
4. Source: **Deploy from a branch**.
5. Branch: **main**, folder: **/ (root)**, majd **Save**.
6. A publikálás után nyisd meg a Pages által jelzett HTTPS URL-t (általában `https://<user>.github.io/<repository>/`).

Minden alkalmazásútvonal relatív (`./style.css`, `./app.js`), így repository alatti Pages URL-en is működik.

## Browser test procedure

1. Nyisd meg az oldalt a vizsgált böngészőben, helyi statikus szerverről vagy a GitHub Pages URL-ről.
2. Ellenőrizd az animációkat, számlálókat és a **TAP HERE** területet.
3. Nyomd meg a **START CONTINUITY TEST** gombot.
4. Hagyd futni az animációkat és számlálókat.
5. Változtasd meg a vizsgált runtime/browser körülményt.
6. Figyeld meg, mely animációk és számlálók működnek tovább.
7. Nyomd meg a **STOP CONTINUITY TEST** gombot.
8. Nyomd meg a **COPY RESULTS** gombot. Ha szükséges, használd a megjelenő kijelölhető szövegmezőt.
9. Mentsd el az eredményt elemzésre. Jegyezd fel a vizuális megfigyeléseket, a körülmények megváltoztatásának idejét és a böngésző verzióját.

## Measurements and limitations

- JS: falióra szerinti eltelt idő, 1 másodperces timer tick, rAF frames és kb. 1 másodperces mintákból számított FPS. A hosszabb RAF/timer szünetek naplózódnak.
- CSS: JavaScripttől független animáció; folytonossága vizuális megfigyelést igényel. A TEST RUNNING jelzés szintén CSS animáció, nem automatikus renderelési diagnózis.
- Canvas és WebGL: saját sikeres rajzolási számláló és FPS. WebGL2, majd WebGL1; verzió/renderer/vendor lekérdezés elkülönített hibakezeléssel. A renderer maszkolt lehet. A rajzolási hívás sikere nem bizonyítja a fizikai kijelző frissítését.
- Pointer/touch/click: viewportkoordináták és DOM eseményszám. Egy érintés több eseményt generálhat. A touch események támogatása nem jelenti fizikai érintőkijelző meglétét.
- Visibility, focus, pageshow/pagehide, online/offline, browser info és ideiglenes localStorage írás/visszaolvasás/törlés. A `navigator.onLine` nem garantál internetelérést.
- WebSocket: API-jelenlét és opcionális manuális kapcsolat, állapotok, tesztüzenet és fogadás. Nincs alapértelmezett szerver. HTTPS oldalon használj `wss://` végpontot; a `ws://` mixed-content blokkolásba ütközhet. A beérkező üzenet megjelenítése 1000 karakterre korlátozott, HTML-ként soha nem értelmeződik.
- Continuity Test interval összegzés: start/stop timestamp, számlálók és delták, intervallumátlagos callback/rajzolási sebességek, visibility/focus és köztes eseményszámuk, valamint megfigyelt leghosszabb időközök (STOP-nál a még tartó szünet is). A delta önmagában nem bizonyít folyamatos működést a teljes intervallumban; a háttérböngésző throttling és felfüggesztés lehetséges. Teljes újratöltéskor a memóriában lévő eredmény elveszik.
- A log az utolsó 500 eseményt tartja meg, bejegyzésenként legfeljebb 1500 karakterrel, helyi időbélyeggel. Az export start/stop időpontja ISO UTC. FPS ritkán vagy jelentős változáskor kerül a logba. Ha a timer működik, de 2 másodpercig nincs RAF callback, a korábbi FPS helyett 0 jelenik meg; teljes JS-felfüggesztéskor a kijelzés is megáll a folytatásig.
- RESET törli a futás számlálóit, logját és continuity mérését, lezárja az opcionális WebSocketet, és újrateszteli a képességeket. Más webhelyadatot nem töröl; kizárólag a saját ideiglenes storage próbáját távolítja el.
- Nagy landscape viewporton az alapállapotok egyszerre látszanak; kisebb kijelzőn vagy nagyított szövegnél görgetés szükséges. A részletes browser/WS/log panelek összecsukhatók.

A tényleges működés az adott böngészőben végzett manuális teszttel állapítható meg. Ez diagnosztikai tesztoldal, nem végleges alkalmazás.
