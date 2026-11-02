#!/usr/bin/env sh
# Contact sheets of the OBSIDIAN studio previews (media/_preview/*.jpg) for quick review.
cd "$(dirname "$0")/../media/_preview" || exit 1
FF="../../node_modules/ffmpeg-static/ffmpeg.exe"
[ -x "$FF" ] || FF="../../node_modules/ffmpeg-static/ffmpeg"
"$FF" -hide_banner -loglevel error -y -i umbra.jpg -i halo.jpg -i argent.jpg -i meridian.jpg -i solstice.jpg -i charter.jpg \
  -filter_complex "[0]scale=560:350[a];[1]scale=560:350[b];[2]scale=560:350[c];[3]scale=560:350[d];[4]scale=560:350[e];[5]scale=560:350[f];[a][b][c][d][e][f]xstack=inputs=6:layout=0_0|w0_0|0_h0|w0_h0|0_h0+h0|w0_h0+h0" sheet-cards.jpg
"$FF" -hide_banner -loglevel error -y -i own-cabin.jpg -i own-engine.jpg -i own-halo.jpg -i own-winglet.jpg -i own-meridian.jpg -i own-umbra.jpg \
  -filter_complex "[0]scale=360:480[a];[1]scale=360:480[b];[2]scale=360:480[c];[3]scale=360:480[d];[4]scale=360:480[e];[5]scale=360:480[f];[a][b][c][d][e][f]xstack=inputs=6:layout=0_0|w0_0|w0+w0_0|0_h0|w0_h0|w0+w0_h0" sheet-own.jpg
echo sheets ok
