import React, { useState, useCallback, useRef } from 'react';
import { Camera } from './components/Camera';
import { analyzeEnvironment, textToSpeech } from './services/gemini';
import { motion, AnimatePresence } from 'motion/react';
import { Volume2, Eye, ShieldAlert, Navigation, Type } from 'lucide-react';

export default function App() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [description, setDescription] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const handleCapture = useCallback(async (base64: string) => {
    setIsProcessing(true);
    try {
      // 1. Analyze environment
      const text = await analyzeEnvironment(base64);
      setDescription(text);

      // 2. Generate and play audio
      if (text) {
        const audioData = await textToSpeech(text);
        if (audioData) {
          const audioBlob = new Blob(
            [Uint8Array.from(atob(audioData), c => c.charCodeAt(0))],
            { type: 'audio/mp3' }
          );
          const url = URL.createObjectURL(audioBlob);
          
          if (audioRef.current) {
            audioRef.current.src = url;
            audioRef.current.play();
          } else {
            const audio = new Audio(url);
            audioRef.current = audio;
            audio.play();
          }
        }
      }
    } catch (error) {
      console.error('Error processing environment:', error);
    } finally {
      setIsProcessing(false);
    }
  }, []);

  return (
    <div className="fixed inset-0 bg-black flex flex-col font-sans selection:bg-emerald-500/30">
      {/* Header */}
      <header className="absolute top-0 left-0 right-0 z-10 p-6 bg-gradient-to-b from-black/80 to-transparent">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-emerald-500 rounded-lg flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <Eye className="text-black w-6 h-6" />
            </div>
            <div>
              <h1 className="text-white font-bold text-xl tracking-tight">NeuralSight</h1>
              <p className="text-emerald-400 text-[10px] font-bold uppercase tracking-widest">AI Spatial Navigator</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1 bg-white/10 px-3 py-1.5 rounded-full border border-white/10">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-white/80 text-[10px] font-bold uppercase tracking-wider">Live</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Viewport */}
      <main className="flex-1 relative">
        <Camera onCapture={handleCapture} isProcessing={isProcessing} />
      </main>

      {/* Results Overlay */}
      <AnimatePresence>
        {description && (
          <motion.div
            initial={{ opacity: 0, y: 100 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 100 }}
            className="absolute bottom-32 left-4 right-4 z-20"
          >
            <div className="bg-zinc-900/90 backdrop-blur-xl border border-white/10 rounded-2xl p-5 shadow-2xl">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
                  <Volume2 className="text-emerald-400 w-5 h-5" />
                </div>
                <div className="flex-1 space-y-3">
                  <p className="text-white text-lg font-medium leading-snug">
                    {description}
                  </p>
                  
                  {/* Visual cues for what the AI is doing */}
                  <div className="flex flex-wrap gap-2 pt-2">
                    <Badge icon={<ShieldAlert className="w-3 h-3" />} label="Hazards" />
                    <Badge icon={<Navigation className="w-3 h-3" />} label="Spatial" />
                    <Badge icon={<Type className="w-3 h-3" />} label="OCR" />
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer Instructions */}
      <footer className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black/80 to-transparent pointer-events-none">
        <p className="text-white/40 text-center text-xs font-medium uppercase tracking-[0.2em]">
          Optimized for high-precision navigation
        </p>
      </footer>
    </div>
  );
}

function Badge({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-1.5 bg-white/5 border border-white/10 px-2.5 py-1 rounded-md">
      <span className="text-emerald-400">{icon}</span>
      <span className="text-white/50 text-[10px] font-bold uppercase tracking-wider">{label}</span>
    </div>
  );
}

