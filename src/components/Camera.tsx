import React, { useRef, useCallback, useState, useEffect, useImperativeHandle, forwardRef } from 'react';
import { Camera as CameraIcon, CameraOff, RefreshCw, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface CameraProps {
  onCapture: (base64: string) => void;
  isProcessing: boolean;
  autoScanEnabled?: boolean;
}

export interface CameraHandle {
  capture: () => void;
}

export const Camera = forwardRef<CameraHandle, CameraProps>(({ onCapture, isProcessing, autoScanEnabled }, ref) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(true);

  const stopCamera = useCallback(() => {
    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
      setIsCameraReady(false);
    }
  }, []);

  const startCamera = useCallback(async () => {
    if (!isCameraOn) return;
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
  }, [isCameraOn]);

  useEffect(() => {
    if (isCameraOn) {
      startCamera();
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [isCameraOn, startCamera, stopCamera]);

  const toggleCamera = useCallback(() => {
    setIsCameraOn(prev => !prev);
  }, []);

  const captureFrame = useCallback(() => {
    if (!videoRef.current || !canvasRef.current || isProcessing) return;

    const canvas = canvasRef.current;
    const video = videoRef.current;
    
    // Cap resolution for faster processing (max 640 width)
    const maxWidth = 640;
    const scale = Math.min(1, maxWidth / video.videoWidth);
    canvas.width = video.videoWidth * scale;
    canvas.height = video.videoHeight * scale;
    
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const base64 = canvas.toDataURL('image/jpeg', 0.7).split(',')[1];
      onCapture(base64);
    }
  }, [onCapture, isProcessing]);

  useImperativeHandle(ref, () => ({
    capture: captureFrame
  }));

  const lastFrameRef = useRef<ImageData | null>(null);

  const detectMotion = useCallback((ctx: CanvasRenderingContext2D, width: number, height: number) => {
    const currentFrame = ctx.getImageData(0, 0, width, height);
    if (lastFrameRef.current) {
      let diff = 0;
      const data1 = lastFrameRef.current.data;
      const data2 = currentFrame.data;
      // Sample pixels to save performance
      for (let i = 0; i < data1.length; i += 40) {
        diff += Math.abs(data1[i] - data2[i]); // Red
        diff += Math.abs(data1[i+1] - data2[i+1]); // Green
        diff += Math.abs(data1[i+2] - data2[i+2]); // Blue
      }
      
      const threshold = (width * height * 3) * 0.05; // 5% change threshold
      if (diff > threshold) {
        console.log('Motion detected, diff:', diff);
        return true;
      }
    }
    lastFrameRef.current = currentFrame;
    return false;
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      if (!videoRef.current || !canvasRef.current || isProcessing || !autoScanEnabled) return;
      
      const canvas = canvasRef.current;
      const video = videoRef.current;
      // Use a small resolution for motion detection
      const motionWidth = 64;
      const motionHeight = 48;
      canvas.width = motionWidth;
      canvas.height = motionHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, motionWidth, motionHeight);
        if (detectMotion(ctx, motionWidth, motionHeight)) {
          // Trigger a high-res capture if motion detected
          captureFrame();
        }
      }
    }, 2000); // Check for motion every 2 seconds
    
    return () => clearInterval(interval);
  }, [isProcessing, detectMotion, captureFrame]);

  return (
    <div className="relative w-full h-full bg-hw-bg overflow-hidden flex flex-col items-center justify-center">
      {/* Video Feed with Sensor Processing */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="absolute inset-0 w-full h-full object-cover opacity-70 grayscale contrast-125 brightness-110"
      />
      
      {/* Sensor Overlays */}
      <div className="absolute inset-0 pointer-events-none">
        {/* Heavy Vignette */}
        <div className="absolute inset-0 shadow-[inset_0_0_150px_rgba(0,0,0,0.95)]" />
        
        {/* Scanlines */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_2px,3px_100%]" />
        
        {/* Digital Noise / Static */}
        <div className="absolute inset-0 opacity-[0.04] pointer-events-none mix-blend-overlay" style={{ backgroundImage: 'url("https://grainy-gradients.vercel.app/noise.svg")' }} />
        
        {/* Corner Accents */}
        <div className="absolute top-4 left-4 w-6 h-6 border-t-2 border-l-2 border-hw-accent/40" />
        <div className="absolute top-4 right-4 w-6 h-6 border-t-2 border-r-2 border-hw-accent/40" />
        <div className="absolute bottom-4 left-4 w-6 h-6 border-b-2 border-l-2 border-hw-accent/40" />
        <div className="absolute bottom-4 right-4 w-6 h-6 border-b-2 border-r-2 border-hw-accent/40" />
      </div>

      <canvas ref={canvasRef} className="hidden" />

      {/* Scanning Overlay Grid */}
      <div className="absolute inset-0 pointer-events-none opacity-20">
        <div className="w-full h-full border-[0.5px] border-hw-accent/30 grid grid-cols-3 grid-rows-3">
          {[...Array(9)].map((_, i) => (
            <div key={i} className="border-[0.5px] border-hw-accent/20" />
          ))}
        </div>
      </div>

      <AnimatePresence>
        {!isCameraOn && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-hw-bg flex flex-col items-center justify-center z-10"
          >
            <CameraOff className="w-16 h-16 text-hw-accent/20 mb-4" />
            <p className="text-hw-accent/40 font-mono text-xs uppercase tracking-widest">System Offline</p>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="absolute top-4 left-4 right-4 bg-hw-hazard/90 text-white p-4 rounded-xl flex items-center gap-3 z-50 hw-hazard-glow"
          >
            <AlertCircle className="shrink-0" />
            <p className="text-sm font-medium">{error}</p>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="absolute top-24 right-6 z-30">
        <button
          onClick={toggleCamera}
          className="w-12 h-12 rounded-full hw-glass flex items-center justify-center text-white transition-all active:scale-90 hover:text-hw-accent"
          aria-label={isCameraOn ? "Turn camera off" : "Turn camera on"}
        >
          {isCameraOn ? <CameraIcon className="w-5 h-5" /> : <CameraOff className="w-5 h-5 text-hw-hazard" />}
        </button>
      </div>

      <div className="absolute bottom-12 flex flex-col items-center gap-6 w-full px-6">
        <div className="relative">
          {isProcessing && (
            <motion.div 
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1.2, opacity: 1 }}
              className="absolute inset-0 rounded-full bg-hw-accent/20 blur-xl"
            />
          )}
          <button
            onClick={captureFrame}
            disabled={!isCameraReady || isProcessing}
            className={cn(
              "w-24 h-24 rounded-full border-2 flex items-center justify-center transition-all active:scale-90 relative z-10",
              isProcessing 
                ? "border-hw-accent bg-hw-accent/20 hw-glow" 
                : "border-white/40 bg-white/5 hover:border-hw-accent hover:bg-hw-accent/10"
            )}
            aria-label="Analyze environment"
          >
            {isProcessing ? (
              <RefreshCw className="w-10 h-10 text-hw-accent animate-spin" />
            ) : (
              <CameraIcon className="w-10 h-10 text-white" />
            )}
          </button>
        </div>
        <p className="text-hw-accent/70 text-[10px] font-mono uppercase tracking-[0.3em]">
          {isProcessing ? "Processing Data..." : "Manual Scan Trigger"}
        </p>
      </div>
    </div>
  );
});
