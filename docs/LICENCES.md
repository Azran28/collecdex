# CollecDex — toutes les licences à collectionner

But à terme : **tout avoir de disponible**. Ce document recense tous les jeux de cartes à collectionner (TCG) connus, ainsi que les autres cartes qui se collectionnent, avec ce qu'il faut savoir pour les intégrer.
Liste établie le 18 oct. 2026 (connaissances de Claude + recherche web). Les sources de données changent souvent : **toujours vérifier une source au moment d'intégrer la licence**. Les mentions « à vérifier » signalent les points incertains.

## Légende
- ✅ = Arnaud a des cartes (pour pouvoir tester le scanner en vrai) · ✅ peu = quelques cartes · 🔜 = il en aura bientôt
- **Facilité d'intégration**
  - **A** : source gratuite et complète (cartes, images, souvent prix), on la branche directement.
  - **B** : source correcte mais incomplète (pas de prix, pas de français, images à copier…).
  - **C** : pas de vraie source, il faut un robot qui lit le site officiel ou un site de fans.
  - **D** : rien d'exploitable, liste à construire nous-mêmes (souvent à partir de nos photos).
- **Popularité** : ★ (confidentiel) à ★★★★★ (énorme), estimée pour la France et le monde.
- **Numéro** : ce que porte la carte. « X/Y » est idéal pour le scanner ; un code sans total (ex. `BT1-001`) demande un peu d'adaptation, comme pour One Piece.
- Rappel : Cardmarket ne donne plus d'accès public aux nouveaux développeurs. Sans source de prix toute faite, les prix passent par le robot (comme pour Riftbound).

---

## 0. Ordre conseillé (prochaines licences)
1. **Final Fantasy TCG** ✅ — B, site officiel lisible, prix par le robot.
2. **Star Wars: Unlimited** ✅ — fait en v3.67 (base officielle FFG en français).
3. **Dragon Ball Super Card Game (Masters)** ✅ — fait en v3.68 (site officiel Bandai en français, photos d’Arnaud : Critical Blow). **Fusion World** (✅ peu ?) reste à faire : autre jeu (`FB01-001`), en anglais, même site (dbs-cardgame.com/fw), prix TCGplayer catégorie 80.
4. **Cartes de supermarché** (Dreamworks Carrefour ✅ complète) — D, petites collections en « X/Y », à construire à partir des photos d'Arnaud. Il faudra un outil pour « créer une collection nous-mêmes », qui servira ensuite à toutes les licences D.
5. **Wankul** ✅ — fait en v3.48 (le Wankuldex officiel de wankul.fr a toute la base : en fait **B**).
6. **Digimon** (✅ ? à retrouver) — B.
7. **Magic** — A, la plus facile techniquement, mais Arnaud n'a pas de cartes pour tester.
8. Ensuite : le reste par popularité, en commençant par les A et les B.

---

## 1. Déjà dans l'appli
| Licence | Éditeur | Source | Note |
|---|---|---|---|
| Pokémon ✅ | The Pokémon Company | TCGdex | Toutes les séries en français |
| One Piece ✅ | Bandai | optcgapi.com | Français depuis OP-09 |
| Riftbound ✅ | Riot / UVS Games | Galerie Riot + robot pour les prix | Noms anglais |
| Disney Lorcana ✅ | Ravensburger | Lorcast / LorcanaJSON | En français (v3.21) |
| Yu-Gi-Oh! ✅ | Konami | YGOPRODeck | Noms en français (v3.26) |
| Final Fantasy TCG ✅ | Square Enix | Base officielle + TCGplayer | En français (v3.43) |
| Wankul ✅ | Wankil Studio | Wankuldex officiel (wankul.fr) | En français, visuels copiés dans le site, pas de prix (v3.48) |
| Star Wars: Unlimited ✅ | Fantasy Flight Games | Base officielle + TCGplayer | En français (v3.67) |
| Dragon Ball Super Card Game (Masters) ✅ | Bandai | Site officiel Bandai + TCGplayer | En français (v3.68) |

## 2. Grands TCG actuels (occident)
| Licence | Éditeur | Popularité | Facilité | Source de données | Numéro | Note |
|---|---|---|---|---|---|---|
| Magic: The Gathering | Wizards of the Coast | ★★★★★ | **A** | Scryfall (api.scryfall.com) : complet, images HD, prix €/$, français | n° de collection + code de série | ~100 000 cartes : charger par série |
| Star Wars: Unlimited ✅ | Fantasy Flight Games | ★★★☆☆ | **A** | Base officielle (admin.starwarsunlimited.com › api/card-list, en français, sans CORS) + TCGplayer (catégorie 79) | « SOR • FR • 038/252 » | **Fait en v3.67** ; prix TCGplayer par le robot |
| Flesh and Blood | Legend Story Studios | ★★★☆☆ | **B** | Base GitHub « the-fab-cube/flesh-and-blood-cards » (JSON complet) | `WTR001` | Pas de prix |
| Final Fantasy TCG ✅ | Square Enix | ★★☆☆☆ | **B** | Recherche du site officiel (fftcg.square-enix-games.com) | `1-001H` | Prix TCGplayer (catégorie 24) par le robot — fait en v3.43 |
| Grand Archive | Weebs of the Shore | ★★☆☆☆ | **A** | API officielle (index.gatcg.com / api.gatcg.com) | code de série | Petite communauté |
| Sorcery: Contested Realm | Erik's Curiosa | ★★☆☆☆ | **B** | curiosa.io, API officielle (à vérifier) | — | Très belles illustrations |
| Altered | Equinox (France) | ★★☆☆☆ | **B** | api.altered.gg (officielle, en français) | — | Éditeur en difficulté : avenir à vérifier ; cartes uniques numérotées |
| MetaZoo | MetaZoo Games | ★☆☆☆☆ | C | site officiel | « X/Y » | Arrêté ou en pause (à vérifier) |
| Elestrals | Elestrals LLC | ★☆☆☆☆ | C | site officiel | « X/Y » | |
| Akora | Akora TCG | ★☆☆☆☆ | C | site officiel | « X/Y » | Style très proche de Pokémon |
| Alpha Clash | Alpha Clash | ★☆☆☆☆ | C | site officiel | — | |
| UniVersus (ex-UFS) | UVS Games | ★☆☆☆☆ | C | sites de fans | — | Même éditeur que Riftbound en anglais |
| Force of Will | Force of Will Co. | ★★☆☆☆ | C | sites de fans (FoW TCG DB) | code de série | |
| KeyForge | Ghost Galaxy | ★★☆☆☆ | B | Archon Arcana, Decks of KeyForge | — | Cas spécial : chaque deck est unique, on collectionne des decks |
| Vampire: The Eternal Struggle | Black Chantry | ★☆☆☆☆ | B | KRCG / VEKN (fans, complet) | — | Réimprimé depuis 2018 |
| Wankul ✅ | Wankil Studio | ★★★☆☆ (France) | **B** | Wankuldex officiel (wankul.fr › apps/wankul/api/wankuldex, sans CORS, images refusées hors du site) | « STELLAR · LAINK · C#55 » | **Fait en v3.48** ; pas de prix (ni Cardmarket ni TCGplayer) |
| Panzer Perfume Phantasm ✅ peu | (à vérifier) | ★☆☆☆☆ | D | rien de connu | ? | À regarder avec les cartes d'Arnaud |

## 3. TCG japonais / anime
| Licence | Éditeur | Popularité | Facilité | Source | Numéro | Note |
|---|---|---|---|---|---|---|
| Dragon Ball Super Fusion World ✅ peu | Bandai | ★★★★☆ | C | site officiel (dbs-cardgame.com/fw) | `FB01-001` | Même logique que One Piece |
| Dragon Ball Super Card Game (Masters) ✅ | Bandai | ★★★☆☆ | **B** | Site officiel en français (dbs-cardgame.com/europe-fr/cartes, sans CORS : robot) + TCGplayer (catégorie 27) | `BT22-083 R` | Fait en v3.68 |
| Digimon (2020) ✅ ? | Bandai | ★★★☆☆ | **B** | digimoncard.io (API gratuite, anglais) | `BT1-001` | Peu de prix |
| Gundam Card Game | Bandai | ★★★☆☆ (en hausse) | C | site officiel (gundam-gcg.com) | `GD01-001` | Sorti en 2025, construit comme One Piece |
| Union Arena | Bandai | ★★★☆☆ | C | site officiel (unionarena-tcg.com) | `UA01BT/…` | Plein de licences anime dans un seul jeu (Jujutsu Kaisen, Hunter x Hunter, Nikke…) |
| Weiss Schwarz | Bushiroad | ★★★☆☆ | C | EncoreDecks (API de fans), ws-tcg.com | `XXX/W01-001` | Énorme (des centaines de séries anime) |
| Cardfight!! Vanguard | Bushiroad | ★★☆☆☆ | C | site officiel (cf-vanguard.com), wiki de fans | `D-BT01/001` | |
| Shadowverse: Evolve | Bushiroad / Cygames | ★★☆☆☆ | C | site officiel | `BP01-001` | |
| hololive Official Card Game | Bushiroad / COVER | ★★☆☆☆ | C | site officiel | `hBP01-001` | Sorti en 2024 |
| Battle Spirits Saga | Bandai | ★☆☆☆☆ | C | site officiel | `BSS01-001` | Arrêté en occident (à vérifier) |
| Duel Masters | Takara Tomy | ★★★☆☆ (Japon) | D | wiki japonais | — | Uniquement au Japon |
| WIXOSS | Takara Tomy | ★★☆☆☆ (Japon) | C | wiki de fans | `WX01-001` | |
| Yu-Gi-Oh! Rush Duel | Konami | ★★★☆☆ (Japon) | C | YGOPRODeck (en partie) | — | Version simplifiée de Yu-Gi-Oh! |
| Ultraman Card Game | Tsuburaya / Bandai | ★★☆☆☆ | C | site officiel | — | Sorti en 2024 |
| Z/X -Zillions of enemy X- | Broccoli | ★☆☆☆☆ | D | wiki japonais | — | |
| Lycee Overture | Visual Arts | ★☆☆☆☆ | D | wiki japonais | — | |
| Fire Emblem Cipher | Nintendo / Intelligent Systems | ★☆☆☆☆ | D | wiki de fans | — | Arrêté en 2020 |
| Gate Ruler | Furyu | ★☆☆☆☆ | D | — | — | Arrêté |

## 4. Jeux de cartes évolutifs (LCG : boîtes fixes, pas de boosters)
On les collectionne aussi en « X / Y », et leurs bases de fans sont très complètes.
| Licence | Éditeur | Facilité | Source |
|---|---|---|---|
| Marvel Champions | Fantasy Flight Games | **A** | MarvelCDB (API) |
| Horreur à Arkham (Arkham Horror LCG) | Fantasy Flight Games | **A** | ArkhamDB (API) |
| Le Seigneur des Anneaux JCE | Fantasy Flight Games | **A** | RingsDB (API) |
| Netrunner (Android: Netrunner / NISEI) | FFG puis Null Signal Games | **A** | NetrunnerDB (API) |
| Le Trône de Fer JCE (A Game of Thrones LCG) | Fantasy Flight Games | **A** | ThronesDB (API) — arrêté |
| Legend of the Five Rings LCG | Fantasy Flight Games | **A** | FiveRingsDB — arrêté |
| Star Wars: The Card Game | Fantasy Flight Games | B | sites de fans — arrêté |
| Ashes Reborn | Plaid Hat Games | B | ashes.live |

## 5. Nouveaux ou à venir
| Licence | Note |
|---|---|
| TCG Cyberpunk 🔜 | Annoncé pour 2026 ; Arnaud en aura bientôt. Voir les sources quand il sera sorti |
| Palworld TCG | Annoncé (à vérifier) |
| Echoes of Astra, Origins TCG, Neuroscape | Cités par la presse comme sorties 2026, non confirmés |
| Nouvelles licences d'Union Arena | Nikke, Chained Soldier, Kagurabachi… (dans Union Arena, pas des jeux à part) |

## 6. TCG arrêtés mais encore collectionnés (vintage)
En général : pas d'API, des sites de fans ou des listes à faire (C ou D). À traiter tard, sauf demande.
| Licence | Éditeur | Années | Source connue |
|---|---|---|---|
| Star Wars CCG | Decipher | 1995–2001 | Base JSON du Star Wars CCG Players Committee (GitHub) — B |
| Le Seigneur des Anneaux TCG | Decipher | 2001–2007 | sites de fans |
| Star Trek CCG | Decipher | 1994–2007 | trekcc.org |
| Young Jedi | Decipher | 1999–2001 | sites de fans |
| Harry Potter TCG | Wizards of the Coast | 2001–2002 | sites de fans |
| Neopets TCG | Wizards of the Coast | 2003–2005 | sites de fans |
| Kaijudo / Duel Masters (occident) | Wizards of the Coast | 2004–2014 | wikis |
| Dragon Ball Z TCG | Score (2000), puis Panini (2014) | 2000–2018 | sites de fans |
| Dragon Ball GT TCG | Score | 2003–2005 | sites de fans |
| Naruto CCG | Bandai | 2006–2011 | wikis |
| Bleach TCG | Score | 2007–2009 | wikis |
| One Piece CCG (premier jeu) | Bandai | 2003–2006 | wikis |
| Digimon Digi-Battle | Bandai | 1999–2003 | wikis |
| Yu Yu Hakusho TCG | Score | 2003–2006 | wikis |
| Shaman King TCG | Upper Deck | 2005 | wikis |
| Zatch Bell! | Bandai | 2005–2007 | wikis |
| Avatar TCG | Upper Deck | 2006 | wikis |
| World of Warcraft TCG | Upper Deck / Cryptozoic | 2006–2013 | wikis |
| Vs. System | Upper Deck (relancé par UD en 2PCG) | 2004–… | sites de fans |
| Chaotic | 4Kids | 2007–2010 | wikis |
| Bakugan TCG | Spin Master | 2008–2012 | wikis |
| Huntik | Upper Deck | 2009 | wikis |
| Wakfu TCG | Ankama (France) | 2008–2014 | sites de fans français |
| Transformers TCG | Hasbro / Wizards | 2018–2020 | wikis |
| Star Wars: Destiny | Fantasy Flight Games | 2016–2020 | swdestinydb (API) — B |
| Dragon Ball Super (1re version) | Bandai | 2017–… | voir « Masters » |
| Legend of the Five Rings CCG | AEG | 1995–2015 | Oracle of the Void |
| Spellfire | TSR | 1994–1997 | sites de fans |
| Mortal Kombat Kard Game | Classic Cards | 1995 | — |
| Doctor Who CCG, Highlander, Babylon 5, X-Files CCG | divers | années 90 | sites de fans |
| My Little Pony CCG | Enterplay | 2013–2019 | sites de fans |
| Rage, Jyhad, Shadowfist, Warhammer 40k CCG… | divers | années 90–2000 | sites de fans |
| Monsterpocalypse | Privateer Press | — | — |

## 7. Autres cartes à collectionner (pas des TCG)
Même logique dans l'appli (« X / Y », photo, progression), mais quasiment jamais de source de données : **D**, collections à construire nous-mêmes.
| Catégorie | Exemples | Note |
|---|---|---|
| Cartes de supermarché ✅ | Carrefour (Dreamworks ✅ complète, Disney, Pixar…), Leclerc, Auchan, Intermarché, Lidl, Super U… | Petites collections (100–200), souvent en « X/Y ». Très bon candidat. |
| Football / sport : Topps ✅ | Match Attax ✅, Topps Chrome, Bowman | Énormément de cartes, une nouvelle collection chaque saison |
| Panini ✅ (un peu) | Adrenalyn XL (cartes), albums de stickers (foot, Disney, séries) | Stickers numérotés sans total sur la vignette ; l'album donne le total |
| Upper Deck, Leaf, Futera, Panini Prizm | Cartes de sport US (basket, NFL, hockey…) | Marché énorme aux États-Unis |
| Kayou | Naruto Kayou, Harry Potter, Ultraman, Marvel, My Little Pony… | Très populaire (cartes chinoises), aucune source |
| Dérivés Pokémon ✅ | stickers ✅, stacks ✅, waps ✅ | Sous la licence Pokémon, comme « objets à part » ; listes à faire |
| Dérivés Yu-Gi-Oh! ✅ | waps ✅ | Idem, sous Yu-Gi-Oh! |
| Cartes « arcade » japonaises | Dragon Ball Heroes, Carddass (Bandai), Pokémon Tretta / Ga-Olé, Mushiking | Pour plus tard |
| Cartes classiques | Garbage Pail Kids, cartes Marvel/DC, cartes de films | Pour plus tard |

## 8. Exclus : jeux 100 % numériques
Pas de carte physique, donc rien à scanner : Pokémon TCG Pocket, Hearthstone, Marvel Snap, Legends of Runeterra, Gwent, Shadowverse (appli), Magic Arena, Yu-Gi-Oh! Master Duel.

---

### Sources consultées le 18 oct. 2026
- https://gametyrant.com/news/upcoming-tcg-set-releases-in-2026
- https://athlonsports.com/collectibles/best-new-tcg-games-launching-2026-outlooks-predictions
- https://hallofcards.app/blog-posts/best-tcgs-to-collect-2026-complete-ranking-new-collectors
- https://www.collectosk.com/fr/2026-release-dates/
