# Orkestrerat AI Vibe-arbetsflöde: EIC–Jan-Eric–Hjalmar

Detta dokument är den repositoryspecifika standarden för orkestrerade flerstegsuppdrag i `Engrove/tools`. Den kompletterar den generella metodiken i `AI_VIBE_CODING_RULES.md` och repositorykontraktet i `AGENTS.md`; den ersätter inte någon av dem.

## Roller

### EIC — Orkestrator

EIC bryter ned arbetet i små verifierbara deluppgifter, fastställer krav, icke-mål, invariants, risk, blast radius och acceptanskriterier. EIC granskar varje publicerad commit eller commitserie mot repositoryts auktoritativa källor och utfärdar nästa uppgift först efter egen readback och kontraktsgranskning.

Kodarens rapport är en granskningskandidat och får inte behandlas som tekniskt bevis utan separat verifiering.

### Jan-Eric — Operatör

Jan-Eric förmedlar Orkestratorns prompt till Kodaren och Kodarens rapport tillbaka till Orkestratorn utan att tyst ändra den tekniska innebörden.

Jan-Eric utför visuella smoke tests, live-tester och mänskliga bedömningar som inte kan bevisas genom källkod eller automatiska tester. Observationer, antaganden och beslut ska rapporteras separat.

Jan-Eric äger verksamhets-, design- och riskbeslut som inte får fattas autonomt av en AI-agent.

### Hjalmar — Kodare

Hjalmar arbetar i en fortlöpande kontextbevarande Kodar-session på den uttryckligen tilldelade arbetsbranchen.

Hjalmar analyserar, implementerar, testar, granskar ändringen, publicerar den genom den godkända repositorytransporten och utför beständig readback.

Hjalmar arbetar endast med den aktuella deluppgiften, ändrar inte `main`, force-pushar inte, mergear inte och börjar inte nästa deluppgift innan EIC har granskat resultatet.

## Överlämningscykel

1. EIC verifierar nuläget och skriver en avgränsad uppgift.
2. Jan-Eric förmedlar uppgiften till Hjalmar.
3. Hjalmar implementerar, testar, publicerar och rapporterar exakt evidensnivå.
4. Jan-Eric vidarebefordrar rapporten och kompletterar vid behov med visuella eller live-observationer.
5. EIC läser tillbaka branch, commits och berörda filer och beslutar om korrigering, nästa deluppgift eller stopp.
6. Cykeln upprepas tills implementationen är en verifierad mergekandidat.

## Evidens

Repositoryinnehåll, commits, lokala tester, CI, runtime och visuella observationer är separata evidensdomäner.

En framgångsrik write bevisar inte korrekt innehåll. Ett lokalt test bevisar inte repositorybranchens innehåll. En repositorycommit bevisar inte deployment. En Kodarrapport bevisar inte de underliggande påståendena.

Konflikter avgörs mot den auktoritativa källa som äger det aktuella påståendet.

## Modulär kodning

Stora filer är inte ett kvalitetsmål.

En stor fil ska inte behållas endast för att undvika fler filoperationer. När en fil innehåller flera ansvar ska den delas före publicering. Connectorns payloadbegränsning är en signal att granska arkitekturen, inte ett skäl att minifiera eller behålla en monolit.

När en planerad eller befintlig fil innehåller flera ansvar ska den delas längs stabila ansvarsgränser före publicering.

Varje modul ska ha ett tydligt ansvar, definierad input och output, begränsad importyta och riktade tester. Tunna facader, aggregators och runners får koordinera flera moduler men ska inte innehålla den huvudsakliga logiken. Mikrofiler utan eget ansvar är förbjudna.

För nya eller väsentligt omskrivna moduler är målet 120–350 rader. Hård gräns i detta repositoryflöde är 500 fysiska rader och 16 000 UTF-8-byte. I connectorbaserat arbete ska filer även hållas till en storlek som kan publiceras och läsas tillbaka byteexakt utan truncation.

Tunna facader och aggregators är tillåtna. Undantag från modulgränserna kräver EIC:s uttryckliga förhandsgodkännande, dokumenterad ansvarsmotivering och riktade tester. Inget undantag får skapas retroaktivt för att legitimera en monolit.

## Repositorytransport och branchdisciplin

GitHub-connectorn är den primära repositorytransporten när Kodarens container saknar autentiserad Git- eller nätverksåtkomst. Containerns oförmåga att köra `git clone` är inte en blocker när motsvarande läs- och writeoperationer finns genom connectorn.

Arbetet sker på en isolerad branch skapad från verifierad aktuell `main`. Varje logiskt steg levereras som en avgränsad commit eller connectorgenererad commitserie. Kodaren publicerar efter varje slutförd deluppgift och Orkestratorn granskar innan nästa deluppgift.

Direkt skrivning till `main`, force-push och autonom merge är förbjudna om inte Jan-Eric uttryckligen fattar ett separat beslut. Orelaterade ändringar får inte blandas i samma deluppgift.

Om en connector-write misslyckas efter att korrekt delarbete publicerats ska den isolerade arbetsbranchen rapporteras som ofullständig. Korrekt delarbete ska inte automatiskt återställas eller döljas genom kompensationscommits. Återställning kräver ett separat beslut från EIC.

## Rapportering och stopp

Saknad verifiering redovisas som `NOT_TESTED`, `NOT_AVAILABLE`, `PARTIAL_PASS` eller `BLOCKER`, aldrig som underförstådd framgång.

En Kodar-session ska bevara verifierad repositorykontext och tidigare beslut, men återverifiera föränderlig branch-, fil- och runtimeinformation före varje beständig ändring.

Efter varje slutförd deluppgift stannar Hjalmar och inväntar EIC:s granskning. Nästa produktsteg påbörjas inte autonomt.
