#!/bin/sh
# Donne un numéro de version à cette mise en ligne (fichiers du site + version.json)
V=$(date +%Y%m%d-%H%M%S)
cd "$(dirname "$0")"
sed -i -E "s/\?v=[A-Za-z0-9_-]+\"/?v=$V\"/g; s/window.APP_VERSION = '[^']*'/window.APP_VERSION = '$V'/" index.html
printf '{ "v": "%s" }\n' "$V" > version.json
echo $V
