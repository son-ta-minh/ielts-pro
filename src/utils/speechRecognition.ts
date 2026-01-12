// A wrapper for the browser's SpeechRecognition API for easier use.

export class SpeechRecognitionManager {
    // FIX: Cannot find name 'SpeechRecognition'. Use 'any' to avoid type errors for browser-specific APIs.
    private recognition: any | null = null;
    private finalTranscript: string = '';
    private onEndCallback: ((finalTranscript: string) => void) | null = null;

    constructor() {
        // FIX: Property 'SpeechRecognition' does not exist on type 'Window'. Cast to 'any' to access vendor-prefixed APIs.
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (SpeechRecognition) {
            this.recognition = new SpeechRecognition();
            this.recognition.continuous = true;
            this.recognition.interimResults = true;
            this.recognition.lang = 'en-US';

            // FIX: Cannot find name 'SpeechRecognitionEvent'. Use 'any' for the event parameter.
            this.recognition.onresult = (event: any) => {
                let interimTranscript = '';
                this.finalTranscript = '';
                for (let i = event.resultIndex; i < event.results.length; ++i) {
                    if (event.results[i].isFinal) {
                        this.finalTranscript += event.results[i][0].transcript;
                    } else {
                        interimTranscript += event.results[i][0].transcript;
                    }
                }
                
                if (this.onResultCallback) {
                    this.onResultCallback(this.finalTranscript, interimTranscript);
                }
            };
            
            this.recognition.onend = () => {
                if(this.onEndCallback) {
                    this.onEndCallback(this.finalTranscript);
                }
            };
        } else {
            console.warn("Speech Recognition API not supported in this browser.");
        }
    }

    private onResultCallback: ((final: string, interim: string) => void) | null = null;

    start(onResult: (final: string, interim: string) => void, onEnd: (finalTranscript: string) => void) {
        if (!this.recognition) return;
        this.finalTranscript = '';
        this.onResultCallback = onResult;
        this.onEndCallback = onEnd;
        try {
            this.recognition.start();
        } catch (e) {
            console.error("Speech recognition could not start:", e);
        }
    }

    stop() {
        if (!this.recognition) return;
        this.recognition.stop();
        this.onResultCallback = null;
        // onEnd will be called automatically
    }
}
