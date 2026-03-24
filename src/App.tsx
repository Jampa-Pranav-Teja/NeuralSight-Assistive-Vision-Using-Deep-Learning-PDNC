import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Camera, CameraHandle } from './components/Camera';
import { analyzeEnvironment, textToSpeech, EnvironmentAnalysis, neuralAssistantQuery } from './services/gemini';
import { auth, signIn, savePerson, getKnownPeople, KnownPerson, saveEmergencyContact, getEmergencyContact, EmergencyContact, saveChatMessage, getConversationHistory, updatePerson, deletePerson } from './firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { motion, AnimatePresence } from 'motion/react';
import { Volume2, Eye, ShieldAlert, Navigation, Type, UserPlus, LogIn, User as UserIcon, Mic, MicOff, RefreshCw, PhoneCall, Settings, X, Save, Send, HelpCircle, Users, Trash2, Edit2, Check } from 'lucide-react';

type ConversationState = 'IDLE' | 'AWAITING_SAVE_DECISION' | 'AWAITING_NAME_INPUT' | 'AWAITING_SPELLING_CONFIRMATION' | 'NEURAL_ASSISTANT';

export default function App() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [analysis, setAnalysis] = useState<EnvironmentAnalysis | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [knownPeople, setKnownPeople] = useState<KnownPerson[]>([]);
  const [namingPerson, setNamingPerson] = useState<{ visualDescription: string } | null>(null);
  const [newName, setNewName] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [lastTranscript, setLastTranscript] = useState('');
  const [conversationState, _setConversationState] = useState<ConversationState>('IDLE');
  const conversationStateRef = useRef<ConversationState>('IDLE');

  const setConversationState = (state: ConversationState) => {
    _setConversationState(state);
    conversationStateRef.current = state;
  };
  const [pendingPerson, setPendingPerson] = useState<{ visualDescription: string } | null>(null);
  const [pendingName, setPendingName] = useState('');
  const [isProcessingVoice, setIsProcessingVoice] = useState(false);
  const [isBurstMode, setIsBurstMode] = useState(false);
  const [burstEndTime, setBurstEndTime] = useState<number | null>(null);
  const [autoScanEnabled, setAutoScanEnabled] = useState(false);
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);
  const pendingQuestionRef = useRef<string | null>(null);
  const [assistantActive, setAssistantActive] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  
  const [emergencyContact, setEmergencyContact] = useState<EmergencyContact | null>(null);
  const [showEmergencySettings, setShowEmergencySettings] = useState(false);
  const [showManagePeople, setShowManagePeople] = useState(false);
  const [editingPerson, setEditingPerson] = useState<KnownPerson | null>(null);
  const [editName, setEditName] = useState('');
  const [showCommands, setShowCommands] = useState(false);
  const [voiceEngine, setVoiceEngine] = useState<'gemini' | 'browser'>('gemini');
  const [quotaExceeded, setQuotaExceeded] = useState(false);
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [telegramToken, setTelegramToken] = useState('');
  const [telegramChatId, setTelegramChatId] = useState('');
  
  const isProcessingVoiceRef = useRef(false);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const isListeningRef = useRef(isListening);
  const recognitionRef = useRef<any>(null);
  const handleVoiceInputRef = useRef<any>(null);
  const cameraRef = useRef<CameraHandle>(null);

  // Initialize Speech Recognition
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event: any) => {
      let interimTranscript = '';
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        } else {
          interimTranscript += event.results[i][0].transcript;
        }
      }

      if (finalTranscript) {
        const transcript = finalTranscript.toLowerCase().trim();
        console.log('Final speech recognized:', transcript);
        setLastTranscript(transcript);
        handleVoiceInputRef.current?.(transcript);
      } else if (interimTranscript) {
        setLastTranscript(interimTranscript.toLowerCase().trim());
      }
    };

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      
      if (event.error === 'network') {
        console.warn('Network error in speech recognition. Attempting to recover...');
        // We don't stop listening, we let onend handle the restart
      } else if (event.error === 'not-allowed') {
        speak("Microphone access was denied. Please check your browser permissions.");
        setIsListening(false);
      } else if (event.error === 'no-speech') {
        // Normal, will restart in onend
      } else if (event.error === 'aborted') {
        // Usually means we called .stop()
      } else {
        console.warn(`Speech recognition error: ${event.error}`);
      }
    };

    recognition.onend = () => {
      // Use a ref to check the latest state of isListening
      if (isListeningRef.current) {
        try {
          // Small delay to prevent rapid-fire restarts
          setTimeout(() => {
            if (isListeningRef.current && recognitionRef.current) {
              try {
                recognitionRef.current.start();
              } catch (e) {
                // Already started, ignore
              }
            }
          }, 1000);
        } catch (e) {
          console.error('Failed to restart speech recognition:', e);
        }
      }
    };

    recognitionRef.current = recognition;

    // Cleanup
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.onend = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.stop();
      }
    };
  }, []);

  // Sync isListening state to ref for onend callback
  useEffect(() => {
    isListeningRef.current = isListening;
    if (isListening && recognitionRef.current) {
      try {
        recognitionRef.current.start();
      } catch (e) {
        // Already started
      }
    } else if (!isListening && recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {
        // Already stopped
      }
    }
  }, [isListening]);

  const toggleListening = () => {
    setIsListening(!isListening);
  };

  const playHazardBeep = () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    }
    const ctx = audioContextRef.current;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.1);
    
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.start();
    osc.stop(ctx.currentTime + 0.2);
  };

  const stopSpeaking = () => {
    if (audioSourceRef.current) {
      try {
        audioSourceRef.current.stop();
        audioSourceRef.current = null;
      } catch (e) {}
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  };

  const speak = async (text: string, useFastMode = false) => {
    // Stop any current speech before starting new one
    stopSpeaking();

    // If browser speech is explicitly requested or Gemini quota is known to be exceeded
    if (voiceEngine === 'browser' || quotaExceeded || (useFastMode && typeof window !== 'undefined' && 'SpeechSynthesisUtterance' in window)) {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        const utterance = new window.SpeechSynthesisUtterance(text);
        utterance.rate = 1.1;
        window.speechSynthesis.speak(utterance);
      }
      return;
    }

    try {
      const audioData = await textToSpeech(text);
      if (audioData) {
        if (!audioContextRef.current) {
          audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        }
        
        const audioContext = audioContextRef.current;
        
        if (audioSourceRef.current) {
          try {
            audioSourceRef.current.stop();
          } catch (e) {}
        }

        const binaryString = atob(audioData);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        
        const int16Array = new Int16Array(bytes.buffer);
        const float32Array = new Float32Array(int16Array.length);
        for (let i = 0; i < int16Array.length; i++) {
          float32Array[i] = int16Array[i] / 32768.0;
        }
        
        const audioBuffer = audioContext.createBuffer(1, float32Array.length, 24000);
        audioBuffer.getChannelData(0).set(float32Array);
        
        const source = audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioContext.destination);
        audioSourceRef.current = source;
        source.start();
      } else {
        throw new Error('No audio data received');
      }
    } catch (error: any) {
      const isQuotaError = error?.message?.includes('RESOURCE_EXHAUSTED') || 
                          error?.status === 'RESOURCE_EXHAUSTED' ||
                          (typeof error === 'string' && error.includes('RESOURCE_EXHAUSTED'));

      if (isQuotaError) {
        console.warn('Gemini TTS quota exceeded. Switching to browser speech for this session.');
        setQuotaExceeded(true);
      } else {
        console.error('Error in TTS, falling back to browser speech:', error);
      }

      // Fallback to browser speech if Gemini TTS fails (e.g. quota exceeded)
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        const utterance = new window.SpeechSynthesisUtterance(text);
        utterance.rate = 1.0;
        window.speechSynthesis.speak(utterance);
      }
    }
  };

  const sendTelegramMessage = async (text: string) => {
    if (!emergencyContact?.telegramToken || !emergencyContact?.telegramChatId) {
      speak("Telegram bot not configured. Please add your token and chat ID in settings.");
      setShowEmergencySettings(true);
      return false;
    }

    try {
      const telegramUrl = `https://api.telegram.org/bot${emergencyContact.telegramToken}/sendMessage`;
      const response = await fetch(telegramUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: emergencyContact.telegramChatId,
          text: text,
        }),
      });
      return response.ok;
    } catch (error) {
      console.error("Telegram error:", error);
      return false;
    }
  };

  const handleSOS = async () => {
    if (!emergencyContact) {
      speak("No emergency contact set. Please configure one in settings.");
      setShowEmergencySettings(true);
      return;
    }

    speak("Initiating SOS. Getting your location.");
    
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(async (position) => {
        const { latitude, longitude } = position.coords;
        const mapsUrl = `https://www.google.com/maps?q=${latitude},${longitude}`;
        const message = `EMERGENCY SOS from NeuralSight. I need help. My location: ${mapsUrl}`;
        
        const success = await sendTelegramMessage(message);
        if (success) {
          speak("Telegram alert transmitted successfully.");
        } else {
          speak("Telegram transmission failed. Please check your bot settings.");
        }
      }, async (error) => {
        console.error("Geolocation error:", error);
        speak("Could not get location. Sending SOS without coordinates.");
        
        const message = `EMERGENCY SOS from NeuralSight. I need help. (Location unavailable)`;
        const success = await sendTelegramMessage(message);
        if (success) {
          speak("Telegram alert transmitted successfully.");
        } else {
          speak("Telegram transmission failed.");
        }
      }, { timeout: 5000 });
    } else {
      const message = `EMERGENCY SOS from NeuralSight. I need help. (Geolocation unsupported)`;
      const success = await sendTelegramMessage(message);
      if (success) {
        speak("Telegram alert transmitted successfully.");
      } else {
        speak("Telegram transmission failed.");
      }
    }
  };

  const handleVoiceInput = async (transcript: string) => {
    if (isProcessingVoiceRef.current) return;
    const currentState = conversationStateRef.current;
    console.log('Handling voice input in state:', currentState, 'Transcript:', transcript);
    
    switch (currentState) {
      case 'IDLE':
        if (transcript.includes('activate neural assistant')) {
          setConversationState('NEURAL_ASSISTANT');
          setAssistantActive(true);
          const name = user?.displayName ? `, ${user.displayName.split(' ')[0]}` : '';
          speak(`Neural Assistant activated. How can I help you${name}?`);
        } else if (transcript === 'scan' || transcript === 'capture' || transcript === 'look') {
          cameraRef.current?.capture();
        } else if (transcript.includes('sos') || transcript.includes('emergency') || transcript.includes('help me')) {
          handleSOS();
        } else if (transcript === 'help' || transcript === 'commands' || transcript === 'voice protocol') {
          setShowCommands(true);
          speak("Opening voice protocol reference.");
        } else if (transcript === 'stop' || transcript === 'deactivate') {
          stopSpeaking();
          if (isBurstMode || autoScanEnabled) {
            setIsBurstMode(false);
            setBurstEndTime(null);
            setAutoScanEnabled(false);
            speak("All active scanning modes deactivated.");
          } else {
            speak("No active scanning modes to stop.");
          }
        } else if (transcript === 'auto' || transcript === 'continuous') {
          setAutoScanEnabled(!autoScanEnabled);
          speak(autoScanEnabled ? "Auto scan disabled." : "Auto scan enabled.");
        } else if (transcript === 'burst') {
          setIsBurstMode(true);
          setBurstEndTime(Date.now() + 30 * 1000);
          speak("Starting 30 second burst scan.");
          cameraRef.current?.capture();
        } else if (transcript.includes('burst scan')) {
          const minutesMatch = transcript.match(/(\d+)\s*minutes?/);
          const minutes = minutesMatch ? parseInt(minutesMatch[1]) : 1;
          setIsBurstMode(true);
          setBurstEndTime(Date.now() + minutes * 60 * 1000);
          speak(`Starting burst scan for ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}.`);
          cameraRef.current?.capture();
        } else if (transcript.includes('stop burst')) {
          setIsBurstMode(false);
          setBurstEndTime(null);
          speak("Burst scan stopped.");
        } else if (transcript.includes('enable auto scan') || transcript.includes('start auto scan') || transcript.includes('continuous mode')) {
          setAutoScanEnabled(true);
          speak("Auto scan enabled. I will scan periodically.");
        } else if (transcript.includes('disable auto scan') || transcript.includes('stop auto scan') || transcript.includes('stop continuous')) {
          setAutoScanEnabled(false);
          speak("Auto scan disabled.");
        } else if (transcript.includes('change') && transcript.includes('name to')) {
          // Command: "change [OldName]'s name to [NewName]"
          const match = transcript.match(/change (.+?)(?:'s)? name to (.+)/i);
          if (match) {
            const oldName = match[1].trim();
            const newName = match[2].trim();
            const person = knownPeople.find(p => p.name.toLowerCase() === oldName.toLowerCase());
            if (person && person.id) {
              setIsProcessingVoice(true);
              isProcessingVoiceRef.current = true;
              try {
                await updatePerson(person.id, newName);
                loadKnownPeople();
                speak(`Updated ${oldName}'s name to ${newName}.`);
              } catch (error) {
                console.error('Error updating name via voice:', error);
                speak(`Sorry, I couldn't change the name.`);
              } finally {
                setIsProcessingVoice(false);
                isProcessingVoiceRef.current = false;
              }
            } else {
              speak(`I don't know anyone named ${oldName}.`);
            }
          }
        } else if (transcript.startsWith('call ')) {
          const number = transcript.substring(5).replace(/\s/g, '');
          if (number) {
            speak(`Opening dialer for ${number}.`);
            window.location.href = `tel:${number}`;
          }
        } else if (transcript.startsWith('message saying ')) {
          let message = transcript.substring(15).trim();
          // Specific mapping requested by user: "I am almost here" -> "I am here"
          if (message.toLowerCase() === 'i am almost here') {
            message = 'I am here';
          }
          
          if (message) {
            speak(`Transmitting message: ${message}`);
            const success = await sendTelegramMessage(message);
            if (success) {
              speak("Message sent successfully.");
            } else {
              speak("Failed to send message.");
            }
          }
        } else if (
          transcript.startsWith('ask ') || 
          transcript.startsWith('what') || 
          transcript.startsWith('how') || 
          transcript.startsWith('is there') || 
          transcript.startsWith('who') || 
          transcript.startsWith('where') || 
          transcript.startsWith('can you') || 
          transcript.startsWith('tell me') || 
          transcript.length > 12
        ) {
          // Treat as a question
          const question = transcript.startsWith('ask ') ? transcript.substring(4) : transcript;
          setPendingQuestion(question);
          pendingQuestionRef.current = question;
          cameraRef.current?.capture();
        }
        break;

      case 'NEURAL_ASSISTANT':
        if (transcript === 'stop') {
          stopSpeaking();
          break;
        }
        if (transcript.includes('deactivate') || transcript.includes('exit assistant') || transcript.includes('stop assistant')) {
          setConversationState('IDLE');
          setAssistantActive(false);
          speak("Neural Assistant deactivated.");
        } else if (transcript.includes('what time') || transcript.includes('the time')) {
          const now = new Date();
          const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          speak(`The current time is ${timeStr}.`);
        } else {
          setIsProcessingVoice(true);
          isProcessingVoiceRef.current = true;
          
          // Get location if possible
          let location: { lat: number, lng: number } | undefined;
          if (navigator.geolocation) {
            try {
              const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 });
              });
              location = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            } catch (e) {
              console.warn("Could not get location for assistant:", e);
            }
          }

          try {
            const history = await getConversationHistory(10);
            const answer = await neuralAssistantQuery(transcript, location, user?.displayName || undefined, history);
            
            await saveChatMessage('user', transcript);
            await saveChatMessage('model', answer);
            
            speak(answer);
          } catch (error) {
            console.error("Assistant query error:", error);
            speak("I'm not sure, I'm having trouble connecting to my neural network right now.");
          } finally {
            setIsProcessingVoice(false);
            isProcessingVoiceRef.current = false;
          }
        }
        break;

      case 'AWAITING_SAVE_DECISION':
        if (transcript === 'stop') {
          stopSpeaking();
          setConversationState('IDLE');
          setPendingPerson(null);
          break;
        }
        if (transcript.includes('yes') || transcript.includes('yeah') || transcript.includes('save') || transcript.includes('sure')) {
          setIsProcessingVoice(true);
          isProcessingVoiceRef.current = true;
          // Try to extract name if provided in the same sentence
          const nameMatch = transcript.match(/(?:save|name) (?:him|her|them|person) as (.+)/i) || 
                           transcript.match(/as (.+)/i) ||
                           transcript.match(/is (.+)/i);
          
          if (nameMatch) {
            const name = nameMatch[1].trim();
            confirmName(name);
          } else {
            setConversationState('AWAITING_NAME_INPUT');
            setLastTranscript('');
            speak("What is their name?");
          }
          setIsProcessingVoice(false);
          isProcessingVoiceRef.current = false;
        } else if (transcript.includes('no') || transcript.includes('cancel') || transcript.includes('don\'t')) {
          setIsProcessingVoice(true);
          isProcessingVoiceRef.current = true;
          setConversationState('IDLE');
          setPendingPerson(null);
          setLastTranscript('');
          speak("Okay, I won't save them.");
          setIsProcessingVoice(false);
          isProcessingVoiceRef.current = false;
        }
        break;

      case 'AWAITING_NAME_INPUT':
        if (transcript === 'stop') {
          stopSpeaking();
          setConversationState('IDLE');
          setPendingPerson(null);
          break;
        }
        const name = transcript.replace(/my name is |their name is |is /i, '').trim();
        if (name && name.length > 1) {
          setIsProcessingVoice(true);
          isProcessingVoiceRef.current = true;
          confirmName(name);
          setIsProcessingVoice(false);
          isProcessingVoiceRef.current = false;
        }
        break;

      case 'AWAITING_SPELLING_CONFIRMATION':
        if (transcript === 'stop') {
          stopSpeaking();
          setConversationState('IDLE');
          setPendingPerson(null);
          setPendingName('');
          break;
        }
        if (transcript.includes('yes') || transcript.includes('yeah') || transcript.includes('correct')) {
          setIsProcessingVoice(true);
          isProcessingVoiceRef.current = true;
          await finalizeSave(pendingName);
          setIsProcessingVoice(false);
          isProcessingVoiceRef.current = false;
        } else if (transcript.includes('no') || transcript.includes('wrong')) {
          setIsProcessingVoice(true);
          isProcessingVoiceRef.current = true;
          setConversationState('AWAITING_NAME_INPUT');
          setLastTranscript('');
          speak("Sorry about that. What is the correct name?");
          setIsProcessingVoice(false);
          isProcessingVoiceRef.current = false;
        }
        break;
    }
  };

  useEffect(() => {
    handleVoiceInputRef.current = handleVoiceInput;
  }, [handleVoiceInput]);

  const confirmName = (name: string) => {
    setPendingName(name);
    setConversationState('AWAITING_SPELLING_CONFIRMATION');
    const spelledOut = name.toUpperCase().split('').join(' ');
    speak(`Is it ${spelledOut}?`);
  };

  const finalizeSave = async (name: string) => {
    if (!pendingPerson) return;
    try {
      await savePerson(name, pendingPerson.visualDescription);
      setConversationState('IDLE');
      setPendingPerson(null);
      setPendingName('');
      loadKnownPeople();
      speak(`Saved ${name}. I will remember them.`);
    } catch (error) {
      console.error('Error saving person:', error);
      speak("Sorry, I couldn't save the person due to an error.");
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (u) {
        loadKnownPeople();
        loadEmergencyContact();
      } else {
        setKnownPeople([]);
        setEmergencyContact(null);
      }
    });
    return () => unsubscribe();
  }, []);

  const loadKnownPeople = async () => {
    const people = await getKnownPeople();
    setKnownPeople(people);
  };

  const loadEmergencyContact = async () => {
    const contact = await getEmergencyContact();
    if (contact) {
      setEmergencyContact(contact);
      setContactName(contact.name);
      setContactPhone(contact.phone);
      setTelegramToken(contact.telegramToken || '');
      setTelegramChatId(contact.telegramChatId || '');
    }
  };

  const handleSaveEmergencyContact = async () => {
    if (!contactName.trim() || !contactPhone.trim()) return;
    try {
      const contactData = {
        name: contactName,
        phone: contactPhone,
        telegramToken: telegramToken.trim() || undefined,
        telegramChatId: telegramChatId.trim() || undefined,
      };
      await saveEmergencyContact(contactData);
      setEmergencyContact({ ...contactData, uid: user!.uid });
      setShowEmergencySettings(false);
      speak("Emergency contact saved successfully.");
    } catch (error) {
      console.error("Error saving emergency contact:", error);
      speak("Error saving emergency contact.");
    }
  };

  const handleDeletePerson = async (id: string) => {
    try {
      await deletePerson(id);
      loadKnownPeople();
      speak("Person removed from memory.");
    } catch (error) {
      console.error('Error deleting person:', error);
      speak("Failed to remove person.");
    }
  };

  const handleUpdatePerson = async () => {
    if (!editingPerson?.id || !editName.trim()) return;
    try {
      await updatePerson(editingPerson.id, editName);
      setEditingPerson(null);
      setEditName('');
      loadKnownPeople();
      speak(`Updated name to ${editName}.`);
    } catch (error) {
      console.error('Error updating person:', error);
      speak("Failed to update name.");
    }
  };

  const handleCapture = useCallback(async (base64: string) => {
    if (conversationStateRef.current !== 'IDLE') return; // Don't capture while in a conversation

    const isManualScan = pendingQuestionRef.current !== null || !isBurstMode;
    if (isManualScan) {
      speak("Scanning...", true);
    }

    setIsProcessing(true);
    try {
      // 1. Get location if there's a question (for localized pricing/info)
      let location: { lat: number, lng: number } | undefined;
      const question = pendingQuestionRef.current || undefined;
      
      if (question && navigator.geolocation) {
        try {
          const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 3000 });
          });
          location = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        } catch (e) {
          console.warn("Could not get location for environment analysis:", e);
        }
      }

      // 2. Analyze environment with known people context and optional question
      setPendingQuestion(null); // Clear after use
      pendingQuestionRef.current = null; // Clear ref too
      
      const history = await getConversationHistory(5);
      const result = await analyzeEnvironment(base64, knownPeople, question, location, user?.displayName || undefined, history);
      setAnalysis(result);

      if (question) {
        await saveChatMessage('user', question);
        await saveChatMessage('model', result.description);
      }

      if (result.hazardDetected && !question) {
        playHazardBeep();
      }

      // 2. Generate and play audio - Use Fast Mode for manual scans for immediate feedback
      if (result.description) {
        // If it was a specific question, clear the general analysis to avoid confusion
        if (question) {
          setAnalysis(prev => prev ? { ...prev, description: result.description } : result);
        }
        speak(result.description, isManualScan);
        
        // Check if we should start the naming flow
        const unknownPerson = result.detectedPeople.find(p => !p.isKnown);
        if (unknownPerson) {
          setPendingPerson(unknownPerson);
          setConversationState('AWAITING_SAVE_DECISION');
          if (!user) {
            speak("Please sign in if you want me to remember them permanently.");
          }
        }
      }
    } catch (error) {
      console.error('Error processing environment:', error);
      speak("I'm not sure, I'm having trouble processing that image right now.");
    } finally {
      setIsProcessing(false);
    }
  }, [knownPeople, conversationState, user, pendingQuestion]);

  const handleSavePerson = async () => {
    if (!namingPerson || !newName.trim()) return;
    try {
      await savePerson(newName.trim(), namingPerson.visualDescription);
      setNamingPerson(null);
      setNewName('');
      loadKnownPeople();
    } catch (error) {
      console.error('Error saving person:', error);
    }
  };

  useEffect(() => {
    if (!isBurstMode) return;
    
    const interval = setInterval(() => {
      if (isBurstMode && burstEndTime && Date.now() > burstEndTime) {
        setIsBurstMode(false);
        setBurstEndTime(null);
        speak("Burst scan completed.");
        return;
      }
      
      if (!isProcessing && conversationStateRef.current === 'IDLE') {
        cameraRef.current?.capture();
      }
    }, 3000); // Scan every 3 seconds in burst mode
    
    return () => clearInterval(interval);
  }, [isBurstMode, burstEndTime, isProcessing]);

  return (
    <div className="fixed inset-0 bg-hw-bg flex flex-col font-sans selection:bg-hw-accent/30 overflow-hidden">
      {/* Background Grid Pattern */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(var(--color-hw-accent) 1px, transparent 0)', backgroundSize: '40px 40px' }} />
      
      <Camera ref={cameraRef} onCapture={handleCapture} isProcessing={isProcessing} autoScanEnabled={autoScanEnabled} />
      
      {/* Top Status Bar / Header */}
      <header className="absolute top-0 left-0 right-0 z-40 p-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between hw-glass rounded-2xl p-3 px-5 shadow-2xl">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-hw-accent/10 border border-hw-accent/30 rounded-xl flex items-center justify-center shadow-lg shadow-hw-accent/5">
              <Eye className="text-hw-accent w-6 h-6" />
            </div>
            <div>
              <h1 className="text-white font-bold text-sm tracking-tight leading-none mb-1">NEURALSIGHT <span className="text-hw-accent/60 font-mono text-[10px] ml-2">V2.4.0</span></h1>
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-hw-accent animate-pulse" />
                <p className="text-hw-accent text-[9px] font-mono uppercase tracking-widest">System Active</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {user && (
              <>
                <button
                  onClick={() => setShowCommands(true)}
                  className="p-2 rounded-xl bg-white/5 border border-white/10 text-white/60 hover:bg-white/10 hover:border-white/20 transition-all"
                  title="Voice Commands"
                >
                  <HelpCircle className="w-4 h-4" />
                </button>

                <button
                  onClick={() => setShowManagePeople(true)}
                  className="p-2 rounded-xl bg-white/5 border border-white/10 text-white/60 hover:bg-white/10 hover:border-white/20 transition-all"
                  title="Manage Memory"
                >
                  <Users className="w-4 h-4" />
                </button>

                <button
                  onClick={() => setShowEmergencySettings(true)}
                  className="p-2 rounded-xl bg-white/5 border border-white/10 text-white/60 hover:bg-white/10 hover:border-white/20 transition-all"
                  title="Emergency Settings"
                >
                  <Settings className="w-4 h-4" />
                </button>

                <button
                  onClick={handleSOS}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-mono uppercase tracking-wider transition-all border bg-hw-hazard/20 border-hw-hazard text-hw-hazard hover:bg-hw-hazard/30 shadow-lg shadow-hw-hazard/10"
                >
                  <PhoneCall className="w-3 h-3" />
                  SOS
                </button>
              </>
            )}

            <div className="h-8 w-[1px] bg-white/10 mx-1" />

            <button
              onClick={toggleListening}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-mono uppercase tracking-wider transition-all border ${
                isListening 
                  ? 'bg-hw-hazard/10 border-hw-hazard text-hw-hazard animate-pulse' 
                  : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10 hover:border-white/20'
              }`}
            >
              {isListening ? <Mic className="w-3 h-3" /> : <MicOff className="w-3 h-3" />}
              {isListening ? 'Voice: ON' : 'Voice: OFF'}
            </button>

            <div className="h-8 w-[1px] bg-white/10 mx-1" />

            {user ? (
              <div className="flex items-center gap-3 bg-white/5 border border-white/10 px-3 py-2 rounded-xl">
                <div className="w-6 h-6 rounded-lg bg-hw-accent/20 flex items-center justify-center">
                  <UserIcon className="w-3 h-3 text-hw-accent" />
                </div>
                <span className="text-white/60 text-[10px] font-mono uppercase tracking-wider truncate max-w-[80px]">
                  {user.displayName?.split(' ')[0]}
                </span>
              </div>
            ) : (
              <button 
                onClick={signIn}
                className="flex items-center gap-2 bg-hw-accent text-black px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all hover:scale-105 active:scale-95 shadow-lg shadow-hw-accent/20"
              >
                <LogIn className="w-3 h-3" />
                Link ID
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Viewport */}
      <main className="flex-1 relative bg-black overflow-hidden flex items-center justify-center">
        {/* Camera Preview Container - Circular Lens Viewfinder */}
        <div 
          className={`absolute transition-all duration-700 flex items-center justify-center ${
            showPreview 
              ? 'w-[280px] h-[280px] md:w-[400px] md:h-[400px] rounded-full opacity-100 scale-100 border-4 border-hw-accent/40 shadow-2xl overflow-hidden hw-glow' 
              : 'w-0 h-0 opacity-0 scale-110 pointer-events-none'
          }`}
          style={{ backgroundColor: '#050505' }}
        >
          <Camera ref={cameraRef} onCapture={handleCapture} isProcessing={isProcessing} autoScanEnabled={autoScanEnabled} />
          {showPreview && (
            <>
              {/* Viewfinder Crosshair */}
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center opacity-40">
                <div className="w-8 h-[1px] bg-hw-accent" />
                <div className="h-8 w-[1px] bg-hw-accent absolute" />
              </div>
              {/* Scanning Line Animation */}
              {isProcessing && (
                <motion.div 
                  initial={{ top: '-10%' }}
                  animate={{ top: '110%' }}
                  transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                  className="absolute left-0 right-0 h-[2px] bg-hw-accent/60 shadow-[0_0_10px_var(--color-hw-accent)] z-20"
                />
              )}
              <div className="absolute top-6 flex items-center gap-2 bg-black/60 backdrop-blur-md border border-hw-accent/30 text-hw-accent px-3 py-1 rounded-full text-[8px] font-mono uppercase tracking-[0.2em]">
                <div className="w-1 h-1 rounded-full bg-hw-accent animate-pulse" />
                Optic_Feed
              </div>
            </>
          )}
        </div>

        {/* Start Button (Visible when preview is hidden) */}
        {!showPreview && (
          <motion.button
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setShowPreview(true)}
            className="z-30 bg-white text-black px-12 py-6 rounded-2xl font-black text-2xl shadow-2xl flex items-center gap-4 border-4 border-black/10 pointer-events-auto transition-all hover:bg-hw-accent hover:text-black group"
          >
            <Eye className="w-8 h-8 group-hover:animate-pulse" />
            INITIALIZE OPTICS
          </motion.button>
        )}

        {/* OK Button (Visible when preview is shown) */}
        {showPreview && (
          <div className="absolute bottom-12 left-1/2 -translate-x-1/2 z-50 pointer-events-auto">
            <button
              onClick={() => setShowPreview(false)}
              className="bg-hw-accent text-black px-12 py-4 rounded-2xl font-black text-xl shadow-2xl flex items-center gap-3 border-4 border-black/10 active:scale-95 transition-all hw-glow"
            >
              <ShieldAlert className="w-6 h-6" />
              SECURE FEED
            </button>
          </div>
        )}
      </main>

      {/* Bottom Interface Layer */}
      <div className="absolute bottom-0 left-0 right-0 z-30 p-6 pointer-events-none">
        <div className="max-w-5xl mx-auto flex flex-col gap-4">
          
          {/* Results Overlay */}
          <AnimatePresence>
            {analysis && (
              <motion.div
                initial={{ opacity: 0, y: 50 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 50 }}
                className="space-y-3 pointer-events-auto"
              >
                {/* Hazard Alert */}
                {analysis?.hazardDetected && (
                  <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="bg-hw-hazard text-white p-5 rounded-2xl shadow-2xl hw-hazard-glow border border-white/20 flex items-center gap-5"
                  >
                    <div className="w-14 h-14 bg-white/20 rounded-xl flex items-center justify-center animate-pulse">
                      <ShieldAlert className="w-9 h-9 text-white" />
                    </div>
                    <div>
                      <h2 className="text-xl font-black uppercase tracking-tighter leading-none mb-1">CRITICAL HAZARD</h2>
                      <p className="text-xs font-mono uppercase tracking-widest opacity-90">Immediate Path Obstruction Detected</p>
                    </div>
                  </motion.div>
                )}

                {/* Main Analysis Card */}
                <div className="hw-glass rounded-[2rem] p-6 shadow-2xl relative overflow-hidden">
                  {/* Decorative corner accents */}
                  <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-hw-accent/40" />
                  <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-hw-accent/40" />
                  <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-hw-accent/40" />
                  <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-hw-accent/40" />

                  <div className="flex items-start gap-5">
                    <div className="w-12 h-12 rounded-xl bg-hw-accent/10 border border-hw-accent/20 flex items-center justify-center shrink-0">
                      <Volume2 className="text-hw-accent w-6 h-6" />
                    </div>
                    <div className="flex-1 space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-hw-accent/60 font-mono text-[9px] uppercase tracking-[0.3em]">Audio Output Stream</span>
                        <div className="flex gap-1">
                          {[...Array(4)].map((_, i) => (
                            <div key={i} className="w-1 h-3 bg-hw-accent/20 rounded-full animate-pulse" style={{ animationDelay: `${i * 0.1}s` }} />
                          ))}
                        </div>
                      </div>
                      <p className="text-white text-xl font-medium leading-relaxed tracking-tight">
                        {analysis.description}
                      </p>
                      
                      <div className="flex flex-wrap gap-2 pt-2">
                        <Badge icon={<ShieldAlert className="w-3 h-3" />} label="Hazards" />
                        <Badge icon={<Navigation className="w-3 h-3" />} label="Spatial" />
                        <Badge icon={<Type className="w-3 h-3" />} label="OCR" />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Detected People Actions */}
                {user && analysis.detectedPeople.some(p => !p.isKnown) && (
                  <div className="flex flex-col gap-2">
                    {analysis.detectedPeople.filter(p => !p.isKnown).map((person, i) => (
                      <motion.button
                        key={i}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        onClick={() => setNamingPerson(person)}
                        className="bg-hw-accent text-black p-4 rounded-2xl flex items-center justify-between font-black text-xs uppercase tracking-widest shadow-lg shadow-hw-accent/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
                      >
                        <div className="flex items-center gap-3">
                          <UserPlus className="w-5 h-5" />
                          <span>Identify: {person.visualDescription}</span>
                        </div>
                        <RefreshCw className="w-4 h-4 opacity-40" />
                      </motion.button>
                    ))}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Bottom Status Bar */}
          <div className="flex items-center justify-between gap-4 pointer-events-auto">
            <div className="flex gap-2">
              {isBurstMode && (
                <div className="bg-orange-500/10 border border-orange-500/30 text-orange-500 px-4 py-2 rounded-xl font-mono text-[9px] uppercase tracking-widest flex items-center gap-2 shadow-lg">
                  <RefreshCw className="w-3 h-3 animate-spin" />
                  <span>Burst Active</span>
                </div>
              )}
              {autoScanEnabled && (
                <div className="bg-blue-500/10 border border-blue-500/30 text-blue-500 px-4 py-2 rounded-xl font-mono text-[9px] uppercase tracking-widest flex items-center gap-2 shadow-lg">
                  <Eye className="w-3 h-3 animate-pulse" />
                  <span>Continuous</span>
                </div>
              )}
              {assistantActive && (
                <div className="bg-hw-accent/10 border border-hw-accent/30 text-hw-accent px-4 py-2 rounded-xl font-mono text-[9px] uppercase tracking-widest flex items-center gap-2 shadow-lg">
                  <Volume2 className="w-3 h-3 animate-pulse" />
                  <span>Assistant Active</span>
                </div>
              )}
            </div>

            {/* Conversation Status Indicator */}
            {conversationState !== 'IDLE' && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-hw-accent text-black px-5 py-2.5 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] shadow-xl hw-glow flex flex-col gap-1.5"
              >
                <div className="flex items-center gap-3">
                  <Mic className={`w-4 h-4 ${isProcessingVoice ? 'animate-ping' : 'animate-bounce'}`} />
                  <span>{isProcessingVoice ? 'Processing...' : conversationState.replace(/_/g, ' ')}</span>
                </div>
                {lastTranscript && (
                  <div className="text-[9px] font-mono opacity-60 italic border-t border-black/10 pt-1.5">
                    &gt; {lastTranscript}
                  </div>
                )}
              </motion.div>
            )}
            
            <div className="flex-1" />
            
            <p className="text-white/20 font-mono text-[9px] uppercase tracking-[0.4em] hidden md:block">
              NeuralSight Specialist Interface // Secure Session
            </p>
          </div>
        </div>
      </div>

      {/* Naming Modal */}
      <AnimatePresence>
        {namingPerson && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/90 backdrop-blur-md"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-hw-card border border-white/10 rounded-[2.5rem] p-10 w-full max-w-md space-y-8 shadow-2xl relative overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-1 bg-hw-accent/30" />
              
              <div className="space-y-4 text-center">
                <div className="w-20 h-20 bg-hw-accent/10 border border-hw-accent/20 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-xl">
                  <UserPlus className="text-hw-accent w-10 h-10" />
                </div>
                <h2 className="text-white text-2xl font-black uppercase tracking-tight">Register Entity</h2>
                <p className="text-hw-accent/60 font-mono text-xs uppercase tracking-widest italic">"{namingPerson.visualDescription}"</p>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-mono uppercase tracking-[0.3em] text-white/40 ml-2">Input Identity</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="NAME_STRING"
                  className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-white font-mono focus:outline-none focus:border-hw-accent transition-all text-lg shadow-inner"
                  autoFocus
                />
              </div>

              <div className="flex gap-4">
                <button
                  onClick={() => setNamingPerson(null)}
                  className="flex-1 bg-white/5 hover:bg-white/10 text-white/60 font-bold py-4 rounded-2xl transition-all uppercase text-xs tracking-widest border border-white/5"
                >
                  Abort
                </button>
                <button
                  onClick={handleSavePerson}
                  disabled={!newName.trim()}
                  className="flex-1 bg-hw-accent hover:brightness-110 disabled:opacity-30 text-black font-black py-4 rounded-2xl transition-all uppercase text-xs tracking-widest hw-glow"
                >
                  Commit
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Commands Modal */}
      <AnimatePresence>
        {showCommands && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[120] flex items-center justify-center p-6 bg-black/90 backdrop-blur-md"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-hw-card border border-white/10 rounded-[2.5rem] p-10 w-full max-w-md space-y-8 shadow-2xl relative overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-1 bg-hw-accent/50" />
              
              <div className="flex justify-between items-center">
                <div className="space-y-1">
                  <h2 className="text-white text-2xl font-black uppercase tracking-tight">Voice Protocol</h2>
                  <p className="text-hw-accent/60 font-mono text-[10px] uppercase tracking-widest">Available Commands</p>
                </div>
                <button onClick={() => setShowCommands(false)} className="p-2 text-white/40 hover:text-white">
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
                {[
                  { cmd: 'scan', desc: 'Capture and analyze current environment' },
                  { cmd: 'sos', desc: 'Trigger emergency protocol (Telegram alert)' },
                  { cmd: 'activate neural assistant', desc: 'Start personal AI assistant (Weather, Time, etc.)' },
                  { cmd: 'burst', desc: 'Activate 30s high-frequency scanning' },
                  { cmd: 'auto', desc: 'Toggle continuous background scanning' },
                  { cmd: 'stop', desc: 'Deactivate burst or auto-scan modes' },
                  { cmd: 'help', desc: 'Open this command reference' },
                  { cmd: 'call [number]', desc: 'Open phone dialer with number' },
                  { cmd: 'message saying [text]', desc: 'Send Telegram message to contact' },
                  { cmd: 'change [name] to [new name]', desc: 'Update a known person\'s name' },
                  { cmd: 'any question', desc: 'Ask about the scene (e.g., "What color is the door?")' }
                ].map((item, i) => (
                  <div key={i} className="bg-white/5 border border-white/10 rounded-2xl p-4 flex items-start gap-4">
                    <div className="bg-hw-accent/10 text-hw-accent px-2 py-1 rounded text-[10px] font-mono font-bold uppercase tracking-wider">
                      {item.cmd}
                    </div>
                    <p className="text-white/60 text-[11px] font-mono leading-relaxed">
                      {item.desc}
                    </p>
                  </div>
                ))}
              </div>

              <button
                onClick={() => setShowCommands(false)}
                className="w-full bg-white/5 hover:bg-white/10 text-white/60 font-bold py-4 rounded-2xl transition-all uppercase text-xs tracking-widest border border-white/5"
              >
                Close Reference
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Emergency Settings Modal */}
      <AnimatePresence>
        {showEmergencySettings && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] flex items-center justify-center p-6 bg-black/90 backdrop-blur-md"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-hw-card border border-white/10 rounded-[2.5rem] p-10 w-full max-w-md space-y-8 shadow-2xl relative overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-1 bg-hw-hazard/50" />
              
              <div className="flex justify-between items-center">
                <div className="space-y-1">
                  <h2 className="text-white text-2xl font-black uppercase tracking-tight">Emergency Setup</h2>
                  <p className="text-hw-accent/60 font-mono text-[10px] uppercase tracking-widest">Configure SOS Protocol</p>
                </div>
                <button onClick={() => setShowEmergencySettings(false)} className="p-2 text-white/40 hover:text-white">
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="space-y-6 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
                <div className="space-y-4">
                  <div className="flex items-center gap-2 mb-2">
                    <PhoneCall className="w-3 h-3 text-hw-accent" />
                    <span className="text-[10px] font-mono uppercase tracking-widest text-hw-accent">Primary Contact</span>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-mono uppercase tracking-[0.3em] text-white/40 ml-2">Contact Name</label>
                    <input
                      type="text"
                      value={contactName}
                      onChange={(e) => setContactName(e.target.value)}
                      placeholder="NAME_STRING"
                      className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-white font-mono focus:outline-none focus:border-hw-accent transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-mono uppercase tracking-[0.3em] text-white/40 ml-2">Phone Number</label>
                    <input
                      type="tel"
                      value={contactPhone}
                      onChange={(e) => setContactPhone(e.target.value)}
                      placeholder="+1234567890"
                      className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-white font-mono focus:outline-none focus:border-hw-accent transition-all"
                    />
                  </div>
                </div>

                <div className="h-[1px] bg-white/5 my-6" />

                <div className="space-y-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Volume2 className="w-3 h-3 text-hw-accent" />
                    <span className="text-[10px] font-mono uppercase tracking-widest text-hw-accent">Voice Settings</span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setVoiceEngine('gemini')}
                      className={`flex-1 py-3 rounded-xl font-mono text-[10px] uppercase tracking-wider transition-all border ${
                        voiceEngine === 'gemini' 
                          ? 'bg-hw-accent/20 border-hw-accent text-hw-accent' 
                          : 'bg-white/5 border-white/10 text-white/40 hover:bg-white/10'
                      }`}
                    >
                      High Quality
                    </button>
                    <button
                      onClick={() => setVoiceEngine('browser')}
                      className={`flex-1 py-3 rounded-xl font-mono text-[10px] uppercase tracking-wider transition-all border ${
                        voiceEngine === 'browser' 
                          ? 'bg-hw-accent/20 border-hw-accent text-hw-accent' 
                          : 'bg-white/5 border-white/10 text-white/40 hover:bg-white/10'
                      }`}
                    >
                      Fast/Offline
                    </button>
                  </div>
                  {quotaExceeded && voiceEngine === 'gemini' && (
                    <p className="text-[10px] font-mono text-hw-hazard/80 mt-2 italic">
                      Note: Gemini quota exceeded. Falling back to browser.
                    </p>
                  )}
                </div>

                <div className="h-[1px] bg-white/5 my-6" />

                <div className="space-y-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Send className="w-3 h-3 text-hw-accent" />
                    <span className="text-[10px] font-mono uppercase tracking-widest text-hw-accent">Telegram Integration</span>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-mono uppercase tracking-[0.3em] text-white/40 ml-2">Bot Access Token</label>
                    <input
                      type="password"
                      value={telegramToken}
                      onChange={(e) => setTelegramToken(e.target.value)}
                      placeholder="BOT_TOKEN_HASH"
                      className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-white font-mono focus:outline-none focus:border-hw-accent transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-mono uppercase tracking-[0.3em] text-white/40 ml-2">Chat ID</label>
                    <input
                      type="text"
                      value={telegramChatId}
                      onChange={(e) => setTelegramChatId(e.target.value)}
                      placeholder="CHAT_ID_INT"
                      className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-white font-mono focus:outline-none focus:border-hw-accent transition-all"
                    />
                  </div>
                </div>
              </div>

              <button
                onClick={handleSaveEmergencyContact}
                disabled={!contactName.trim() || !contactPhone.trim()}
                className="w-full bg-hw-accent hover:brightness-110 disabled:opacity-30 text-black font-black py-4 rounded-2xl transition-all uppercase text-xs tracking-widest hw-glow flex items-center justify-center gap-2"
              >
                <Save className="w-4 h-4" />
                Save Protocol
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Manage People Modal */}
      <AnimatePresence>
        {showManagePeople && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] flex items-center justify-center p-6 bg-black/90 backdrop-blur-md"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-hw-card border border-white/10 rounded-[2.5rem] p-10 w-full max-w-md space-y-8 shadow-2xl relative overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-1 bg-hw-accent/50" />
              
              <div className="flex justify-between items-center">
                <div className="space-y-1">
                  <h2 className="text-white text-2xl font-black uppercase tracking-tight">Neural Memory</h2>
                  <p className="text-hw-accent/60 font-mono text-[10px] uppercase tracking-widest">Manage Known Identities</p>
                </div>
                <button onClick={() => setShowManagePeople(false)} className="p-2 text-white/40 hover:text-white">
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
                {knownPeople.length === 0 ? (
                  <div className="text-center py-10 space-y-4">
                    <UserIcon className="w-12 h-12 text-white/10 mx-auto" />
                    <p className="text-white/40 font-mono text-xs uppercase tracking-widest">No identities stored</p>
                  </div>
                ) : (
                  knownPeople.map((person) => (
                    <div key={person.id} className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-3">
                      <div className="flex justify-between items-start">
                        <div className="space-y-1">
                          {editingPerson?.id === person.id ? (
                            <input
                              type="text"
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              className="bg-black/40 border border-hw-accent/30 rounded-lg px-3 py-1 text-white font-mono text-sm focus:outline-none"
                              autoFocus
                            />
                          ) : (
                            <h3 className="text-white font-bold text-sm uppercase tracking-wider">{person.name}</h3>
                          )}
                          <p className="text-white/40 text-[10px] font-mono leading-tight italic">"{person.description}"</p>
                        </div>
                        <div className="flex gap-2">
                          {editingPerson?.id === person.id ? (
                            <>
                              <button onClick={handleUpdatePerson} className="p-2 text-hw-accent hover:bg-hw-accent/10 rounded-lg">
                                <Check className="w-4 h-4" />
                              </button>
                              <button onClick={() => setEditingPerson(null)} className="p-2 text-hw-hazard hover:bg-hw-hazard/10 rounded-lg">
                                <X className="w-4 h-4" />
                              </button>
                            </>
                          ) : (
                            <>
                              <button 
                                onClick={() => {
                                  setEditingPerson(person);
                                  setEditName(person.name);
                                }} 
                                className="p-2 text-white/40 hover:text-hw-accent rounded-lg"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button onClick={() => person.id && handleDeletePerson(person.id)} className="p-2 text-white/40 hover:text-hw-hazard rounded-lg">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <button
                onClick={() => setShowManagePeople(false)}
                className="w-full bg-white/5 hover:bg-white/10 text-white/60 font-bold py-4 rounded-2xl transition-all uppercase text-xs tracking-widest border border-white/5"
              >
                Close Memory
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
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

