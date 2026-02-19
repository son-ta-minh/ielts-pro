
import React, { useRef, useEffect, useState } from 'react';
import { Play, Pause, Scissors } from 'lucide-react';

interface Props {
    audioBlob: Blob;
    onTrim: (blob: Blob) => void;
    onCancel: () => void;
}

export const AudioTrimmer: React.FC<Props> = ({ audioBlob, onTrim, onCancel }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [audioContext, setAudioContext] = useState<AudioContext | null>(null);
    const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
    const [startPos, setStartPos] = useState(0); // 0 to 1
    const [endPos, setEndPos] = useState(1); // 0 to 1
    const [isPlaying, setIsPlaying] = useState(false);
    const sourceRef = useRef<AudioBufferSourceNode | null>(null);

    useEffect(() => {
        const init = async () => {
            const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
            const arrayBuffer = await audioBlob.arrayBuffer();
            const buffer = await ctx.decodeAudioData(arrayBuffer);
            setAudioContext(ctx);
            setAudioBuffer(buffer);
            drawWaveform(buffer, 0, 1);
        };
        init();
        return () => {
            if (audioContext) audioContext.close();
        };
    }, [audioBlob]);

    const drawWaveform = (buffer: AudioBuffer, start: number, end: number) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const width = canvas.width;
        const height = canvas.height;
        ctx.clearRect(0, 0, width, height);

        const data = buffer.getChannelData(0);
        const step = Math.ceil(data.length / width);
        const amp = height / 2;

        ctx.fillStyle = '#e5e7eb'; // neutral-200
        ctx.fillRect(0, 0, width, height);

        ctx.fillStyle = '#6366f1'; // indigo-500
        ctx.beginPath();
        for (let i = 0; i < width; i++) {
            let min = 1.0;
            let max = -1.0;
            for (let j = 0; j < step; j++) {
                const datum = data[i * step + j];
                if (datum < min) min = datum;
                if (datum > max) max = datum;
            }
            ctx.fillRect(i, (1 + min) * amp, 1, Math.max(1, (max - min) * amp));
        }

        // Overlay dimming for trimmed areas
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        const startX = start * width;
        const endX = end * width;
        ctx.fillRect(0, 0, startX, height);
        ctx.fillRect(endX, 0, width - endX, height);
        
        // Handles
        ctx.fillStyle = '#ef4444'; // red-500
        ctx.fillRect(startX - 2, 0, 4, height);
        ctx.fillRect(endX - 2, 0, 4, height);
    };

    useEffect(() => {
        if (audioBuffer) drawWaveform(audioBuffer, startPos, endPos);
    }, [startPos, endPos, audioBuffer]);

    const handlePlay = () => {
        if (!audioContext || !audioBuffer) return;
        
        if (isPlaying) {
            sourceRef.current?.stop();
            setIsPlaying(false);
            return;
        }

        const duration = audioBuffer.duration;
        const startOffset = duration * startPos;
        const endOffset = duration * endPos;
        const playDuration = endOffset - startOffset;

        const source = audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioContext.destination);
        source.start(0, startOffset, playDuration);
        source.onended = () => setIsPlaying(false);
        sourceRef.current = source;
        setIsPlaying(true);
    };
    
    const handleTrimAndSave = async () => {
        if (!audioContext || !audioBuffer) return;
        
        // Lazy import to avoid circular dependency issues if any
        const { bufferToWav } = await import('../../utils/audio');
        
        const startSample = Math.floor(startPos * audioBuffer.length);
        const endSample = Math.floor(endPos * audioBuffer.length);
        const frameCount = endSample - startSample;
        
        const newBuffer = audioContext.createBuffer(
            audioBuffer.numberOfChannels,
            frameCount,
            audioBuffer.sampleRate
        );

        for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
            const oldData = audioBuffer.getChannelData(channel);
            const newData = newBuffer.getChannelData(channel);
            newData.set(oldData.subarray(startSample, endSample));
        }
        
        const blob = bufferToWav(newBuffer);
        onTrim(blob);
    };

    // Simple drag handling (Could be improved)
    const handleMouseDown = (e: React.MouseEvent) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const ratio = Math.max(0, Math.min(1, x / rect.width));
        
        // Determine closest handle
        const distStart = Math.abs(ratio - startPos);
        const distEnd = Math.abs(ratio - endPos);
        
        const isDraggingStart = distStart < distEnd;
        
        const handleMouseMove = (mv: MouseEvent) => {
            const mx = mv.clientX - rect.left;
            const mRatio = Math.max(0, Math.min(1, mx / rect.width));
            
            if (isDraggingStart) {
                setStartPos(Math.min(mRatio, endPos - 0.05));
            } else {
                setEndPos(Math.max(mRatio, startPos + 0.05));
            }
        };
        
        const handleMouseUp = () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
        
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
    };

    return (
        <div className="flex flex-col gap-4 p-4 bg-white rounded-2xl border border-neutral-200">
            <div className="relative h-24 bg-neutral-100 rounded-xl overflow-hidden cursor-pointer" onMouseDown={handleMouseDown}>
                <canvas ref={canvasRef} width={600} height={100} className="w-full h-full" />
            </div>
            
            <div className="flex justify-between items-center">
                <button onClick={handlePlay} className="flex items-center gap-2 px-4 py-2 bg-neutral-900 text-white rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-neutral-800 transition-all">
                    {isPlaying ? <Pause size={14} /> : <Play size={14} />}
                    {isPlaying ? 'Stop' : 'Preview'}
                </button>
                <div className="flex gap-2">
                    <button onClick={onCancel} className="px-4 py-2 text-neutral-500 hover:text-neutral-900 font-bold text-xs">Cancel</button>
                    <button onClick={handleTrimAndSave} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-indigo-500 transition-all">
                        <Scissors size={14} /> Trim & Use
                    </button>
                </div>
            </div>
            <p className="text-[10px] text-neutral-400 text-center">Drag the red bars to trim audio.</p>
        </div>
    );
};
