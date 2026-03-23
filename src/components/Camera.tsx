import React, { useRef, useCallback, useState, useEffect } from 'react';
import { Camera as CameraIcon, RefreshCw, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface CameraProps {
  onCapture: (base64: string) => void;
  isProcessing: boolean;
}

export const Camera: React.FC<CameraProps> = ({ onCapture, isProcessing }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [isCameraReady, setIsCameraReady] = useState(false);

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setIsCameraReady(true);
        setError(null);
      }
    } catch (err) {
      console.error('Error accessing camera:', err);
      setError('Camera access denied. Please enable camera permissions.');
    }
  }, []);

  useEffect(() => {
    startCamera();
    return () => {
      if (videoRef.current?.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [startCamera]);

  const captureFrame = useCallback(() => {
    if (!videoRef.current || !canvasRef.current || isProcessing) return;

    const canvas = canvasRef.current;
    const video = videoRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0);
      const base64 = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
      onCapture(base64);
    }
  }, [onCapture, isProcessing]);

  return (
    <div className="relative w-full h-full bg-black overflow-hidden flex flex-col items-center justify-center">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="absolute inset-0 w-full h-full object-cover"
      />
      <canvas ref={canvasRef} className="hidden" />

      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="absolute top-4 left-4 right-4 bg-red-500/90 text-white p-4 rounded-xl flex items-center gap-3 z-50"
          >
            <AlertCircle className="shrink-0" />
            <p className="text-sm font-medium">{error}</p>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="absolute bottom-12 flex flex-col items-center gap-6 w-full px-6">
        <button
          onClick={captureFrame}
          disabled={!isCameraReady || isProcessing}
          className={cn(
            "w-24 h-24 rounded-full border-4 border-white flex items-center justify-center transition-all active:scale-90",
            isProcessing ? "bg-white/20 animate-pulse" : "bg-white/10 hover:bg-white/20"
          )}
          aria-label="Analyze environment"
        >
          {isProcessing ? (
            <RefreshCw className="w-10 h-10 text-white animate-spin" />
          ) : (
            <CameraIcon className="w-10 h-10 text-white" />
          )}
        </button>
        <p className="text-white/70 text-sm font-medium tracking-wide uppercase">
          {isProcessing ? "Analyzing..." : "Tap to scan"}
        </p>
      </div>
    </div>
  );
};
