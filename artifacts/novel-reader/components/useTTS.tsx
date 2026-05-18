import { useCallback, useRef, useState } from 'react';
import * as Speech from 'expo-speech';

export const useTTS = () => {
  const [isPlaying, setIsPlaying] = useState(false);
  const currentTextRef = useRef<string>('');
  const speechRef = useRef<Speech.Speech | null>(null);

  // Stop and fully cancel any ongoing speech
  const stop = useCallback(() => {
    if (Speech.isSpeakingAsync()) {
      Speech.stop();
    }
    setIsPlaying(false);
    currentTextRef.current = '';
  }, []);

  // Start speaking a given text
  const start = useCallback(async (text: string) => {
    // Stop any previous speech first
    stop();
    
    currentTextRef.current = text;
    setIsPlaying(true);

    try {
      await Speech.speak(text, {
        language: 'en-US',
        pitch: 1.0,
        rate: 0.9,
        onStart: () => setIsPlaying(true),
        onDone: () => {
          setIsPlaying(false);
          currentTextRef.current = '';
        },
        onError: (error) => {
          console.error('TTS error:', error);
          setIsPlaying(false);
          currentTextRef.current = '';
        },
        onStopped: () => {
          setIsPlaying(false);
          currentTextRef.current = '';
        },
      });
    } catch (err) {
      console.warn('TTS failed:', err);
      setIsPlaying(false);
    }
  }, [stop]);

  // Toggle: if playing, stop; else start with provided text
  const toggle = useCallback((text: string) => {
    if (isPlaying) {
      stop();
    } else {
      start(text);
    }
  }, [isPlaying, start, stop]);

  // Cleanup on unmount (important!)
  const cleanup = useCallback(() => {
    if (Speech.isSpeakingAsync()) {
      Speech.stop();
    }
    setIsPlaying(false);
  }, []);

  return { isPlaying, toggle, stop, cleanup };
};
