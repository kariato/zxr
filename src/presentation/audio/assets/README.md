# Barrow opening narration

Generated locally on Apple Silicon with Qwen3-TTS 12Hz 1.7B VoiceDesign BF16 through MLX Audio 0.6.1. The model was already cached; generation ran offline. No hosted speech service, voice clone or microphone was used.

`inside-barrow-opening.mp3` is a 17.44-second, 140,204-byte (about 137 KiB) mono MP3 at 24 kHz / 64 kbps. FFmpeg applies loudness normalization targeting -18 LUFS and -1.5 dBTP. The uncompressed PCM master remains in ignored `out/tts/inside-barrow-opening.wav`. Full text, model revision, direction, seed, settings and SHA-256 are recorded in `inside-barrow-opening.json`.

The words are the room title and exact static LDESC from `reference/zork2/2dungeon.zil`, with whitespace normalized. Dynamic object descriptions are omitted so the clip does not claim that taken items are still on the ground. The model's upstream license is Apache-2.0; the source game text retains its existing provenance and notices.

Reproduction uses a separate local environment; no MLX package or model is bundled into the game:

```sh
uv venv --python 3.12 out/tts/.venv
uv pip install --python out/tts/.venv/bin/python -r tools/audio/requirements.txt
HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1 out/tts/.venv/bin/python tools/audio/generate-barrow.py --model /absolute/path/to/local/VoiceDesign/checkpoint
```

FFmpeg with libmp3lame must be available. Seeded generation records the recipe but does not guarantee byte-identical output across hardware/runtime changes. The MP3 URL is emitted by Vite so deployment base paths work.
