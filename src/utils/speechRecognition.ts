/****
 * STT Manager using native Browser Web Speech API.
 */
export class SpeechRecognitionManager {
    private recognition: any | null = null;
    private finalTranscript: string = '';
    private finalSegments: string[] = [];
    private onResultCallback: ((final: string, interim: string) => void) | null = null;
    private onEndCallback: ((finalTranscript: string) => void) | null = null;
    private recognitionLang: string = 'en-US';

    constructor() {
        this.initBrowserRecognition();
    }

    private initBrowserRecognition() {
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (SpeechRecognition) {
            this.recognition = new SpeechRecognition();
            this.recognition.continuous = true;
            this.recognition.interimResults = true;
            this.recognition.lang = this.recognitionLang;

            this.recognition.onresult = (event: any) => {
                let interimTranscript = '';
                let newFinal = '';

                for (let i = event.resultIndex; i < event.results.length; ++i) {
                    const transcript = event.results[i][0].transcript;

                    if (event.results[i].isFinal) {
                        const cleaned = transcript.trim();

                        if (cleaned) {
                            newFinal += cleaned + ' ';
                        }
                    } else {
                        interimTranscript += transcript;
                    }
                }

                newFinal = newFinal
                    .trim()
                    .replace(/([a-z])([A-Z])/g, '$1 $2')
                    .replace(/\s+/g, ' ')
                    .trim();

                if (newFinal) {
                    this.finalSegments.push(newFinal);
                }

                this.finalTranscript = this.finalSegments.join(' ')
                    .replace(/([a-z])([A-Z])/g, '$1 $2')
                    .replace(/\s+/g, ' ')
                    .trim();

                if (this.onResultCallback) {
                    this.onResultCallback(this.finalTranscript, interimTranscript.trim());
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

    setLanguage(lang: string) {
        this.recognitionLang = lang || 'en-US';
        if (this.recognition) {
            this.recognition.lang = this.recognitionLang;
        }
    }

    async start(
        onResult: (final: string, interim: string) => void,
        onEnd: (finalTranscript: string) => void,
        lang?: string
    ) {
        this.onResultCallback = onResult;
        this.onEndCallback = onEnd;
        this.finalTranscript = '';
        this.finalSegments = [];

        if (lang) {
            this.setLanguage(lang);
        }

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
