# Dypfinn

Dypfinn er en mobiltilpasset fiskeapp for Austevoll. Den kombinerer konkrete områder valgt fra kartdybder og bunnformer med vær, vind, bølger, tidevann, strøm, driftplan, minstemål og privat fangstlogg.

Produksjonsadressen er `https://eliasheggland.github.io/dypfinn/`.

## Mappestruktur

- `public/` – hele nettstedet som publiseres på GitHub Pages
- `public/auth.js` – e-postkonto, e-postbekreftelse, passordreset og utlogging via Firebase Authentication
- `public/firebase-config.js` – offentlig Firebase-klientkonfigurasjon (aldri tjenestekontonøkler)
- `tests/` – tester av artsregler, terrengmodell, drift og turplanlegging
- `scripts/verify-static.mjs` – kontrollerer filbaner, katalog og Pages-kompatibilitet
- `scripts/api-smoke.mjs` – kontrollerer live API-svar og CORS for GitHub Pages
- `.github/workflows/pages.yml` – tester og publiserer hver endring på `main`
- `.github/workflows/api-health.yml` – kontrollerer API-ene daglig

## API-er

Appen bruker bare offentlige HTTPS-tjenester uten hemmelige nøkler:

- MET Locationforecast – vind, temperatur, nedbør og trykk
- MET Oceanforecast – bølger, sjøtemperatur og modellert strøm
- Kartverket Tide API – astronomisk tidevann
- Kartverket WMS Dybdedata – kartdybder ved valgte koordinater
- Kartverket WMTS – bakgrunnskart

`npm run test:apis` sender samme `Origin` som GitHub Pages og stopper dersom et API mangler gyldig svar eller nødvendig CORS-header. GitHub Actions kjører kontrollen før hver publisering og én gang daglig. Eksterne tjenester kan aldri garanteres å være tilgjengelige for alltid, men en feil blir oppdaget før ny kode publiseres og av den daglige kontrollen etterpå.

## Brukerkontoer

Firebase Authentication håndterer e-post og passord. Passord lagres aldri i appen eller GitHub. `Email/Password` må være aktivert i Firebase, og `eliasheggland.github.io` må stå i listen over autoriserte domener. Private fiskeplasser, fangster og bilder ligger fortsatt lokalt i brukerens nettleser og publiseres aldri i repositoryet.

## Lokal kontroll

Krever Node.js 22 eller nyere.

```bash
npm run verify
npm run serve
```

Åpne deretter `http://127.0.0.1:4186`.

## GitHub Pages

Repositoriet skal være offentlig dersom kontoen bruker GitHub Free. Velg **Settings → Pages → Source: GitHub Actions** én gang. Deretter tester og publiserer workflowen automatisk ved hver push til `main`.

Kartet er et planleggingsverktøy, ikke et navigasjonskart. Dybder er kartintervaller, fiskeområdene er modellvurderinger og ingen markør lover fangst.
