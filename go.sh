node build-pwa.js
cp -r Smart-Diagnostics-PWA/. .
rm -rf Smart-Diagnostics-PWA Smart-Diagnostics-PWA.zip
sed -i 's/YOUR_USER/esp046-cyber/g; s/YOUR_REPO/Smart-Diagnostics-Wiring-Viewer/g' index.html
git add -A
git commit -m "Add PWA"
git push
