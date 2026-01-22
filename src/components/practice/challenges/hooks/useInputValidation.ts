// FIX: Import React to provide the React namespace for types like React.ChangeEvent.
import React, { useState } from 'react';

export const useInputValidation = () => {
    const [validationState, setValidationState] = useState<Record<string, 'correct' | 'incorrect' | null>>({});

    const clearValidation = (key: string) => {
        setValidationState(prev => {
            if (!prev[key]) return prev;
            const next = { ...prev };
            delete next[key];
            return next;
        });
    };

    const getValidationClass = (key: string) => {
        const status = validationState[key];
        if (status === 'correct') return '!border-green-500 !ring-2 !ring-green-100 !bg-green-50 text-green-900';
        if (status === 'incorrect') return '!border-red-500 !ring-2 !ring-red-100 !bg-red-50 text-red-900';
        return '';
    };

    const handleSmartChange = (
        e: React.ChangeEvent<HTMLInputElement>, 
        onChange: (val: string) => void, 
        fillValue: string
    ) => {
        const val = e.target.value;
        if (val === ' ') {
            onChange(fillValue);
        } else if (val.endsWith('  ')) {
            const prefix = val.substring(0, val.length - 2);
            const separator = prefix.length > 0 ? ' ' : '';
            onChange(prefix + separator + fillValue);
        } else {
            onChange(val);
        }
    };

    const handleValidationKeyDown = (
        e: React.KeyboardEvent<HTMLInputElement>,
        key: string,
        correctValues: string | string[]
    ) => {
        if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            
            const val = e.currentTarget.value;
            const normalize = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
            
            let isCorrect = false;

            if (Array.isArray(correctValues)) {
                const userInputs = val.split(',').map(normalize).filter(Boolean);
                
                if (userInputs.length === 0) {
                     setValidationState(prev => ({ ...prev, [key]: null }));
                     return;
                }
                const correctSet = new Set(correctValues.map(normalize));
                isCorrect = userInputs.every(input => correctSet.has(input));

            } else {
                const normalizedVal = normalize(val);
                if (!normalizedVal) {
                     setValidationState(prev => ({ ...prev, [key]: null }));
                     return;
                }
                isCorrect = normalize(correctValues) === normalizedVal;
            }
            
            setValidationState(prev => ({ ...prev, [key]: isCorrect ? 'correct' : 'incorrect' }));
        }
    };

    return {
        validationState,
        clearValidation,
        getValidationClass,
        handleSmartChange,
        handleValidationKeyDown
    };
};