# Local MLX speech review for ZXR

Reviewed 2026-10-24 against upstream model cards, model repositories and MLX implementations. This is a capability/documentation review, not a listening comparison or benchmark on Mark's Mac mini. No models were downloaded or installed. Recommendations remain provisional until an audition.

## Recommendation

Start with Qwen3-TTS 12Hz **1.7B CustomVoice** through MLX Audio. Audition VoxCPM2 as the alternative for custom character casting and controllable voice cloning, and Chatterbox as the smaller expressive comparison. Render offline on Apple Silicon, select takes manually, and distribute ordinary audio clips to the browser/phone/headset. Real-time generation speed is therefore secondary to acting quality, consistent voices and exact spoken wording.

## Candidates

| Model | Useful controls | MLX route | Assessment for ZXR |
|---|---|---|---|
| Qwen3-TTS 1.7B CustomVoice / VoiceDesign | Named voices plus style/emotion instructions; separate model designs voices from descriptions | MLX Audio, converted BF16/8-bit checkpoints | First audition: documented acting directions and permissive Apache-2.0 weights |
| VoxCPM2, 2B | Voice design; reference voice plus emotion/pace guidance; continuation | MLX Audio, BF16/8-bit/4-bit | Strong second audition for the same character across emotional states; Apache-2.0 |
| Chatterbox, 0.5B English / Multilingual v3 | Reference voice; expressiveness/exaggeration and guidance controls | MLX Audio | Smaller comparison candidate; MIT. Exaggeration is not a named-emotion selector |
| IndexTTS2 | Independent voice and emotional reference; eight emotion strengths and text-based emotion guidance | Separate community MLX ports | Useful control-oriented experiment; upstream now also has 2.5, but reviewed MLX ports do not establish 2.5 parity. Upstream bilibili model license, not simply the port's MIT license |
| Fish Audio S2 Pro, about 4.5B | Inline emotion, delivery, pauses and nonverbal cues; reference voices | Separate fish-speech-mlx implementation and MLX checkpoints | Compelling audition for detailed delivery, but larger and under a research license; not my default dependency for the open-source project |
| Higgs TTS 3, 4B | Voice cloning and emotion/style/prosody/sound-effect control tokens | MLX Audio lists support | Another expressive comparison, but its model card identifies a research/non-commercial license; keep separate from permissive options |
| Kokoro, 82M | Preset voices and ordinary TTS controls | MLX Audio | Efficient narration/placeholder baseline; lower priority for nuanced character acting. Apache-2.0 |

Qwen's variants need care: **CustomVoice** selects preset speakers and supports style directions; **VoiceDesign** creates voices from descriptions; **Base** clones reference audio. The upstream table explicitly lists instruction control for the 1.7B CustomVoice and VoiceDesign models, but not the 0.6B variants or Base. Do not assume the smaller model or cloned Base voice provides identical emotional direction. For a new voice that must persist across scenes, test a designed reference followed by cloning, or a fixed CustomVoice speaker. Check that identity and expressive range survive the chosen workflow.

VoxCPM2's upstream supports reference cloning with style guidance; the reviewed MLX implementation accepts both `ref_audio` and `instruct`. Passing both reaches the reference-cloning branch with the instruction prepended to text. That establishes an implementation route, not proof of perceptual quality or full upstream parity. Verify with identical auditions.

Chatterbox's expressiveness parameter controls degree of expression, rather than selecting arbitrary emotions such as fear or sarcasm. Reference performance and wording still matter. Upstream Turbo supports nonverbal tags, but do not assume Turbo/Nano behavior exists in the reviewed MLX English/v3 implementation.

## Actor-level expectations

These models are plausible tools for short, directed game dialogue. None of the reviewed documentation establishes that it will replace a human actor's nuanced scene performance. Evaluate actual audio for emotional change, character consistency, pronunciation, intelligibility and exact wording. Whispering, anger or crying can reduce clarity or produce artifacts; small direction changes can shift voice identity.

Separate narrator prose from spoken character dialogue. For example, the princess's spoken thanks and her parents' worry can have a relieved but urgent delivery, while the surrounding account of her waking and standing belongs to the narrator. Keep the engine's source line unchanged; production metadata carries emotion, pauses and pronunciation notes. Fantasy names such as Frobozz need explicit audition checks.

## Proposed audition and production process

1. Choose 8–12 short source lines spanning princess, wizard, gnome, robot and narrator, plus difficult proper names. Keep the actual game text fixed.
2. Render each in neutral, relieved, afraid and angry delivery where those interpretations make sense. Generate three takes per setting. Compare Qwen 1.7B, VoxCPM2 and Chatterbox blind.
3. Rate believable delivery, voice identity, word accuracy, artifacts and pronunciation separately. Record wall time and peak memory on the actual Mac mini; do not transplant CUDA or M4 Max benchmark numbers to it.
4. Preserve a consistent voice/reference per character, model/checkpoint revision, runtime version, direction, generation parameters and seed when supported. A seed aids traceability but does not guarantee byte-identical output across runtime changes.
5. Retain WAV masters, select takes, apply modest loudness matching, then export browser-compatible delivery files. Use stable source-line identifiers for engine playback; a line can have separately reviewed emotional variants. Missing audio falls back to text.

Start with 8-bit Qwen 1.7B if memory is constrained; compare selected lines with BF16 before committing to a whole game's recording. Since this is offline production, accepting slower generation may be preferable to loss of vocal quality. This review does not claim a RAM requirement or generation speed for the unknown Mac mini configuration.

## Primary sources

- [MLX Audio supported models](https://github.com/Blaizzy/mlx-audio)
- [Qwen upstream model distinctions](https://github.com/QwenLM/Qwen3-TTS)
- [Qwen MLX generation methods](https://github.com/Blaizzy/mlx-audio/blob/main/mlx_audio/tts/models/qwen3_tts/README.md)
- [Qwen 1.7B CustomVoice 8-bit checkpoint](https://huggingface.co/mlx-community/Qwen3-TTS-12Hz-1.7B-CustomVoice-8bit)
- [VoxCPM2 upstream capabilities and license](https://github.com/OpenBMB/VoxCPM)
- [VoxCPM2 MLX implementation](https://github.com/Blaizzy/mlx-audio/blob/main/mlx_audio/tts/models/voxcpm2/voxcpm2.py)
- [Chatterbox upstream variants](https://github.com/resemble-ai/chatterbox)
- [Chatterbox MLX controls](https://github.com/Blaizzy/mlx-audio/blob/main/docs/models/tts/chatterbox.md)
- [IndexTTS upstream controls and license](https://github.com/index-tts/index-tts)
- [IndexTTS community MLX port](https://github.com/solar2ain/mlx-indextts)
- [Fish S2 Pro model card](https://huggingface.co/fishaudio/s2-pro)
- [Fish S2 Pro MLX port](https://github.com/gafiatulin/fish-speech-mlx)
- [Higgs TTS 3 model card and license](https://huggingface.co/bosonai/higgs-tts-3-4b)
- [Kokoro model card](https://huggingface.co/hexgrad/Kokoro-82M)
