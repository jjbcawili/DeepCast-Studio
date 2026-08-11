from pathlib import Path

path = Path('app/studio/page.tsx')
text = path.read_text(encoding='utf-8')

replacements = [
    (
        'const ACTIVE_GENERATION_JOB_KEY = "deepcast.active-generation-job.v1";\n',
        'const ACTIVE_GENERATION_JOB_KEY = "deepcast.active-generation-job.v1";\nconst REFERENCE_TTS_ENGINES = new Set<HostVoiceSettings["ttsEngine"]>(["chatterbox-nano", "chatterbox-turbo", "f5-tts", "fish-s2", "dia2"]);\n',
    ),
    (
        '      ttsEngine: "chatterbox-nano",\n    },\n    sharpay: {',
        '      ttsEngine: "chatterbox-nano",\n      orpheusVoice: "daniel",\n    },\n    sharpay: {',
    ),
    (
        '      ttsEngine: "chatterbox-nano",\n    },\n  });',
        '      ttsEngine: "chatterbox-nano",\n      orpheusVoice: "hannah",\n    },\n  });',
    ),
    (
        '    for (const [label, settings] of [[jiroName, hostSettings.jiro], [sharpayName, hostSettings.sharpay]] as const) {\n      if (settings.ttsEngine !== "gemini" && !settings.voiceReferenceKey) {\n        setNotice(`Upload a clean voice reference for ${label} before using Chatterbox.`);\n        return;\n      }\n    }',
        '    for (const [label, settings] of [[jiroName, hostSettings.jiro], [sharpayName, hostSettings.sharpay]] as const) {\n      if (REFERENCE_TTS_ENGINES.has(settings.ttsEngine) && !settings.voiceReferenceKey) {\n        setNotice(`Upload a clean voice reference for ${label} before using ${settings.ttsEngine}.`);\n        return;\n      }\n    }',
    ),
    (
        '          jiroVoice: hostSettings.jiro.voice, sharpayVoice: hostSettings.sharpay.voice,',
        '          jiroVoice: hostSettings.jiro.ttsEngine === "groq-orpheus" ? (hostSettings.jiro.orpheusVoice || "daniel") : hostSettings.jiro.voice,\n          sharpayVoice: hostSettings.sharpay.ttsEngine === "groq-orpheus" ? (hostSettings.sharpay.orpheusVoice || "hannah") : hostSettings.sharpay.voice,',
    ),
    (
        '          jiroVoiceReferenceKey: hostSettings.jiro.voiceReferenceKey, sharpayVoiceReferenceKey: hostSettings.sharpay.voiceReferenceKey,',
        '          jiroVoiceReferenceKey: hostSettings.jiro.voiceReferenceKey, sharpayVoiceReferenceKey: hostSettings.sharpay.voiceReferenceKey,\n          jiroVoiceReferenceText: hostSettings.jiro.voiceReferenceText, sharpayVoiceReferenceText: hostSettings.sharpay.voiceReferenceText,',
    ),
]

for old, new in replacements:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'Expected exactly one match, found {count}: {old[:120]!r}')
    text = text.replace(old, new, 1)

path.write_text(text, encoding='utf-8')
print('Ported multi-engine settings into active app/studio/page.tsx')
