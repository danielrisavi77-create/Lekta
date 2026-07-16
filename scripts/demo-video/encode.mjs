// Enkodira demo u 3 kvalitete x (webm VP9+Opus, mp4 H264+AAC) iz frames/ + ambient zvuk.
// Zvuk generira iz ambient.filter (ako ambient.wav ne postoji). Pokreni iz ovog direktorija:
//   node encode.mjs
// Trazi ffmpeg na PATH-u ili u env FFMPEG. Izlaz: demo-{720,1080,1440}.{webm,mp4} + demo-poster.jpg.
// Izlazi su u .gitignore; u repo ide samo izvor + gotov video u ../../public/assets/.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { statSync, existsSync } from 'node:fs';

const FF = process.env.FFMPEG || 'ffmpeg';
const here = dirname(fileURLToPath(import.meta.url));
const frames = join(here, 'frames', '%05d.png');
const audio = join(here, 'ambient.wav');

const run = (args) => execFileSync(FF, args, { stdio: ['ignore', 'ignore', 'inherit'] });
const mb = (p) => (statSync(p).size / 1048576).toFixed(2);

// 1) Ambient zvuk (Cadd9 pad koji "dise" + rijetki mekani tonovi), tih i bez klipanja.
if (!existsSync(audio)) {
  run(['-y', '-v', 'error', '-filter_complex_script', join(here, 'ambient.filter'), '-map', '[out]', '-c:a', 'pcm_s16le', audio]);
  console.log('ambient.wav generiran');
}

// 2) Video kvalitete iz frameova (1440p = izvorna rezolucija frameova, ostalo lanczos downscale).
const Q = [
  { name: '720', w: 1280, h: 720, vpxCrf: 33, x264Crf: 24 },
  { name: '1080', w: 1920, h: 1080, vpxCrf: 32, x264Crf: 22 },
  { name: '1440', w: 2560, h: 1440, vpxCrf: 31, x264Crf: 21 },
];

for (const q of Q) {
  const scale = q.name === '1440' ? [] : ['-vf', `scale=${q.w}:${q.h}:flags=lanczos`];
  const webm = join(here, `demo-${q.name}.webm`);
  const mp4 = join(here, `demo-${q.name}.mp4`);

  run(['-y', '-v', 'error', '-framerate', '60', '-i', frames, '-i', audio, ...scale,
    '-map', '0:v:0', '-map', '1:a:0', '-shortest',
    '-c:v', 'libvpx-vp9', '-crf', String(q.vpxCrf), '-b:v', '0',
    '-row-mt', '1', '-deadline', 'good', '-cpu-used', '3', '-pix_fmt', 'yuv420p',
    '-c:a', 'libopus', '-b:a', '96k', '-ar', '48000', webm]);
  console.log(`demo-${q.name}.webm  ${mb(webm)} MB`);

  run(['-y', '-v', 'error', '-framerate', '60', '-i', frames, '-i', audio, ...scale,
    '-map', '0:v:0', '-map', '1:a:0', '-shortest',
    '-c:v', 'libx264', '-crf', String(q.x264Crf), '-preset', 'medium',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
    '-c:a', 'aac', '-b:a', '128k', '-ar', '48000', mp4]);
  console.log(`demo-${q.name}.mp4   ${mb(mp4)} MB`);
}

// 3) Poster iz sredine (kadar 870 = ~14.5s, KORAK 2 s karticama nalaza).
const poster = join(here, 'demo-poster.jpg');
run(['-y', '-v', 'error', '-i', join(here, 'frames', '00870.png'), '-vf', 'scale=1280:-2', '-q:v', '3', poster]);
console.log(`demo-poster.jpg ${mb(poster)} MB`);
console.log('ENCODE DONE -> kopiraj demo-*.{webm,mp4} + demo-poster.jpg u ../../public/assets/');
