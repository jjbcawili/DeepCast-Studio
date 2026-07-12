import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));

  // Helper to wait
  const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

  app.post('/api/generate-podcast', async (req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    const sendEvent = (event: string, data: any) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      const { sourceMaterial, topic, length, customPrompt, host1Profile, host2Profile } = req.body;
      const apiKey = process.env.GEMINI_API_KEY;
      
      if (!apiKey) {
        throw new Error("GEMINI_API_KEY environment variable is required");
      }

      const ai = new GoogleGenAI({ 
        apiKey,
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
      });

      // Determine segments based on length
      let numSegments = 2; // Default to 5 minutes
      if (length === '15') numSegments = 5;
      if (length === '30') numSegments = 10;
      if (length === '45') numSegments = 15;
      if (length === '60') numSegments = 20;

      sendEvent('progress', { message: 'Generating podcast outline...' });

      const outlinePrompt = `You are a podcast producer outlining an audio overview.
Source material: ${sourceMaterial || 'General knowledge'}
Focus/Topic: ${topic || 'Pop culture and entertainment'}
Target length: ~${length} minutes.

Create an outline divided into exactly ${numSegments} continuous segments. 
Return ONLY a valid JSON array of strings, where each string describes what will be discussed in that segment. Do not include markdown formatting or backticks around the JSON.`;

      const outlineResponse = await ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: outlinePrompt,
      });

      let outlineText = outlineResponse.text || '[]';
      outlineText = outlineText.replace(/```json/g, '').replace(/```/g, '').trim();
      let segments = [];
      try {
        segments = JSON.parse(outlineText);
      } catch (e) {
        console.error("Failed to parse outline JSON:", outlineText);
        // Fallback
        for(let i=0; i<numSegments; i++) {
          segments.push(`Segment ${i+1}: Deep dive into the topic.`);
        }
      }

      sendEvent('outline', { segments });

      let previousContext = "";

      for (let i = 0; i < segments.length; i++) {
        sendEvent('progress', { message: `Writing script for segment ${i + 1} of ${segments.length}...` });
        
        const defaultHost1 = 'Jiro: warm, witty, organized male host who keeps the timeline, release details, and source evidence clear.';
        const defaultHost2 = 'Sharpay: theatrical, slightly nasal, diva-like female host with playful “main character” energy; funny, expressive, a little savage, but respectful and accurate.';
        const host1Persona = host1Profile || defaultHost1;
        const host2Persona = host2Profile || defaultHost2;

        const scriptPrompt = `You are an expert podcast scriptwriter writing Segment ${i + 1} of ${segments.length}.
Segment Topic: ${segments[i]}
Overall Focus: ${topic || 'Pop culture and entertainment'}
${customPrompt ? `Specific Instructions/Focus: ${customPrompt}` : ''}

The podcast features two distinct hosts with a dynamic, highly engaging conversational style:
Host1 (Jiro): ${host1Persona}
Host2 (Sharpay): ${host2Persona}

Their dynamic: Playful tension. Jiro grounds the conversation with timeline and facts, while Sharpay elevates it with passionate, theatrical energy. They constantly banter, interrupt each other playfully, and sound exactly like a high-quality, immersive deep-dive podcast.

${previousContext ? `Previous context for continuity:\n${previousContext}\n\nContinue the conversation naturally from here.` : 'This is the start of the podcast. Introduce the topic and hook the listener.'}

FORMAT EXACTLY AS FOLLOWS (this is critical for the TTS engine):
Host1: [Jiro's dialogue]
Host2: [Sharpay's dialogue]

Do not include any sound effects, stage directions, or other text. Just the spoken dialogue alternating between Host1 and Host2. Aim for around 300-400 words for this segment.`;

        const scriptResponse = await ai.models.generateContent({
          model: 'gemini-3.5-flash',
          contents: scriptPrompt,
        });

        const scriptText = scriptResponse.text;
        
        // Save some context for next segment
        previousContext = scriptText.substring(Math.max(0, scriptText.length - 200));

        sendEvent('progress', { message: `Generating audio for segment ${i + 1} of ${segments.length}...` });
        
        // Generate Audio for this segment
        const audioResponse = await ai.models.generateContent({
          model: "gemini-3.1-flash-tts-preview",
          contents: [{ parts: [{ text: scriptText }] }],
          config: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              multiSpeakerVoiceConfig: {
                speakerVoiceConfigs: [
                  {
                    speaker: 'Host1',
                    voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } }
                  },
                  {
                    speaker: 'Host2',
                    voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } }
                  }
                ]
              }
            }
          }
        });

        const base64Audio = audioResponse.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        
        if (base64Audio) {
          sendEvent('audio_chunk', { index: i, audio: base64Audio, transcript: scriptText });
        }
        
        // Small delay to prevent hitting rate limits too fast
        await delay(1000);
      }

      sendEvent('done', { message: 'Podcast generation complete!' });
    } catch (error: any) {
      console.error(error);
      sendEvent('error', { message: error.message || 'An error occurred during generation' });
    } finally {
      res.end();
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
