
/**
 * STT Manager using native Browser Web Speech API.
 */
export class SpeechRecognitionManager {
    private recognition: any | null = null;
    private finalTranscript: string = '';
    private onResultCallback: ((final: string, interim: string) => void) | null = null;
    private onEndCallback: ((finalTranscript: string) => void) | null = null;

    constructor() {
        this.initBrowserRecognition();
    }

    private initBrowserRecognition() {
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (SpeechRecognition) {
            this.recognition = new SpeechRecognition();
            this.recognition.continuous = true;
            this.recognition.interimResults = true;
            this.recognition.lang = 'en-US';

            this.recognition.onresult = (event: any) => {
                let interimTranscript = '';
                let currentFinal = '';

                for (let i = event.resultIndex; i < event.results.length; ++i) {
                    if (event.results[i].isFinal) {
                        currentFinal += event.results[i][0].transcript;
                    } else {
                        interimTranscript += event.results[i][0].transcript;
                    }
                }
                
                this.finalTranscript += currentFinal;
                if (this.onResultCallback) {
                    this.onResultCallback(this.finalTranscript, interimTranscript);
                }
            };
            
            this.recognition.onend = () => {
                if (this.onEndCallback) {
                    this.onEndCallback(this.finalTranscript);
                }
            };

            this.recognition.onerror = (event: any) => {
                console.error("Speech Recognition Error:", event.error);
                this.stop();
            };
        }
    }

    async start(onResult: (final: string, interim: string) => void, onEnd: (finalTranscript: string) => void) {
        this.onResultCallback = onResult;
        this.onEndCallback = onEnd;
        this.finalTranscript = '';

        if (!this.recognition) {
            console.error("Speech Recognition not supported in this browser.");
            return;
        }

        try {
            this.recognition.start();
        } catch (e) {
            console.error("Speech Recognition start failed:", e);
        }
    }

    stop() {
        if (this.recognition) {
            try {
                this.recognition.stop();
            } catch (e) {}
        }
    }
}
