"""Render the source barrow description locally; runtime playback uses only MP3."""
import argparse
import importlib.metadata
import hashlib
import subprocess
import json
from pathlib import Path
import re
import time

parser = argparse.ArgumentParser()
parser.add_argument('--model', required=True, help='Local Qwen3-TTS 1.7B VoiceDesign checkpoint')
args = parser.parse_args()
root = Path(__file__).resolve().parents[2]
source = (root / 'reference/zork2/2dungeon.zil').read_text()
room = source.split('<ROOM INSIDE-BARROW', 1)[1].split('<ROOM NARROW-TUNNEL', 1)[0]
text = 'Inside the Barrow. ' + re.sub(r'\s+', ' ', re.search(r'\(LDESC\s*"(.*?)"\)', room, re.S).group(1)).strip()
instruction = 'A mature male British English storyteller with a warm resonant voice. Calm, atmospheric fantasy narration with quiet curiosity and a subtle sense of mystery. Speak clearly at a measured natural pace with gentle sentence pauses. No whispering, no exaggerated theatricality, no background music or sound effects.'
import mlx.core as mx
import numpy as np
import soundfile as sf
from mlx_audio.tts.utils import load_model
mx.random.seed(42)
print('Loading local VoiceDesign checkpoint', flush=True)
model = load_model(Path(args.model))
start = time.monotonic()
print('Generating: ' + text, flush=True)
parts = list(model.generate_voice_design(text=text, instruct=instruction, language='English', temperature=.65, max_tokens=1200, verbose=False))
audio = np.concatenate([np.asarray(p.audio).reshape(-1) for p in parts])
if not np.isfinite(audio).all() or not len(audio):
    raise RuntimeError('Invalid generated waveform')
output = root / 'out/tts'; output.mkdir(parents=True, exist_ok=True)
sf.write(output / 'inside-barrow-opening.wav', audio, parts[0].sample_rate, subtype='PCM_16')
metadata = dict(model='mlx-community/Qwen3-TTS-12Hz-1.7B-VoiceDesign-bf16', checkpoint=Path(args.model).name, runtime=importlib.metadata.version('mlx-audio'), seed=42, temperature=.65, text=text, instruction=instruction, sample_rate=parts[0].sample_rate, duration_seconds=len(audio)/parts[0].sample_rate, generation_seconds=time.monotonic()-start)
compressed = root / 'src/presentation/audio/assets/inside-barrow-opening.mp3'
subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', str(output / 'inside-barrow-opening.wav'), '-af', 'loudnorm=I=-18:TP=-1.5:LRA=7', '-ar', '24000', '-ac', '1', '-c:a', 'libmp3lame', '-b:a', '64k', str(compressed)], check=True)
metadata.update(codec='mp3', bitrate=64000, channels=1, loudness_target_lufs=-18, bytes=compressed.stat().st_size, sha256=hashlib.sha256(compressed.read_bytes()).hexdigest())
(root / 'src/presentation/audio/assets/inside-barrow-opening.json').write_text(json.dumps(metadata, indent=2)+'\n')
print(json.dumps(metadata, indent=2), flush=True)
